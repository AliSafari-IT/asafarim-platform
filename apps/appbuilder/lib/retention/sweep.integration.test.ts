import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { and, eq } from "drizzle-orm";
import {
  closeTestDb,
  getTestDb,
  migrateTestDb,
  resetTestDb,
} from "../db/testUtils";
import { createApp } from "../repositories/apps";
import { enqueueValidationRun } from "../repositories/validationRuns";
import { initAttachment, commitAttachmentContent } from "../repositories/attachments";
import {
  validationArtifacts,
  operationalEvents,
  conversationAttachments,
  conversationMemories,
  conversationMessages,
} from "../db/schema";
import { generateId } from "../db/ids";
import { sweepExpiredValidationArtifacts, sweepOrphanedMemoryFacts, sweepUnclaimedAttachments } from "./sweep";
import { appendUserMessage } from "../repositories/conversations";
import { recordResolvedReference } from "../repositories/conversationMemory";

const db = getTestDb();
const owner = { principalId: "sweep-owner", roles: [] };

beforeAll(async () => {
  await migrateTestDb();
});

beforeEach(async () => {
  await resetTestDb();
});

afterAll(async () => {
  await closeTestDb();
});

async function seedArtifact(
  appId: string,
  runId: string,
  retentionExpiresAt: Date | null
) {
  const [row] = await db
    .insert(validationArtifacts)
    .values({
      id: generateId(),
      runId,
      appId,
      kind: "screenshot",
      label: "test artifact",
      storageKey: `validation/${generateId()}.png`,
      contentType: "image/png",
      sizeBytes: 10,
      retentionExpiresAt,
    })
    .returning();
  return row;
}

describe("sweepExpiredValidationArtifacts", () => {
  it("dry run reports eligible rows without deleting anything", async () => {
    const app = await createApp(
      db,
      owner,
      { name: "Sweep App", slug: "sweep-app" },
      "sweep-key"
    );
    const run = await enqueueValidationRun(db, owner, app.id, {
      idempotencyKey: "sweep-run-1",
      requestSource: "manual",
    });

    const expired = await seedArtifact(
      app.id,
      run.id,
      new Date(Date.now() - 86_400_000)
    );
    await seedArtifact(app.id, run.id, new Date(Date.now() + 86_400_000)); // not yet expired

    const result = await sweepExpiredValidationArtifacts(db, { dryRun: true });
    expect(result).toEqual({
      category: "validation_artifacts",
      eligible: 1,
      deleted: 0,
      dryRun: true,
    });

    const stillThere = await db
      .select()
      .from(validationArtifacts)
      .where(eq(validationArtifacts.id, expired.id));
    expect(stillThere).toHaveLength(1);
  });

  it("applies the sweep, deletes only expired rows, and records an operational event", async () => {
    const app = await createApp(
      db,
      owner,
      { name: "Sweep App 2", slug: "sweep-app-2" },
      "sweep-key-2"
    );
    const run = await enqueueValidationRun(db, owner, app.id, {
      idempotencyKey: "sweep-run-2",
      requestSource: "manual",
    });

    const expired = await seedArtifact(
      app.id,
      run.id,
      new Date(Date.now() - 86_400_000)
    );
    const fresh = await seedArtifact(
      app.id,
      run.id,
      new Date(Date.now() + 86_400_000)
    );

    const result = await sweepExpiredValidationArtifacts(db, { dryRun: false });
    expect(result).toEqual({
      category: "validation_artifacts",
      eligible: 1,
      deleted: 1,
      dryRun: false,
    });

    expect(
      await db
        .select()
        .from(validationArtifacts)
        .where(eq(validationArtifacts.id, expired.id))
    ).toHaveLength(0);
    expect(
      await db
        .select()
        .from(validationArtifacts)
        .where(eq(validationArtifacts.id, fresh.id))
    ).toHaveLength(1);

    const events = await db
      .select()
      .from(operationalEvents)
      .where(eq(operationalEvents.kind, "retention.swept"));
    expect(events).toHaveLength(1);
    expect(events[0].detail).toMatchObject({
      table: "validation_artifacts",
      deleted: 1,
    });
  });

  it("is a no-op when nothing is eligible", async () => {
    const result = await sweepExpiredValidationArtifacts(db, { dryRun: false });
    expect(result).toEqual({
      category: "validation_artifacts",
      eligible: 0,
      deleted: 0,
      dryRun: false,
    });
  });
});

const PNG_1X1 = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=",
  "base64",
);

