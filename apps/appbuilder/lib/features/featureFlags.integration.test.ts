import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { and, eq } from "drizzle-orm";
import { closeTestDb, getTestDb, migrateTestDb, resetTestDb } from "../db/testUtils";
import { createApp } from "../repositories/apps";
import { conversationAttachments, conversationReferences, operationalEvents } from "../db/schema";
import {
  commitAttachmentContent,
  deleteAttachment,
  getAttachmentForActor,
  initAttachment,
  listConversationAttachmentsForActor,
  readAttachmentContentForActor,
} from "../repositories/attachments";
import {
  importConversationReference,
  listConversationReferencesForActor,
  listReferenceEvidenceForConversation,
} from "../repositories/references";
import { FeatureDisabledError } from "./errors";

/**
 * M13 slice G's exit criterion, stated as tests: "each feature can be
 * disabled without making history unreadable".
 *
 * Every case below follows the same two-part shape, because the criterion
 * has two halves and only checking the first is how a kill switch turns
 * into an outage:
 *
 *   1. with the flag OFF, the INGRESS path refuses; and
 *   2. with the flag OFF, everything already persisted stays readable —
 *      listable, downloadable, and still usable as grounded context.
 */

const db = getTestDb();
const owner = { principalId: "flag-owner", roles: [] };

const FLAG_VARS = [
  "APPBUILDER_ATTACHMENTS_ENABLED",
  "APPBUILDER_VISION_ENABLED",
  "APPBUILDER_CONTEXTUAL_MEMORY_ENABLED",
  "APPBUILDER_PLANNING_ENABLED",
  "APPBUILDER_URL_IMPORTS_ENABLED",
] as const;

beforeAll(async () => {
  await migrateTestDb();
});

beforeEach(async () => {
  await resetTestDb();
  for (const v of FLAG_VARS) delete process.env[v];
});

afterEach(() => {
  for (const v of FLAG_VARS) delete process.env[v];
});

afterAll(async () => {
  await closeTestDb();
});

async function makeApp(suffix: string) {
  return createApp(
    db,
    owner,
    { name: `Flag App ${suffix}`, slug: `flag-app-${suffix}-${Math.random().toString(36).slice(2, 8)}` },
    `flag-create-${suffix}`,
  );
}

const TEXT_BYTES = Buffer.from("the brand voice is warm and direct", "utf8");

async function uploadReadyAttachment(appId: string, suffix: string) {
  const attachment = await initAttachment(db, owner, appId, {
    originalFilename: `${suffix}.txt`,
    declaredMimeType: "text/plain",
    declaredSizeBytes: TEXT_BYTES.length,
    idempotencyKey: `flag-init-${suffix}`,
  });
  return commitAttachmentContent(db, owner, appId, attachment.id, TEXT_BYTES);
}

const resolveHost = async () => ["93.184.216.34"];
const constantFetch = {
  fetchImpl: (async () =>
    new Response("<body><p>Imported copy</p></body>", {
      status: 200,
      headers: { "content-type": "text/html; charset=utf-8" },
    })) as unknown as typeof fetch,
  resolveHost,
};

describe("attachments flag", () => {
  it("refuses new uploads when off", async () => {
    const app = await makeApp("att-off");
    process.env.APPBUILDER_ATTACHMENTS_ENABLED = "false";

    await expect(
      initAttachment(db, owner, app.id, {
        originalFilename: "notes.txt",
        declaredMimeType: "text/plain",
        declaredSizeBytes: TEXT_BYTES.length,
        idempotencyKey: "flag-off-init",
      }),
    ).rejects.toBeInstanceOf(FeatureDisabledError);

    expect(await db.select().from(conversationAttachments).where(eq(conversationAttachments.appId, app.id))).toHaveLength(0);
  });

  it("names the operator-facing switch, and only that — never another flag's state", async () => {
    const app = await makeApp("att-msg");
    process.env.APPBUILDER_ATTACHMENTS_ENABLED = "false";
    process.env.APPBUILDER_VISION_ENABLED = "true";

    const error: unknown = await initAttachment(db, owner, app.id, {
      originalFilename: "notes.txt",
      declaredMimeType: "text/plain",
      declaredSizeBytes: TEXT_BYTES.length,
      idempotencyKey: "flag-msg-init",
    }).then(
      () => null,
      (e: unknown) => e,
    );

    expect(error).toBeInstanceOf(FeatureDisabledError);
    const disabled = error as FeatureDisabledError;
    expect(disabled.message).toContain("APPBUILDER_ATTACHMENTS_ENABLED");
    expect(disabled.message).not.toContain("APPBUILDER_VISION_ENABLED");
    expect(disabled.flag).toBe("attachments");
  });

  it("keeps already-uploaded attachments listable, readable, and downloadable when switched off", async () => {
    const app = await makeApp("att-history");
    const ready = await uploadReadyAttachment(app.id, "history");

    process.env.APPBUILDER_ATTACHMENTS_ENABLED = "false";

    const listed = await listConversationAttachmentsForActor(db, owner, app.id);
    expect(listed.map((a) => a.id)).toContain(ready.id);
    expect(await getAttachmentForActor(db, owner, app.id, ready.id)).toMatchObject({ id: ready.id, status: "ready" });

    const content = await readAttachmentContentForActor(db, owner, app.id, ready.id);
    expect(content.bytes.toString("utf8")).toBe(TEXT_BYTES.toString("utf8"));

    // And deletion still works — a user must be able to remove their file
    // even while uploads are paused.
    await expect(deleteAttachment(db, owner, app.id, ready.id)).resolves.toMatchObject({ status: "deleted" });
  });
});

