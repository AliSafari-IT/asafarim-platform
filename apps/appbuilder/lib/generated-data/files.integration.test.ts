import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { and, eq } from "drizzle-orm";
import { checksumOf as specChecksumOf, ENGINE_VERSION, SPEC_SCHEMA_VERSION, type ApplicationSpecificationType } from "@asafarim/appbuilder-schema";
import { getTemplate } from "@asafarim/appbuilder-runtime";
import { closeTestDb, getTestDb, migrateTestDb, resetTestDb } from "../db/testUtils";
import { createApp } from "../repositories/apps";
import { requestPreviewBuild } from "../repositories/previewService";
import { applyTemplateVersion } from "../repositories/templateApplication";
import { generatedFiles, specifications, specificationVersions } from "../db/schema";
import { generateId } from "../db/ids";
import { ConflictError, NotFoundError } from "../errors";
import { bootstrapOwnerAsAdmin, addMember } from "./membership";
import { resolveRuntimeContext, RuntimePermissionDeniedError, type RuntimeContext } from "./runtimeAuth";
import {
  archiveFile,
  commitUpload,
  downloadFile,
  FileAccessDeniedError,
  FileTooLargeError,
  getDownloadAuthorization,
  initUpload,
  SignedLinkExpiredError,
  UnsupportedMimeTypeError,
} from "./files";

const db = getTestDb();

const owner = { principalId: "files-owner", roles: [] };
const employeePrincipal = { principalId: "files-employee", roles: [] };

beforeAll(async () => {
  await migrateTestDb();
});

beforeEach(async () => {
  await resetTestDb();
});

afterAll(async () => {
  await closeTestDb();
});

afterEach(() => {
  vi.useRealTimers();
});

/**
 * The task_management template (see taskManagement.ts) has no file/image
 * fields — this appends one more specification version onto it (a task
 * "attachment" file field restricted to PDFs, and a project "avatar"
 * image field) and re-pins, the same pattern previewService.integration.test.ts
 * uses to append a hand-built version directly.
 */
async function makeTaskAppWithFileFields(name: string, suffix: string) {
  const app = await createApp(
    db,
    owner,
    { name, slug: `${suffix}-${Math.random().toString(36).slice(2, 8)}`, description: "d", prompt: "p", starterFamily: "task_management", visibility: "private" },
    `create-${suffix}`,
  );
  const template = getTemplate("task_management");
  if (!template) throw new Error("task_management template is not registered");
  await applyTemplateVersion(db, owner, app.id, { template, baseVersionNumber: 1, idempotencyKey: `${suffix}-template` });

  const [specRow] = await db.select().from(specifications).where(eq(specifications.appId, app.id)).limit(1);
  const [currentVersion] = await db
    .select()
    .from(specificationVersions)
    .where(and(eq(specificationVersions.specificationId, specRow.id), eq(specificationVersions.versionNumber, specRow.currentVersionNumber)))
    .limit(1);
  const payload = currentVersion.payload as ApplicationSpecificationType;
  const nextPayload: ApplicationSpecificationType = {
    ...payload,
    entities: payload.entities.map((entity) => {
      if (entity.id === "task") {
        return {
          ...entity,
          fields: [
            ...entity.fields,
            {
              id: "attachment",
              machineName: "attachment",
              name: "Attachment",
              type: "file" as const,
              required: false,
              unique: false,
              archived: false,
              maxSizeMb: 1,
              acceptedMimeTypes: ["application/pdf"],
            },
          ],
        };
      }
      if (entity.id === "project") {
        // No role in the task_management template has ANY permission on
        // team_member (see taskManagement.ts) — putting the image field on
        // `project` instead (which admin has full CRUD on) keeps this
        // fixture usable without also having to extend the pinned spec
        // with team_member permissions just for this file-upload test.
        return {
          ...entity,
          fields: [
            ...entity.fields,
            {
              id: "avatar",
              machineName: "avatar",
              name: "Avatar",
              type: "image" as const,
              required: false,
              unique: false,
              archived: false,
              maxSizeMb: 2,
            },
          ],
        };
      }
      return entity;
    }),
  };
  const nextVersionNumber = specRow.currentVersionNumber + 1;
  await db.insert(specificationVersions).values({
    id: generateId(),
    specificationId: specRow.id,
    appId: app.id,
    versionNumber: nextVersionNumber,
    parentVersionId: currentVersion.id,
    schemaVersion: SPEC_SCHEMA_VERSION,
    engineVersion: ENGINE_VERSION,
    summary: "Test-only: add file/image fields",
    payload: nextPayload,
    checksum: specChecksumOf(nextPayload),
    createdByPrincipalId: owner.principalId,
  });
  await db.update(specifications).set({ currentVersionNumber: nextVersionNumber }).where(eq(specifications.id, specRow.id));
  await requestPreviewBuild(db, owner, app.id);
  return app;
}

