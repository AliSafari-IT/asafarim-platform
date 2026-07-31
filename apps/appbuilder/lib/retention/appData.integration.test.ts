import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import { closeTestDb, getTestDb, migrateTestDb, resetTestDb } from "../db/testUtils";
import { createApp } from "../repositories/apps";
import { addCollaborator } from "../repositories/collaborators";
import {
  auditEvents,
  conversationAttachments,
  conversationMemories,
  conversationMessages,
  conversationReferences,
  modificationJobs,
  specifications,
} from "../db/schema";
import { commitAttachmentContent, initAttachment } from "../repositories/attachments";
import { importConversationReference } from "../repositories/references";
import { appendUserMessage } from "../repositories/conversations";
import { recordResolvedReference } from "../repositories/conversationMemory";
import { NotFoundError } from "../errors";
import { ERASED_CONTENT_PLACEHOLDER, eraseAppData, exportAppData } from "./appData";

/**
 * M13 slice G — "deletion/export are complete."
 *
 * The two things these tests are really guarding:
 *
 * - an export that quietly omits a category is worse than no export, because
 *   the owner believes they have everything; and
 * - an erasure that leaves a second copy of the content behind (extracted
 *   text, memory facts, the job's stored request text) has not erased
 *   anything an attacker or a subpoena would care about.
 */

const db = getTestDb();
const owner = { principalId: "erasure-owner", roles: [] };
const editor = { principalId: "erasure-editor", roles: [] };
const viewer = { principalId: "erasure-viewer", roles: [] };
const unrelated = { principalId: "erasure-unrelated", roles: [] };

const FILE_TEXT = "Our tone of voice is warm, direct, and never salesy.";
const FILE_BYTES = Buffer.from(FILE_TEXT, "utf8");
const REMOTE_TEXT = "Imported third-party bio copy";

const resolveHost = async () => ["93.184.216.34"];
const constantFetch = {
  fetchImpl: (async () =>
    new Response(`<body><p>${REMOTE_TEXT}</p></body>`, {
      status: 200,
      headers: { "content-type": "text/html; charset=utf-8" },
    })) as unknown as typeof fetch,
  resolveHost,
};

beforeAll(async () => {
  await migrateTestDb();
});

beforeEach(async () => {
  await resetTestDb();
  process.env.APPBUILDER_URL_IMPORTS_ENABLED = "true";
});

afterEach(() => {
  delete process.env.APPBUILDER_URL_IMPORTS_ENABLED;
});

afterAll(async () => {
  await closeTestDb();
});

/** An app carrying one of everything M13 persists. */
async function makePopulatedApp(suffix: string) {
  const app = await createApp(
    db,
    owner,
    { name: `Erasure App ${suffix}`, slug: `erasure-${suffix}-${Math.random().toString(36).slice(2, 8)}` },
    `erasure-create-${suffix}`,
  );

  const attachment = await initAttachment(db, owner, app.id, {
    originalFilename: "brand.txt",
    declaredMimeType: "text/plain",
    declaredSizeBytes: FILE_BYTES.length,
    idempotencyKey: `erasure-init-${suffix}`,
  });
  await commitAttachmentContent(db, owner, app.id, attachment.id, FILE_BYTES);

  const { message } = await appendUserMessage(db, owner, app.id, {
    content: "Please match the tone in the attached brand guide.",
    selectionContext: null,
    baseVersionNumber: 1,
    attachmentIds: [attachment.id],
  });

  await importConversationReference(db, owner, app.id, { url: "https://example.com/about" }, constantFetch);

  await recordResolvedReference(db, {
    appId: app.id,
    conversationId: message.conversationId,
    specificationVersionNumber: 1,
    reference: {
      phrase: "the title",
      targetId: "pages.home.name",
      property: "name",
      recordedValue: "Home",
      pageId: "home",
      sourceMessageIds: [message.id],
      specificationVersionNumber: 1,
      recordedAt: new Date().toISOString(),
    },
  });

  return { app, attachmentId: attachment.id, messageId: message.id, conversationId: message.conversationId };
}

