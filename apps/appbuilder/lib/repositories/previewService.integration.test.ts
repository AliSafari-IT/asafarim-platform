import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import { REGISTRY_VERSION } from "@asafarim/appbuilder-runtime";
import { checksumOf, ENGINE_VERSION, SPEC_SCHEMA_VERSION } from "@asafarim/appbuilder-schema";
import { closeTestDb, getTestDb, migrateTestDb, resetTestDb } from "../db/testUtils";
import { archiveApp, createApp } from "./apps";
import { addCollaborator } from "./collaborators";
import { getPinnedPreview, requestPreviewBuild } from "./previewService";
import { auditEvents, previewBuilds, specifications, specificationVersions } from "../db/schema";
import { ConflictError, ForbiddenError, NotFoundError } from "../errors";
import { generateId } from "../db/ids";

const db = getTestDb();

const owner = { principalId: "preview-owner", roles: [] };
const editor = { principalId: "preview-editor", roles: [] };
const viewer = { principalId: "preview-viewer", roles: [] };
const unrelated = { principalId: "preview-unrelated", roles: [] };

beforeAll(async () => {
  await migrateTestDb();
});

beforeEach(async () => {
  await resetTestDb();
});

afterAll(async () => {
  await closeTestDb();
});

async function makeApp(actor: typeof owner, name: string, slugSuffix: string, idempotencyKey: string) {
  return createApp(
    db,
    actor,
    {
      name,
      slug: `${slugSuffix}-${Math.random().toString(36).slice(2, 8)}`,
      description: `${name} description`,
      prompt: `Build an app for: ${name}`,
      starterFamily: "blank",
      visibility: "private",
    },
    idempotencyKey,
  );
}

describe("requestPreviewBuild", () => {
  it("creates a succeeded build for a fresh (empty) specification and pins it", async () => {
    const app = await makeApp(owner, "Preview App", "preview-app", "preview-create-1");

    const { build, reused } = await requestPreviewBuild(db, owner, app.id);
    expect(reused).toBe(false);
    expect(build.status).toBe("succeeded");
    expect(build.registryVersion).toBe(REGISTRY_VERSION);
    expect(build.checksum).toBeTruthy();

    const [spec] = await db.select().from(specifications).where(eq(specifications.appId, app.id));
    expect(spec.pinnedPreviewBuildId).toBe(build.id);
  });

  it("is idempotent: a second request for the same version+registry reuses the existing build without creating a duplicate row", async () => {
    const app = await makeApp(owner, "Idempotent App", "idempotent-app", "preview-create-2");

    const first = await requestPreviewBuild(db, owner, app.id);
    const second = await requestPreviewBuild(db, owner, app.id);

    expect(second.reused).toBe(true);
    expect(second.build.id).toBe(first.build.id);

    const rows = await db.select().from(previewBuilds).where(eq(previewBuilds.appId, app.id));
    expect(rows).toHaveLength(1);
  });

  it("writes an audit event on a successful build", async () => {
    const app = await makeApp(owner, "Audited App", "audited-app", "preview-create-3");
    await requestPreviewBuild(db, owner, app.id);

    const events = await db.select().from(auditEvents).where(eq(auditEvents.appId, app.id));
    expect(events.some((event) => event.action === "preview.build.succeeded")).toBe(true);
  });

  it("preserves the last successful preview when a later version's build attempt fails", async () => {
    const app = await makeApp(owner, "Preserve App", "preserve-app", "preview-create-4");
    const { build: firstBuild } = await requestPreviewBuild(db, owner, app.id);
    expect(firstBuild.status).toBe("succeeded");

    // Append a second specification version (bypassing the M04 operation
    // engine directly, the same way specificationEngine.integration.test.ts
    // seeds versions) whose only page is archived — a realistic way a
    // homepage can stop resolving without the specification itself being
    // malformed (validateSpecification still passes; the renderer's own
    // homepage resolution is what fails).
    const [spec] = await db.select().from(specifications).where(eq(specifications.appId, app.id));
    const brokenPayload = {
      schemaVersion: SPEC_SCHEMA_VERSION,
      app: { name: "Preserve App", slug: app.slug },
      branding: { theme: "system" },
      entities: [],
      relations: [],
      roles: [],
      permissions: [],
      navigation: [],
      pages: [{ id: "gone", name: "Gone", path: "gone", archived: true, components: [] }],
      dashboard: { widgets: [] },
      actions: [],
      workflows: [],
    };
    await db.insert(specificationVersions).values({
      id: generateId(),
      specificationId: spec.id,
      appId: app.id,
      versionNumber: 2,
      parentVersionId: firstBuild.specificationVersionId,
      schemaVersion: SPEC_SCHEMA_VERSION,
      engineVersion: ENGINE_VERSION,
      summary: "Manually appended broken version (test only)",
      payload: brokenPayload,
      checksum: checksumOf(brokenPayload),
      createdByPrincipalId: owner.principalId,
    });
    await db.update(specifications).set({ currentVersionNumber: 2 }).where(eq(specifications.id, spec.id));

    const { build: secondBuild } = await requestPreviewBuild(db, owner, app.id);
    expect(secondBuild.status).toBe("failed");
    expect(secondBuild.diagnostics).toBeTruthy();

    const [specAfter] = await db.select().from(specifications).where(eq(specifications.appId, app.id));
    // The pinned pointer must still be the earlier successful build, not the failed one.
    expect(specAfter.pinnedPreviewBuildId).toBe(firstBuild.id);

    const pinned = await getPinnedPreview(db, owner, app.id);
    expect(pinned?.build.id).toBe(firstBuild.id);
  });

  it("marks a build failed when a version's stored checksum no longer matches its payload (corruption)", async () => {
    const app = await makeApp(owner, "Checksum App", "checksum-app", "preview-create-4b");
    const [spec] = await db.select().from(specifications).where(eq(specifications.appId, app.id));
    await db
      .update(specificationVersions)
      .set({ checksum: "deliberately-wrong-checksum" })
      .where(eq(specificationVersions.specificationId, spec.id));

    const { build } = await requestPreviewBuild(db, owner, app.id);
    expect(build.status).toBe("failed");
    expect(build.diagnostics).toBeTruthy();

    const [specAfter] = await db.select().from(specifications).where(eq(specifications.appId, app.id));
    expect(specAfter.pinnedPreviewBuildId).toBeNull();
  });

  it("requires app.editSpecification — a viewer cannot request a preview build", async () => {
    const app = await makeApp(owner, "Viewer App", "viewer-app", "preview-create-5");
    await addCollaborator(db, owner, app.id, viewer.principalId, "viewer");
    await expect(requestPreviewBuild(db, viewer, app.id)).rejects.toBeInstanceOf(ForbiddenError);
  });

  it("an editor can request a preview build", async () => {
    const app = await makeApp(owner, "Editor App", "editor-app", "preview-create-6");
    await addCollaborator(db, owner, app.id, editor.principalId, "editor");
    const { build } = await requestPreviewBuild(db, editor, app.id);
    expect(build.status).toBe("succeeded");
  });

  it("an unrelated actor gets NotFoundError, not ForbiddenError (leak-prevention)", async () => {
    const app = await makeApp(owner, "Isolated App", "isolated-app", "preview-create-7");
    await expect(requestPreviewBuild(db, unrelated, app.id)).rejects.toBeInstanceOf(NotFoundError);
  });

  it("is blocked on an archived app (ConflictError) — editing capabilities are suspended", async () => {
    const app = await makeApp(owner, "Archived App", "archived-app", "preview-create-8");
    await archiveApp(db, owner, app.id);
    await expect(requestPreviewBuild(db, owner, app.id)).rejects.toBeInstanceOf(ConflictError);
  });
});

