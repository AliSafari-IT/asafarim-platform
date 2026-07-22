import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import { closeTestDb, getTestDb, migrateTestDb, resetTestDb } from "../db/testUtils";
import { createApp } from "./apps";
import { addCollaborator } from "./collaborators";
import { appendUserMessage } from "./conversations";
import {
  enqueueModificationJob,
  getLatestModificationJobForActor,
  getModificationJobByIdempotencyKey,
  requestCancellation,
} from "./modificationJobs";
import { modificationJobs, auditEvents } from "../db/schema";
import { ConflictError, ForbiddenError, NotFoundError } from "../errors";
import { MODIFICATION_LIMITS } from "../modification/limits";

const db = getTestDb();
const owner = { principalId: "modrepo-owner", roles: [] };
const editor = { principalId: "modrepo-editor", roles: [] };
const viewer = { principalId: "modrepo-viewer", roles: [] };
const unrelated = { principalId: "modrepo-unrelated", roles: [] };

beforeAll(async () => {
  await migrateTestDb();
});

beforeEach(async () => {
  await resetTestDb();
});

afterAll(async () => {
  await closeTestDb();
});

async function makeAppWithMessage(name: string, suffix: string) {
  const app = await createApp(db, owner, { name, slug: `${name.toLowerCase().replace(/\s+/g, "-")}-${suffix}` }, `create-${suffix}`);
  const { message } = await appendUserMessage(db, owner, app.id, { content: "Do something.", selectionContext: null, baseVersionNumber: 1 });
  return { app, message };
}

describe("enqueueModificationJob", () => {
  it("creates a queued job bound to the triggering message and the app's base version", async () => {
    const { app, message } = await makeAppWithMessage("Enqueue App", "1");
    const job = await enqueueModificationJob(db, owner, app.id, {
      conversationId: message.conversationId,
      triggeringMessageId: message.id,
      userRequestText: "Do something.",
      selectionContext: null,
      idempotencyKey: "mj-1",
    });
    expect(job.status).toBe("queued");
    expect(job.triggeringMessageId).toBe(message.id);
    expect(job.baseVersionNumber).toBe(1);
    expect(job.initiatedByPrincipalId).toBe(owner.principalId);
  });

  it("is idempotent: same key + payload replays the same job", async () => {
    const { app, message } = await makeAppWithMessage("Idempotent App", "2");
    const input = {
      conversationId: message.conversationId,
      triggeringMessageId: message.id,
      userRequestText: "Do something.",
      selectionContext: null,
      idempotencyKey: "mj-2",
    };
    const first = await enqueueModificationJob(db, owner, app.id, input);
    const second = await enqueueModificationJob(db, owner, app.id, input);
    expect(second.id).toBe(first.id);
    const rows = await db.select().from(modificationJobs).where(eq(modificationJobs.appId, app.id));
    expect(rows).toHaveLength(1);
  });

  it("rejects the same key reused with a different payload", async () => {
    const { app, message } = await makeAppWithMessage("Conflict App", "3");
    await enqueueModificationJob(db, owner, app.id, {
      conversationId: message.conversationId,
      triggeringMessageId: message.id,
      userRequestText: "Do something.",
      selectionContext: null,
      idempotencyKey: "mj-3",
    });
    await expect(
      enqueueModificationJob(db, owner, app.id, {
        conversationId: message.conversationId,
        triggeringMessageId: message.id,
        userRequestText: "Do something completely different.",
        selectionContext: null,
        idempotencyKey: "mj-3",
      }),
    ).rejects.toBeInstanceOf(ConflictError);
  });

  it("enforces the per-app active-job limit", async () => {
    const { app, message } = await makeAppWithMessage("Limit App", "4");
    await enqueueModificationJob(db, owner, app.id, {
      conversationId: message.conversationId,
      triggeringMessageId: message.id,
      userRequestText: "First.",
      selectionContext: null,
      idempotencyKey: "mj-4a",
    });
    expect(MODIFICATION_LIMITS.MAX_ACTIVE_JOBS_PER_APP).toBe(1);
    await expect(
      enqueueModificationJob(db, owner, app.id, {
        conversationId: message.conversationId,
        triggeringMessageId: message.id,
        userRequestText: "Second.",
        selectionContext: null,
        idempotencyKey: "mj-4b",
      }),
    ).rejects.toBeInstanceOf(ConflictError);
  });

  it("requires app.requestModification — a viewer cannot enqueue", async () => {
    const { app, message } = await makeAppWithMessage("Viewer App", "5");
    await addCollaborator(db, owner, app.id, viewer.principalId, "viewer");
    await expect(
      enqueueModificationJob(db, viewer, app.id, {
        conversationId: message.conversationId,
        triggeringMessageId: message.id,
        userRequestText: "Do something.",
        selectionContext: null,
        idempotencyKey: "mj-5",
      }),
    ).rejects.toBeInstanceOf(ForbiddenError);
  });

  it("an unrelated actor gets NotFoundError (leak prevention)", async () => {
    const { app, message } = await makeAppWithMessage("Unrelated App", "6");
    await expect(
      enqueueModificationJob(db, unrelated, app.id, {
        conversationId: message.conversationId,
        triggeringMessageId: message.id,
        userRequestText: "Do something.",
        selectionContext: null,
        idempotencyKey: "mj-6",
      }),
    ).rejects.toBeInstanceOf(NotFoundError);
  });

  it("records an audit event on enqueue", async () => {
    const { app, message } = await makeAppWithMessage("Audit App", "7");
    const job = await enqueueModificationJob(db, owner, app.id, {
      conversationId: message.conversationId,
      triggeringMessageId: message.id,
      userRequestText: "Do something.",
      selectionContext: null,
      idempotencyKey: "mj-7",
    });
    const events = await db.select().from(auditEvents).where(eq(auditEvents.targetId, job.id));
    expect(events.some((e) => e.action === "modification.requested")).toBe(true);
  });
});