async function adminCtx(appId: string): Promise<RuntimeContext> {
  await bootstrapOwnerAsAdmin(db, owner, appId, "admin");
  return resolveRuntimeContext(db, owner, appId);
}

describe("initUpload / commitUpload / getDownloadAuthorization / downloadFile — happy path", () => {
  it("completes the full upload → commit → authorize → download cycle using the local storage fallback", async () => {
    const app = await makeTaskAppWithFileFields("Files Happy App", "files-1");
    const ctx = await adminCtx(app.id);
    const bytes = Buffer.from("%PDF-1.4 fake pdf content");

    const { fileId } = await initUpload(db, ctx, {
      entityId: "task",
      fieldId: "attachment",
      mimeType: "application/pdf",
      sizeBytes: bytes.length,
      originalFilename: "spec.pdf",
    });

    const committed = await commitUpload(db, ctx, fileId, bytes);
    expect(committed.status).toBe("committed");

    const { token } = await getDownloadAuthorization(db, ctx, fileId);
    const downloaded = await downloadFile(db, fileId, token);
    expect(downloaded.body.equals(bytes)).toBe(true);
    expect(downloaded.filename).toBe("spec.pdf");
  });
});

describe("MIME/size allowlist enforcement", () => {
  it("rejects an unaccepted MIME type for a restricted file field", async () => {
    const app = await makeTaskAppWithFileFields("MIME Reject App", "files-2");
    const ctx = await adminCtx(app.id);
    await expect(
      initUpload(db, ctx, { entityId: "task", fieldId: "attachment", mimeType: "image/png", sizeBytes: 100, originalFilename: "x.png" }),
    ).rejects.toBeInstanceOf(UnsupportedMimeTypeError);
  });

  it("rejects a size exceeding the field's maxSizeMb", async () => {
    const app = await makeTaskAppWithFileFields("Size Reject App", "files-3");
    const ctx = await adminCtx(app.id);
    await expect(
      initUpload(db, ctx, {
        entityId: "task",
        fieldId: "attachment",
        mimeType: "application/pdf",
        sizeBytes: 2 * 1024 * 1024, // field cap is 1MB
        originalFilename: "big.pdf",
      }),
    ).rejects.toBeInstanceOf(FileTooLargeError);
  });

  it("rejects a non-image MIME type on an image field", async () => {
    const app = await makeTaskAppWithFileFields("Image Field Reject App", "files-4");
    const ctx = await adminCtx(app.id);
    await expect(
      initUpload(db, ctx, { entityId: "project", fieldId: "avatar", mimeType: "application/pdf", sizeBytes: 100, originalFilename: "x.pdf" }),
    ).rejects.toBeInstanceOf(UnsupportedMimeTypeError);
  });

  it("commitUpload rejects a byte count that does not match the declared size", async () => {
    const app = await makeTaskAppWithFileFields("Byte Mismatch App", "files-5");
    const ctx = await adminCtx(app.id);
    const { fileId } = await initUpload(db, ctx, {
      entityId: "task",
      fieldId: "attachment",
      mimeType: "application/pdf",
      sizeBytes: 10,
      originalFilename: "x.pdf",
    });
    await expect(commitUpload(db, ctx, fileId, Buffer.from("way more than ten bytes"))).rejects.toBeInstanceOf(ConflictError);
  });
});