describe("exportAppData — authorization", () => {
  it("is owner-only: an editor and a viewer are both refused", async () => {
    const { app } = await makePopulatedApp("authz");
    await addCollaborator(db, owner, app.id, editor.principalId, "editor");
    await addCollaborator(db, owner, app.id, viewer.principalId, "viewer");

    await expect(exportAppData(db, editor, app.id)).rejects.toThrow();
    await expect(exportAppData(db, viewer, app.id)).rejects.toThrow();
  });

  it("gives an unrelated actor an indistinguishable NotFoundError", async () => {
    const { app } = await makePopulatedApp("authz-cross");
    await expect(exportAppData(db, unrelated, app.id)).rejects.toBeInstanceOf(NotFoundError);
  });
});

describe("exportAppData — completeness", () => {
  it("includes every M13 category with its actual content", async () => {
    const { app, attachmentId, messageId } = await makePopulatedApp("complete");
    const exported = await exportAppData(db, owner, app.id);

    expect(exported.conversation.messages.map((m) => m.id)).toContain(messageId);
    expect(exported.conversation.messages.some((m) => m.content.includes("brand guide"))).toBe(true);

    const file = exported.attachments.find((a) => a.id === attachmentId)!;
    expect(file.originalFilename).toBe("brand.txt");
    // The extracted text is a second copy of the user's file, so an export
    // that omitted it would not be an export of their data.
    expect(file.extractedText).toContain("warm, direct");
    expect(file.sha256).toBeTruthy();

    expect(exported.references[0].sourceUrl).toBe("https://example.com/about");
    expect(exported.references[0].extractedText).toContain(REMOTE_TEXT);

    expect(exported.memory!.references.length).toBeGreaterThan(0);
    expect(exported.modificationJobs.length).toBeGreaterThan(0);
    expect(exported.retentionPolicies.length).toBeGreaterThan(0);
  });

  it("never returns a storage key", async () => {
    const { app } = await makePopulatedApp("no-keys");
    const [row] = await db.select().from(conversationAttachments).where(eq(conversationAttachments.appId, app.id));
    const serialized = JSON.stringify(await exportAppData(db, owner, app.id));
    expect(serialized).not.toContain(row.storageKey);
  });

  it("names what it does not include rather than omitting it silently", async () => {
    const { app } = await makePopulatedApp("honest");
    const exported = await exportAppData(db, owner, app.id);
    expect(exported.notIncluded.join(" ")).toMatch(/bytes/i);
    expect(exported.formatVersion).toBeTruthy();
  });

  it("exports only this app's data", async () => {
    const a = await makePopulatedApp("scope-a");
    const b = await makePopulatedApp("scope-b");
    const exported = await exportAppData(db, owner, a.app.id);
    expect(exported.conversation.messages.map((m) => m.id)).not.toContain(b.messageId);
    expect(exported.attachments.map((x) => x.id)).not.toContain(b.attachmentId);
  });

  it("records the export in the audit trail", async () => {
    const { app } = await makePopulatedApp("audited");
    await exportAppData(db, owner, app.id);
    const events = await db.select().from(auditEvents).where(eq(auditEvents.appId, app.id));
    expect(events.map((e) => e.action)).toContain("app.data_exported");
  });
});