describe("URL imports flag", () => {
  it("refuses import and makes no outbound request when off", async () => {
    const app = await makeApp("url-off");
    let fetches = 0;
    const countingFetch = {
      fetchImpl: (async () => {
        fetches += 1;
        return new Response("<p>x</p>", { status: 200, headers: { "content-type": "text/html" } });
      }) as unknown as typeof fetch,
      resolveHost,
    };

    await expect(
      importConversationReference(db, owner, app.id, { url: "https://example.com/a" }, countingFetch),
    ).rejects.toBeInstanceOf(FeatureDisabledError);
    expect(fetches).toBe(0);
  });

  it("records why the import was refused, without the URL path", async () => {
    const app = await makeApp("url-event");
    await importConversationReference(
      db,
      owner,
      app.id,
      { url: "https://example.com/private/page?token=abc" },
      constantFetch,
    ).catch(() => undefined);

    const [event] = await db
      .select()
      .from(operationalEvents)
      .where(and(eq(operationalEvents.appId, app.id), eq(operationalEvents.kind, "reference.disabled_by_flag")));
    expect(event).toBeTruthy();
    expect(event.detail).toMatchObject({ host: "example.com" });
    // The path and query would turn this event stream into a log of what
    // pages an app tried to read.
    expect(JSON.stringify(event.detail)).not.toContain("private");
    expect(JSON.stringify(event.detail)).not.toContain("token");
  });

  it("keeps previously imported references listable and still grounding context when switched off", async () => {
    const app = await makeApp("url-history");
    process.env.APPBUILDER_URL_IMPORTS_ENABLED = "true";
    const imported = await importConversationReference(
      db,
      owner,
      app.id,
      { url: "https://example.com/about" },
      constantFetch,
    );

    process.env.APPBUILDER_URL_IMPORTS_ENABLED = "false";

    const listed = await listConversationReferencesForActor(db, owner, app.id);
    expect(listed.map((r) => r.id)).toContain(imported.reference.id);

    const evidence = await listReferenceEvidenceForConversation(db, app.id, imported.reference.conversationId);
    expect(evidence.length).toBeGreaterThan(0);
    // Content is still there to ground a prompt — the flag stops new
    // fetches, it does not blind the assembler to what was already fetched.
    expect(evidence[0].extractedText).toBeTruthy();

    // The row itself is untouched by the flag.
    const [row] = await db
      .select()
      .from(conversationReferences)
      .where(eq(conversationReferences.id, imported.reference.id));
    expect(row.status).toBe("ready");
    expect(row.extractedText).toBeTruthy();
  });
});

describe("flag independence", () => {
  it("disabling URL import leaves attachments working, and vice versa", async () => {
    const app = await makeApp("independent");

    process.env.APPBUILDER_URL_IMPORTS_ENABLED = "false";
    await expect(uploadReadyAttachment(app.id, "still-works")).resolves.toMatchObject({ status: "ready" });

    process.env.APPBUILDER_ATTACHMENTS_ENABLED = "false";
    process.env.APPBUILDER_URL_IMPORTS_ENABLED = "true";
    await expect(
      importConversationReference(db, owner, app.id, { url: "https://example.com/z" }, constantFetch),
    ).resolves.toMatchObject({ fetched: true });
  });
});