describe("authorization", () => {
  it("initUpload requires create/update permission on the entity", async () => {
    const app = await makeTaskAppWithFileFields("Upload Perm App", "files-6");
    await addMember(db, owner, app.id, { principalId: employeePrincipal.principalId, roleIds: ["employee_role"] });
    const ctx = await resolveRuntimeContext(db, employeePrincipal, app.id);
    // employee_role has no "create" on task (see taskManagement.ts's
    // permissions array) and no recordId is supplied, so initUpload demands
    // "create".
    await expect(
      initUpload(db, ctx, { entityId: "task", fieldId: "attachment", mimeType: "application/pdf", sizeBytes: 100, originalFilename: "x.pdf" }),
    ).rejects.toBeInstanceOf(RuntimePermissionDeniedError);
  });

  it("commitUpload only allows the original uploader", async () => {
    const app = await makeTaskAppWithFileFields("Wrong Uploader App", "files-7");
    const ctx = await adminCtx(app.id);
    await addMember(db, owner, app.id, { principalId: employeePrincipal.principalId, roleIds: ["manager"] });
    const otherCtx = await resolveRuntimeContext(db, employeePrincipal, app.id);

    const { fileId } = await initUpload(db, ctx, {
      entityId: "task",
      fieldId: "attachment",
      mimeType: "application/pdf",
      sizeBytes: 5,
      originalFilename: "x.pdf",
    });
    await expect(commitUpload(db, otherCtx, fileId, Buffer.from("hello"))).rejects.toBeInstanceOf(FileAccessDeniedError);
  });

  it("downloadFile rejects a token minted for a different file id", async () => {
    const app = await makeTaskAppWithFileFields("Wrong File Token App", "files-8");
    const ctx = await adminCtx(app.id);
    const bytesA = Buffer.from("aaaa");
    const bytesB = Buffer.from("bbbb");
    const { fileId: fileIdA } = await initUpload(db, ctx, { entityId: "task", fieldId: "attachment", mimeType: "application/pdf", sizeBytes: 4, originalFilename: "a.pdf" });
    await commitUpload(db, ctx, fileIdA, bytesA);
    const { fileId: fileIdB } = await initUpload(db, ctx, { entityId: "task", fieldId: "attachment", mimeType: "application/pdf", sizeBytes: 4, originalFilename: "b.pdf" });
    await commitUpload(db, ctx, fileIdB, bytesB);

    const { token: tokenForA } = await getDownloadAuthorization(db, ctx, fileIdA);
    await expect(downloadFile(db, fileIdB, tokenForA)).rejects.toBeInstanceOf(FileAccessDeniedError);
  });
});

describe("signed download link expiry", () => {
  it("rejects a download after the signed link's TTL has elapsed", async () => {
    const app = await makeTaskAppWithFileFields("Expiry App", "files-9");
    const ctx = await adminCtx(app.id);
    const bytes = Buffer.from("expiring content");
    const { fileId } = await initUpload(db, ctx, { entityId: "task", fieldId: "attachment", mimeType: "application/pdf", sizeBytes: bytes.length, originalFilename: "x.pdf" });
    await commitUpload(db, ctx, fileId, bytes);

    const { token } = await getDownloadAuthorization(db, ctx, fileId);

    vi.useFakeTimers();
    vi.setSystemTime(Date.now() + 6 * 60_000); // TTL is 5 minutes
    await expect(downloadFile(db, fileId, token)).rejects.toBeInstanceOf(SignedLinkExpiredError);
  });

  it("a malformed token is rejected as expired/invalid, never crashes", async () => {
    const app = await makeTaskAppWithFileFields("Malformed Token App", "files-10");
    const ctx = await adminCtx(app.id);
    const bytes = Buffer.from("x");
    const { fileId } = await initUpload(db, ctx, { entityId: "task", fieldId: "attachment", mimeType: "application/pdf", sizeBytes: 1, originalFilename: "x.pdf" });
    await commitUpload(db, ctx, fileId, bytes);
    await expect(downloadFile(db, fileId, "not-a-real-token")).rejects.toBeInstanceOf(SignedLinkExpiredError);
  });
});

describe("archiveFile", () => {
  it("archives a committed file and is idempotent", async () => {
    const app = await makeTaskAppWithFileFields("Archive File App", "files-11");
    const ctx = await adminCtx(app.id);
    const { fileId } = await initUpload(db, ctx, { entityId: "task", fieldId: "attachment", mimeType: "application/pdf", sizeBytes: 3, originalFilename: "x.pdf" });
    await commitUpload(db, ctx, fileId, Buffer.from("abc"));

    const archived = await archiveFile(db, ctx, fileId);
    expect(archived.status).toBe("archived");
    const second = await archiveFile(db, ctx, fileId);
    expect(second.status).toBe("archived");

    const [row] = await db.select().from(generatedFiles).where(eq(generatedFiles.id, fileId));
    expect(row.status).toBe("archived");
  });

  it("throws NotFoundError for a file id from a different app", async () => {
    const appOne = await makeTaskAppWithFileFields("Archive Isolation One", "files-12");
    const appTwo = await makeTaskAppWithFileFields("Archive Isolation Two", "files-13");
    const ctxOne = await adminCtx(appOne.id);
    await bootstrapOwnerAsAdmin(db, owner, appTwo.id, "admin");
    const ctxTwo = await resolveRuntimeContext(db, owner, appTwo.id);

    const { fileId } = await initUpload(db, ctxOne, { entityId: "task", fieldId: "attachment", mimeType: "application/pdf", sizeBytes: 3, originalFilename: "x.pdf" });
    await expect(archiveFile(db, ctxTwo, fileId)).rejects.toBeInstanceOf(NotFoundError);
  });
});