describe("getPinnedPreview", () => {
  it("returns null when no preview has been requested yet", async () => {
    const app = await makeApp(owner, "No Preview App", "no-preview-app", "preview-create-9");
    expect(await getPinnedPreview(db, owner, app.id)).toBeNull();
  });

  it("returns the pinned build and its specification payload after a successful build", async () => {
    const app = await makeApp(owner, "Pinned App", "pinned-app", "preview-create-10");
    const { build } = await requestPreviewBuild(db, owner, app.id);

    const pinned = await getPinnedPreview(db, owner, app.id);
    expect(pinned?.build.id).toBe(build.id);
    expect(pinned?.specificationPayload.app.name).toBe("Pinned App");
  });

  it("a viewer can read the pinned preview (app.viewPreview is a viewer-level capability)", async () => {
    const app = await makeApp(owner, "Viewer Read App", "viewer-read-app", "preview-create-11");
    await requestPreviewBuild(db, owner, app.id);
    await addCollaborator(db, owner, app.id, viewer.principalId, "viewer");

    const pinned = await getPinnedPreview(db, viewer, app.id);
    expect(pinned).not.toBeNull();
  });

  it("an unrelated actor gets NotFoundError, never a peek at another owner's pinned preview", async () => {
    const app = await makeApp(owner, "Cross Owner App", "cross-owner-app", "preview-create-12");
    await requestPreviewBuild(db, owner, app.id);
    await expect(getPinnedPreview(db, unrelated, app.id)).rejects.toBeInstanceOf(NotFoundError);
  });

  it("still resolves the pinned preview on an archived app (viewPreview stays allowed while archived)", async () => {
    const app = await makeApp(owner, "Archived Viewable App", "archived-viewable-app", "preview-create-13");
    await requestPreviewBuild(db, owner, app.id);
    await archiveApp(db, owner, app.id);

    const pinned = await getPinnedPreview(db, owner, app.id);
    expect(pinned).not.toBeNull();
  });
});
