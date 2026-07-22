import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { createApp } from "./apps";
import { addCollaborator } from "./collaborators";
import {
  appendSystemMessage,
  appendUserMessage,
  findMessageByJobId,
  getConversationForActor,
  listMessagesForActor,
  updateMessageConfirmationState,
} from "./conversations";
import { enqueueModificationJob } from "./modificationJobs";
import { closeTestDb, getTestDb, migrateTestDb, resetTestDb } from "../db/testUtils";
import { ForbiddenError, NotFoundError } from "../errors";

const db = getTestDb();
const owner = { principalId: "conv-owner", roles: [] };
const editor = { principalId: "conv-editor", roles: [] };
const viewer = { principalId: "conv-viewer", roles: [] };
const unrelated = { principalId: "conv-unrelated", roles: [] };

beforeAll(async () => {
  await migrateTestDb();
});

beforeEach(async () => {
  await resetTestDb();
});

afterAll(async () => {
  await closeTestDb();
});

async function makeApp(name: string, suffix: string) {
  return createApp(db, owner, { name, slug: `${name.toLowerCase().replace(/\s+/g, "-")}-${suffix}` }, `create-${suffix}`);
}

describe("appendUserMessage", () => {
  it("creates the app's conversation on first use and persists a user_request message with the trusted actor as author", async () => {
    const app = await makeApp("Conv App", "1");
    expect(await getConversationForActor(db, owner, app.id)).toBeNull();

    const { conversation, message } = await appendUserMessage(db, owner, app.id, {
      content: "Add a priority field.",
      selectionContext: null,
      baseVersionNumber: 1,
    });

    expect(conversation.appId).toBe(app.id);
    expect(message.role).toBe("user");
    expect(message.messageType).toBe("user_request");
    expect(message.authorPrincipalId).toBe(owner.principalId);
    expect(message.content).toBe("Add a priority field.");
  });

  it("reuses the same conversation across multiple messages (one thread per app)", async () => {
    const app = await makeApp("Reuse Conv App", "2");
    const first = await appendUserMessage(db, owner, app.id, { content: "First.", selectionContext: null, baseVersionNumber: 1 });
    const second = await appendUserMessage(db, owner, app.id, { content: "Second.", selectionContext: null, baseVersionNumber: 1 });
    expect(second.conversation.id).toBe(first.conversation.id);
  });

  it("requires app.requestModification — a viewer cannot send a message", async () => {
    const app = await makeApp("Viewer Msg App", "3");
    await addCollaborator(db, owner, app.id, viewer.principalId, "viewer");
    await expect(
      appendUserMessage(db, viewer, app.id, { content: "Do something.", selectionContext: null, baseVersionNumber: 1 }),
    ).rejects.toBeInstanceOf(ForbiddenError);
  });

  it("an unrelated actor gets NotFoundError, not a distinguishing error (leak prevention)", async () => {
    const app = await makeApp("Unrelated Msg App", "4");
    await expect(
      appendUserMessage(db, unrelated, app.id, { content: "Do something.", selectionContext: null, baseVersionNumber: 1 }),
    ).rejects.toBeInstanceOf(NotFoundError);
  });
});

describe("listMessagesForActor — persistence survives across independent reads", () => {
  it("returns every message in chronological order (this is what makes refresh/reconnect work)", async () => {
    const app = await makeApp("List App", "5");
    await appendUserMessage(db, owner, app.id, { content: "First.", selectionContext: null, baseVersionNumber: 1 });
    await appendUserMessage(db, owner, app.id, { content: "Second.", selectionContext: null, baseVersionNumber: 1 });

    // Simulate "refresh": a completely independent read call, no shared
    // in-memory state with the calls above.
    const messages = await listMessagesForActor(db, owner, app.id);
    expect(messages.map((m) => m.content)).toEqual(["First.", "Second."]);
  });

  it("a viewer can read the conversation but never authored a message themselves", async () => {
    const app = await makeApp("Viewer Read App", "6");
    await addCollaborator(db, owner, app.id, viewer.principalId, "viewer");
    await appendUserMessage(db, owner, app.id, { content: "Owner's message.", selectionContext: null, baseVersionNumber: 1 });
    const messages = await listMessagesForActor(db, viewer, app.id);
    expect(messages).toHaveLength(1);
  });

  it("an unrelated actor cannot read the conversation (NotFoundError)", async () => {
    const app = await makeApp("Unrelated Read App", "7");
    await appendUserMessage(db, owner, app.id, { content: "Private.", selectionContext: null, baseVersionNumber: 1 });
    await expect(listMessagesForActor(db, unrelated, app.id)).rejects.toBeInstanceOf(NotFoundError);
  });
});

describe("appendSystemMessage / findMessageByJobId / updateMessageConfirmationState", () => {
  it("persists an assistant-authored proposal message and links it to its modification job", async () => {
    const app = await makeApp("System Msg App", "8");
    const { conversation, message } = await appendUserMessage(db, owner, app.id, { content: "Do something.", selectionContext: null, baseVersionNumber: 1 });
    const job = await enqueueModificationJob(db, owner, app.id, {
      conversationId: conversation.id,
      triggeringMessageId: message.id,
      userRequestText: "Do something.",
      selectionContext: null,
      idempotencyKey: "system-msg-job",
    });

    const proposal = await appendSystemMessage(db, {
      conversationId: conversation.id,
      appId: app.id,
      messageType: "ai_proposal",
      content: "Here is what I propose.",
      modificationJobId: job.id,
      confirmationState: "pending",
    });
    expect(proposal.role).toBe("assistant");
    expect(proposal.confirmationState).toBe("pending");

    const found = await findMessageByJobId(db, app.id, job.id);
    expect(found?.id).toBe(proposal.id);

    await updateMessageConfirmationState(db, proposal.id, "confirmed");
    const messages = await listMessagesForActor(db, owner, app.id);
    const updated = messages.find((m) => m.id === proposal.id);
    expect(updated?.confirmationState).toBe("confirmed");
  });

  it("distinguishes failure/validation_result/applied_change message types with the system role", async () => {
    const app = await makeApp("Types App", "9");
    const { conversation } = await appendUserMessage(db, owner, app.id, { content: "Do something.", selectionContext: null, baseVersionNumber: 1 });

    const failure = await appendSystemMessage(db, {
      conversationId: conversation.id,
      appId: app.id,
      messageType: "failure",
      content: "Something went wrong.",
      failureCode: "worker_infrastructure_error",
      failureMessage: "Something went wrong.",
    });
    expect(failure.role).toBe("system");
    expect(failure.messageType).toBe("failure");

    const applied = await appendSystemMessage(db, {
      conversationId: conversation.id,
      appId: app.id,
      messageType: "applied_change",
      content: "Applied.",
      resultingVersionNumber: 2,
    });
    expect(applied.role).toBe("assistant");
    expect(applied.resultingVersionNumber).toBe(2);
  });
});