describe("getModificationJobByIdempotencyKey", () => {
  it("finds the job by (appId, idempotencyKey) without needing its id", async () => {
    const { app, message } = await makeAppWithMessage("Lookup App", "8");
    const job = await enqueueModificationJob(db, owner, app.id, {
      conversationId: message.conversationId,
      triggeringMessageId: message.id,
      userRequestText: "Do something.",
      selectionContext: null,
      idempotencyKey: "mj-8",
    });
    const found = await getModificationJobByIdempotencyKey(db, owner, app.id, "mj-8");
    expect(found?.id).toBe(job.id);
    expect(await getModificationJobByIdempotencyKey(db, owner, app.id, "no-such-key")).toBeNull();
  });
});

describe("requestCancellation", () => {
  it("cancels a queued job immediately", async () => {
    const { app, message } = await makeAppWithMessage("Cancel App", "9");
    const job = await enqueueModificationJob(db, owner, app.id, {
      conversationId: message.conversationId,
      triggeringMessageId: message.id,
      userRequestText: "Do something.",
      selectionContext: null,
      idempotencyKey: "mj-9",
    });
    const cancelled = await requestCancellation(db, owner, app.id, job.id);
    expect(cancelled.status).toBe("cancelled");
  });

  it("is idempotent — cancelling an already-cancelled job is a no-op", async () => {
    const { app, message } = await makeAppWithMessage("Double Cancel App", "10");
    const job = await enqueueModificationJob(db, owner, app.id, {
      conversationId: message.conversationId,
      triggeringMessageId: message.id,
      userRequestText: "Do something.",
      selectionContext: null,
      idempotencyKey: "mj-10",
    });
    await requestCancellation(db, owner, app.id, job.id);
    const second = await requestCancellation(db, owner, app.id, job.id);
    expect(second.status).toBe("cancelled");
  });

  it("requires app.cancelModification — an editor other than the requester may still cancel (role-gated, not requester-gated)", async () => {
    const { app, message } = await makeAppWithMessage("Editor Cancel App", "11");
    await addCollaborator(db, owner, app.id, editor.principalId, "editor");
    const job = await enqueueModificationJob(db, owner, app.id, {
      conversationId: message.conversationId,
      triggeringMessageId: message.id,
      userRequestText: "Do something.",
      selectionContext: null,
      idempotencyKey: "mj-11",
    });
    const cancelled = await requestCancellation(db, editor, app.id, job.id);
    expect(cancelled.status).toBe("cancelled");
  });
});

describe("getLatestModificationJobForActor", () => {
  it("returns null when no job has ever been requested", async () => {
    const app = await createApp(db, owner, { name: "No Job App", slug: "no-job-app-1" }, "create-nojob");
    expect(await getLatestModificationJobForActor(db, owner, app.id)).toBeNull();
  });

  it("a viewer can read job status but never enqueue", async () => {
    const { app, message } = await makeAppWithMessage("Viewer Read App", "12");
    await addCollaborator(db, owner, app.id, viewer.principalId, "viewer");
    await enqueueModificationJob(db, owner, app.id, {
      conversationId: message.conversationId,
      triggeringMessageId: message.id,
      userRequestText: "Do something.",
      selectionContext: null,
      idempotencyKey: "mj-12",
    });
    const job = await getLatestModificationJobForActor(db, viewer, app.id);
    expect(job).not.toBeNull();
  });
});