describe("sweepUnclaimedAttachments", () => {
  it("deletes a still-pending attachment older than 24h, leaves a fresh one untouched", async () => {
    const app = await createApp(db, owner, { name: "Sweep Attach App", slug: "sweep-attach-app" }, "sweep-attach-key");

    const stale = await initAttachment(db, owner, app.id, {
      originalFilename: "old.png",
      declaredMimeType: "image/png",
      declaredSizeBytes: PNG_1X1.length,
      idempotencyKey: "sweep-attach-stale",
    });
    await db
      .update(conversationAttachments)
      .set({ createdAt: new Date(Date.now() - 25 * 60 * 60 * 1000) })
      .where(eq(conversationAttachments.id, stale.id));

    const fresh = await initAttachment(db, owner, app.id, {
      originalFilename: "new.png",
      declaredMimeType: "image/png",
      declaredSizeBytes: PNG_1X1.length,
      idempotencyKey: "sweep-attach-fresh",
    });

    const result = await sweepUnclaimedAttachments(db, { dryRun: false });
    expect(result).toEqual({ category: "conversation_attachments", eligible: 1, deleted: 1, dryRun: false });

    expect(await db.select().from(conversationAttachments).where(eq(conversationAttachments.id, stale.id))).toHaveLength(0);
    expect(await db.select().from(conversationAttachments).where(eq(conversationAttachments.id, fresh.id))).toHaveLength(1);
  });

  it("dry run reports eligible rows without deleting anything", async () => {
    const app = await createApp(db, owner, { name: "Sweep Attach Dry", slug: "sweep-attach-dry" }, "sweep-attach-dry-key");
    const stale = await initAttachment(db, owner, app.id, {
      originalFilename: "old.png",
      declaredMimeType: "image/png",
      declaredSizeBytes: PNG_1X1.length,
      idempotencyKey: "sweep-attach-dry-stale",
    });
    await db
      .update(conversationAttachments)
      .set({ createdAt: new Date(Date.now() - 25 * 60 * 60 * 1000) })
      .where(eq(conversationAttachments.id, stale.id));

    const result = await sweepUnclaimedAttachments(db, { dryRun: true });
    expect(result).toEqual({ category: "conversation_attachments", eligible: 1, deleted: 0, dryRun: true });
    expect(await db.select().from(conversationAttachments).where(eq(conversationAttachments.id, stale.id))).toHaveLength(1);
  });

  it("never sweeps a ready attachment, no matter its age", async () => {
    const app = await createApp(db, owner, { name: "Sweep Attach Ready", slug: "sweep-attach-ready" }, "sweep-attach-ready-key");
    const attachment = await initAttachment(db, owner, app.id, {
      originalFilename: "old.png",
      declaredMimeType: "image/png",
      declaredSizeBytes: PNG_1X1.length,
      idempotencyKey: "sweep-attach-ready-1",
    });
    await commitAttachmentContent(db, owner, app.id, attachment.id, PNG_1X1);
    await db
      .update(conversationAttachments)
      .set({ createdAt: new Date(Date.now() - 25 * 60 * 60 * 1000) })
      .where(eq(conversationAttachments.id, attachment.id));

    const result = await sweepUnclaimedAttachments(db, { dryRun: false });
    expect(result).toEqual({ category: "conversation_attachments", eligible: 0, deleted: 0, dryRun: false });
    expect(await db.select().from(conversationAttachments).where(eq(conversationAttachments.id, attachment.id))).toHaveLength(1);
  });
});

/**
 * M13 slice G — "Delete memory when source messages are deleted".
 *
 * A memory fact is a claim derived from specific turns and carries the ids
 * of the messages that produced it. Once every one of those is gone, the
 * fact is a derived copy of deleted content that would keep steering
 * interpretation — and one whose evidence nobody can inspect any more.
 */
describe("sweepOrphanedMemoryFacts", () => {
  async function seedMemory(suffix: string) {
    const app = await createApp(
      db,
      owner,
      { name: `Sweep Memory ${suffix}`, slug: `sweep-memory-${suffix}` },
      `sweep-memory-${suffix}-key`,
    );
    const { message } = await appendUserMessage(db, owner, app.id, {
      content: "call the Home page title 'the title'",
      selectionContext: null,
      baseVersionNumber: 1,
    });
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
    return { app, message };
  }

  it("keeps a fact whose source message still exists", async () => {
    const { app } = await seedMemory("kept");
    const result = await sweepOrphanedMemoryFacts(db, { dryRun: false });
    expect(result.deleted).toBe(0);

    const [memory] = await db.select().from(conversationMemories).where(eq(conversationMemories.appId, app.id));
    expect(memory.references).toHaveLength(1);
  });

  it("removes a fact once every source message is gone", async () => {
    const { app, message } = await seedMemory("orphaned");
    await db.delete(conversationMessages).where(eq(conversationMessages.id, message.id));

    const result = await sweepOrphanedMemoryFacts(db, { dryRun: false });
    expect(result.deleted).toBe(1);

    const [memory] = await db.select().from(conversationMemories).where(eq(conversationMemories.appId, app.id));
    // The ROW survives — one row per conversation is a unique-indexed
    // invariant, and empty arrays are the correct "no memory" state.
    expect(memory).toBeTruthy();
    expect(memory.references).toEqual([]);
    expect(memory.revision).toBeGreaterThan(0);
  });

  it("dry run reports without writing", async () => {
    const { app, message } = await seedMemory("dry");
    await db.delete(conversationMessages).where(eq(conversationMessages.id, message.id));

    const result = await sweepOrphanedMemoryFacts(db, { dryRun: true });
    expect(result).toMatchObject({ category: "conversation_memories", eligible: 1, deleted: 0, dryRun: true });

    const [memory] = await db.select().from(conversationMemories).where(eq(conversationMemories.appId, app.id));
    expect(memory.references).toHaveLength(1);
  });

  it("records an app-scoped event so the deletion is visible per app, not only in a log line", async () => {
    const { app, message } = await seedMemory("event");
    await db.delete(conversationMessages).where(eq(conversationMessages.id, message.id));
    await sweepOrphanedMemoryFacts(db, { dryRun: false });

    const events = await db
      .select()
      .from(operationalEvents)
      .where(and(eq(operationalEvents.appId, app.id), eq(operationalEvents.kind, "retention.swept")));
    expect(events.some((e) => (e.detail as Record<string, unknown>).table === "conversation_memories")).toBe(true);
  });
});