describe("eraseAppData", () => {
  it("is owner-only", async () => {
    const { app } = await makePopulatedApp("erase-authz");
    await addCollaborator(db, owner, app.id, editor.principalId, "editor");
    await expect(eraseAppData(db, editor, app.id)).rejects.toThrow();
  });

  it("leaves no second copy of the content anywhere", async () => {
    const { app, conversationId } = await makePopulatedApp("erase-content");
    await eraseAppData(db, owner, app.id);

    const [attachment] = await db
      .select()
      .from(conversationAttachments)
      .where(eq(conversationAttachments.appId, app.id));
    expect(attachment.status).toBe("deleted");
    expect(attachment.extractedText).toBeNull();

    const [reference] = await db
      .select()
      .from(conversationReferences)
      .where(eq(conversationReferences.appId, app.id));
    expect(reference.extractedText).toBeNull();
    expect(reference.facts).toEqual([]);

    const [memory] = await db
      .select()
      .from(conversationMemories)
      .where(eq(conversationMemories.conversationId, conversationId));
    expect(memory.references).toEqual([]);

    const messages = await db.select().from(conversationMessages).where(eq(conversationMessages.appId, app.id));
    for (const message of messages) expect(message.content).toBe(ERASED_CONTENT_PLACEHOLDER);

    const jobs = await db.select().from(modificationJobs).where(eq(modificationJobs.appId, app.id));
    for (const job of jobs) expect(job.userRequestText).toBe(ERASED_CONTENT_PLACEHOLDER);
  });

  it("keeps the app, its specification, and the row skeletons so history stays coherent", async () => {
    const { app, messageId } = await makePopulatedApp("erase-skeleton");
    const before = await db.select().from(conversationMessages).where(eq(conversationMessages.appId, app.id));

    await eraseAppData(db, owner, app.id);

    const after = await db.select().from(conversationMessages).where(eq(conversationMessages.appId, app.id));
    expect(after).toHaveLength(before.length);
    expect(after.map((m) => m.id)).toContain(messageId);
    // Type and timestamps survive: the workspace can still render "a request
    // was made here", which a deleted row could not.
    expect(after.every((m) => m.messageType && m.createdAt)).toBe(true);

    expect(await db.select().from(specifications).where(eq(specifications.appId, app.id))).toHaveLength(1);
  });

  it("keeps the audit trail, including evidence of the erasure itself", async () => {
    const { app } = await makePopulatedApp("erase-audit");
    await eraseAppData(db, owner, app.id);
    const events = await db.select().from(auditEvents).where(eq(auditEvents.appId, app.id));
    expect(events.map((e) => e.action)).toContain("app.data_erased");
    // An erasure that erased its own evidence would be unauditable.
    expect(events.length).toBeGreaterThan(1);
  });

  it("does not touch another app's data", async () => {
    const a = await makePopulatedApp("erase-scope-a");
    const b = await makePopulatedApp("erase-scope-b");
    await eraseAppData(db, owner, a.app.id);

    const [other] = await db
      .select()
      .from(conversationAttachments)
      .where(eq(conversationAttachments.appId, b.app.id));
    expect(other.status).toBe("ready");
    expect(other.extractedText).toContain("warm, direct");
  });

  it("is idempotent, and a repeat erasure does not rewrite the original deletion timestamp", async () => {
    const { app } = await makePopulatedApp("erase-twice");
    const first = await eraseAppData(db, owner, app.id);
    const deletedAtAfterFirst = await attachmentDeletedAt(app.id);

    const second = await eraseAppData(db, owner, app.id, new Date(Date.now() + 60_000));
    expect(second.messagesTombstoned).toBe(first.messagesTombstoned);

    // `deleted_at` is audit evidence of when the file actually went away.
    // The second pass finds the row already tombstoned and must leave that
    // timestamp alone.
    expect((await attachmentDeletedAt(app.id)).getTime()).toBe(deletedAtAfterFirst.getTime());
  });

  it("leaves an export afterwards that shows the skeleton and no content", async () => {
    const { app } = await makePopulatedApp("erase-then-export");
    await eraseAppData(db, owner, app.id);

    const exported = await exportAppData(db, owner, app.id);
    expect(exported.conversation.messages.length).toBeGreaterThan(0);
    expect(exported.conversation.messages.every((m) => m.content === ERASED_CONTENT_PLACEHOLDER)).toBe(true);
    expect(exported.attachments.every((a) => a.extractedText === null)).toBe(true);
    expect(JSON.stringify(exported)).not.toContain("warm, direct");
    expect(JSON.stringify(exported)).not.toContain(REMOTE_TEXT);
  });
});

async function attachmentDeletedAt(appId: string): Promise<Date> {
  const [row] = await db
    .select()
    .from(conversationAttachments)
    .where(eq(conversationAttachments.appId, appId));
  return row.deletedAt!;
}
