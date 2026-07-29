import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import type { ApplicationSpecificationType } from "@asafarim/appbuilder-schema";
import { closeTestDb, getTestDb, migrateTestDb, resetTestDb } from "../db/testUtils";
import { conversationAttachments, specificationVersions, specifications } from "../db/schema";
import { createApp } from "../repositories/apps";
import { applyOperation } from "../repositories/operations";
import { appendSystemMessage, appendUserMessage } from "../repositories/conversations";
import { commitAttachmentContent, initAttachment } from "../repositories/attachments";
import { recordResolvedReference, recallConversationMemory } from "../repositories/conversationMemory";
import { buildSpecIndex } from "./specIndex";
import { buildModificationContext, CONTEXT_LIMITS, toPersistableManifest } from "./contextAssembler";

/**
 * M13 slice D — the assembler against a real database: relevant history,
 * attachment evidence (included / truncated / unavailable), verified memory,
 * and the manifest that accounts for all of it.
 */

const db = getTestDb();
const owner = { principalId: "ctx-owner", roles: [] };

const PNG_1X1 = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=",
  "base64",
);

beforeAll(async () => {
  await migrateTestDb();
});

beforeEach(async () => {
  await resetTestDb();
});

afterAll(async () => {
  await closeTestDb();
});

/** The slice A fixture app: a `home` page titled "Home", a matching nav entry, and a non-blue primary colour. */
async function setupTitleApp(suffix: string) {
  const app = await createApp(
    db,
    owner,
    { name: `Ctx App ${suffix}`, slug: `ctx-app-${suffix}-${Math.random().toString(36).slice(2, 8)}` },
    `ctx-create-${suffix}`,
  );
  let v = 1;
  await applyOperation(db, owner, app.id, {
    operation: { opVersion: "1.0.0", type: "CREATE_PAGE", page: { id: "home", name: "Home", path: "home" } },
    baseVersionNumber: v++,
    idempotencyKey: `${suffix}-page`,
  });
  await applyOperation(db, owner, app.id, {
    operation: {
      opVersion: "1.0.0",
      type: "UPDATE_NAVIGATION",
      navigation: [{ id: "nav_home", label: "Home", targetPageId: "home", order: 0 }],
    },
    baseVersionNumber: v++,
    idempotencyKey: `${suffix}-nav`,
  });
  const { version } = await applyOperation(db, owner, app.id, {
    operation: { opVersion: "1.0.0", type: "UPDATE_BRANDING", patch: { primaryColor: "#111111" } },
    baseVersionNumber: v++,
    idempotencyKey: `${suffix}-branding`,
  });
  return { app, versionNumber: version!.versionNumber };
}

async function currentSpec(appId: string, versionNumber: number): Promise<ApplicationSpecificationType> {
  const [spec] = await db.select().from(specifications).where(eq(specifications.appId, appId)).limit(1);
  const rows = await db
    .select()
    .from(specificationVersions)
    .where(eq(specificationVersions.specificationId, spec.id));
  const match = rows.find((row) => row.versionNumber === versionNumber)!;
  return match.payload as unknown as ApplicationSpecificationType;
}

async function sendRequest(
  appId: string,
  versionNumber: number,
  content: string,
  attachmentIds: string[] = [],
) {
  return appendUserMessage(db, owner, appId, {
    content,
    selectionContext: null,
    baseVersionNumber: versionNumber,
    attachmentIds,
  });
}

async function readyTextAttachment(appId: string, filename: string, body: string) {
  const bytes = Buffer.from(body, "utf8");
  const attachment = await initAttachment(db, owner, appId, {
    originalFilename: filename,
    declaredMimeType: "text/plain",
    declaredSizeBytes: bytes.byteLength,
    idempotencyKey: `init-${filename}-${Math.random().toString(36).slice(2, 8)}`,
  });
  await commitAttachmentContent(db, owner, appId, attachment.id, bytes);
  return attachment;
}

async function build(appId: string, conversationId: string, triggeringMessageId: string, versionNumber: number, request: string) {
  return buildModificationContext({
    db,
    appId,
    conversationId,
    triggeringMessageId,
    userRequest: request,
    currentSpec: await currentSpec(appId, versionNumber),
    currentVersionNumber: versionNumber,
    selection: null,
  });
}

describe("relevant conversation history", () => {
  it("includes prior turns oldest-first, excluding the triggering request itself", async () => {
    const { app, versionNumber } = await setupTitleApp("history");
    const first = await sendRequest(app.id, versionNumber, "change the title color to blue");
    await appendSystemMessage(db, {
      conversationId: first.conversation.id,
      appId: app.id,
      messageType: "ai_proposal",
      content: "Which title did you mean?",
    });
    const trigger = await sendRequest(app.id, versionNumber, "the title whose value is Home");

    const context = await build(app.id, first.conversation.id, trigger.message.id, versionNumber, "the title whose value is Home");

    expect(context.grounded.history.map((turn) => turn.content)).toEqual([
      "change the title color to blue",
      "Which title did you mean?",
    ]);
    expect(context.grounded.history.map((turn) => turn.id)).not.toContain(trigger.message.id);
  });

  it("drops transport-noise system_status turns and records why in the manifest", async () => {
    const { app, versionNumber } = await setupTitleApp("noise");
    const first = await sendRequest(app.id, versionNumber, "rename the Home page");
    const noise = await appendSystemMessage(db, {
      conversationId: first.conversation.id,
      appId: app.id,
      messageType: "system_status",
      content: "This change was cancelled.",
    });
    const trigger = await sendRequest(app.id, versionNumber, "make it blue");

    const context = await build(app.id, first.conversation.id, trigger.message.id, versionNumber, "make it blue");

    expect(context.grounded.history.map((t) => t.id)).not.toContain(noise.id);
    expect(context.grounded.manifest.omitted).toContainEqual({
      sourceId: `message:${noise.id}`,
      reason: "not_relevant_to_interpretation",
    });
  });

  it("truncates an over-long turn and accounts for it, rather than sending it whole", async () => {
    const { app, versionNumber } = await setupTitleApp("truncate");
    const long = "x".repeat(CONTEXT_LIMITS.MAX_TURN_CHARS + 500);
    const first = await sendRequest(app.id, versionNumber, long);
    const trigger = await sendRequest(app.id, versionNumber, "make it blue");

    const context = await build(app.id, first.conversation.id, trigger.message.id, versionNumber, "make it blue");

    const turn = context.grounded.history.find((t) => t.id === first.message.id)!;
    expect(turn.truncated).toBe(true);
    expect(turn.content).toHaveLength(CONTEXT_LIMITS.MAX_TURN_CHARS);
    expect(context.grounded.manifest.truncated).toContainEqual({
      sourceId: `message:${first.message.id}`,
      originalChars: long.length,
      includedChars: CONTEXT_LIMITS.MAX_TURN_CHARS,
    });
  });

  it("caps the number of included turns and lists the rest as omitted", async () => {
    const { app, versionNumber } = await setupTitleApp("cap");
    let conversationId = "";
    for (let i = 0; i < CONTEXT_LIMITS.MAX_HISTORY_TURNS + 4; i += 1) {
      const sent = await sendRequest(app.id, versionNumber, `turn ${i}`);
      conversationId = sent.conversation.id;
    }
    const trigger = await sendRequest(app.id, versionNumber, "make it blue");

    const context = await build(app.id, conversationId, trigger.message.id, versionNumber, "make it blue");

    expect(context.grounded.history).toHaveLength(CONTEXT_LIMITS.MAX_HISTORY_TURNS);
    expect(context.grounded.manifest.omitted.filter((o) => o.reason === "history_turn_limit").length).toBeGreaterThan(0);
    // The turns that survive are the most recent ones — recency is what
    // disambiguates a follow-up.
    expect(context.grounded.history.at(-1)!.content).toBe(`turn ${CONTEXT_LIMITS.MAX_HISTORY_TURNS + 3}`);
  });
});

describe("attachment evidence", () => {
  it("includes a ready text file's extracted content and lists it as an included source", async () => {
    const { app, versionNumber } = await setupTitleApp("attach-ok");
    const attachment = await readyTextAttachment(app.id, "brief.txt", "The hero headline should read Welcome.");
    const trigger = await sendRequest(app.id, versionNumber, "use the brief", [attachment.id]);

    const context = await build(app.id, trigger.conversation.id, trigger.message.id, versionNumber, "use the brief");

    expect(context.grounded.attachments).toHaveLength(1);
    expect(context.grounded.attachments[0]).toMatchObject({
      filename: "brief.txt",
      availability: "text_included",
      text: "The hero headline should read Welcome.",
    });
    expect(context.grounded.manifest.includedSourceIds).toContain(`attachment:${attachment.id}`);
    expect(context.grounded.manifest.redactionFlags).toContain("untrusted_attachment_text");
  });

  it("truncates an over-budget file and reports the exact shortfall", async () => {
    const { app, versionNumber } = await setupTitleApp("attach-trunc");
    const body = "y".repeat(CONTEXT_LIMITS.MAX_ATTACHMENT_TEXT_CHARS_PER_FILE + 2_000);
    const attachment = await readyTextAttachment(app.id, "big.txt", body);
    const trigger = await sendRequest(app.id, versionNumber, "use the file", [attachment.id]);

    const context = await build(app.id, trigger.conversation.id, trigger.message.id, versionNumber, "use the file");

    const evidence = context.grounded.attachments[0];
    // Slice B's extractor already caps per-file text at the same ceiling, so
    // what reaches the model is bounded twice over — belt and braces, and
    // the manifest reports whichever cut actually applied.
    expect(evidence.includedChars).toBeLessThanOrEqual(CONTEXT_LIMITS.MAX_ATTACHMENT_TEXT_CHARS_PER_FILE);
    expect(evidence.text!.length).toBe(evidence.includedChars);
    expect(["text_included", "text_truncated"]).toContain(evidence.availability);
  });

  it("discloses an image as not analyzed rather than silently dropping it", async () => {
    const { app, versionNumber } = await setupTitleApp("attach-image");
    const image = await initAttachment(db, owner, app.id, {
      originalFilename: "screenshot.png",
      declaredMimeType: "image/png",
      declaredSizeBytes: PNG_1X1.byteLength,
      idempotencyKey: "init-screenshot",
    });
    await commitAttachmentContent(db, owner, app.id, image.id, PNG_1X1);
    const trigger = await sendRequest(app.id, versionNumber, "make this blue", [image.id]);

    const context = await build(app.id, trigger.conversation.id, trigger.message.id, versionNumber, "make this blue");

    expect(context.grounded.attachments[0]).toMatchObject({
      filename: "screenshot.png",
      availability: "image_not_analyzed",
    });
    expect(context.grounded.attachments[0].reason).toMatch(/not sent to the model/i);
    expect(context.grounded.attachments[0].text).toBeUndefined();
    expect(context.grounded.manifest.redactionFlags).toContain("vision_unavailable");
  });

  it("reports a quarantined attachment as unavailable, with a safe reason and no content", async () => {
    const { app, versionNumber } = await setupTitleApp("attach-quarantine");
    const attachment = await readyTextAttachment(app.id, "suspect.txt", "secret content that must not leak");
    const trigger = await sendRequest(app.id, versionNumber, "read it", [attachment.id]);
    await db
      .update(conversationAttachments)
      .set({ status: "quarantined", failureCode: "malware_detected" })
      .where(eq(conversationAttachments.id, attachment.id));

    const context = await build(app.id, trigger.conversation.id, trigger.message.id, versionNumber, "read it");

    const evidence = context.grounded.attachments[0];
    expect(evidence.availability).toBe("unavailable");
    expect(evidence.text).toBeUndefined();
    expect(JSON.stringify(context.grounded)).not.toContain("secret content that must not leak");
    expect(context.grounded.manifest.omitted).toContainEqual({
      sourceId: `attachment:${attachment.id}`,
      reason: "attachment_quarantined",
    });
  });

  it("reports a still-processing attachment as unavailable rather than pretending nothing was attached", async () => {
    const { app, versionNumber } = await setupTitleApp("attach-pending");
    const attachment = await readyTextAttachment(app.id, "slow.txt", "content");
    const trigger = await sendRequest(app.id, versionNumber, "read it", [attachment.id]);
    await db
      .update(conversationAttachments)
      .set({ status: "processing" })
      .where(eq(conversationAttachments.id, attachment.id));

    const context = await build(app.id, trigger.conversation.id, trigger.message.id, versionNumber, "read it");

    expect(context.grounded.attachments[0]).toMatchObject({ availability: "unavailable" });
    expect(context.grounded.attachments[0].reason).toMatch(/still being processed/i);
  });

  it("carries an attachment from a recent earlier turn, so a follow-up still sees the evidence", async () => {
    const { app, versionNumber } = await setupTitleApp("attach-prior");
    const attachment = await readyTextAttachment(app.id, "brief.txt", "Headline: Welcome");
    const first = await sendRequest(app.id, versionNumber, "here is the brief", [attachment.id]);
    const trigger = await sendRequest(app.id, versionNumber, "use it");

    const context = await build(app.id, first.conversation.id, trigger.message.id, versionNumber, "use it");

    expect(context.grounded.attachments.map((a) => a.filename)).toContain("brief.txt");
  });
});

describe("memory across turns", () => {
  it("recalls a reference that still holds, and drops one whose target was changed since", async () => {
    const { app, versionNumber } = await setupTitleApp("memory");
    const first = await sendRequest(app.id, versionNumber, "change the title color to blue");

    await recordResolvedReference(db, {
      appId: app.id,
      conversationId: first.conversation.id,
      specificationVersionNumber: versionNumber,
      reference: {
        phrase: "the title",
        targetId: "pages.home.name",
        property: "name",
        recordedValue: "Home",
        pageId: "home",
        sourceMessageIds: [first.message.id],
        specificationVersionNumber: versionNumber,
        recordedAt: new Date().toISOString(),
      },
    });

    const trigger = await sendRequest(app.id, versionNumber, "it is still black");
    const context = await build(app.id, first.conversation.id, trigger.message.id, versionNumber, "it is still black");

    expect(context.grounded.memory).toHaveLength(1);
    expect(context.grounded.memory[0]).toMatchObject({ kind: "reference", targetId: "pages.home.name" });
    expect(context.grounded.memory[0].sourceMessageIds).toEqual([first.message.id]);
    expect(context.grounded.resolutionOutcome).toBe("resolved");
    expect(context.grounded.resolvedTarget?.targetId).toBe("pages.home.name");

    // Someone renames the page outside this conversation.
    const { version: renamed } = await applyOperation(db, owner, app.id, {
      operation: { opVersion: "1.0.0", type: "UPDATE_PAGE", pageId: "home", patch: { name: "Experiences" } },
      baseVersionNumber: versionNumber,
      idempotencyKey: "memory-rename",
    });

    const recalled = await recallConversationMemory(
      db,
      first.conversation.id,
      buildSpecIndex(await currentSpec(app.id, renamed!.versionNumber), renamed!.versionNumber),
    );
    expect(recalled.facts.references).toHaveLength(0);
    expect(recalled.invalidated[0]).toMatchObject({ reason: "value_changed" });

    const after = await build(app.id, first.conversation.id, trigger.message.id, renamed!.versionNumber, "it is still black");
    expect(after.grounded.memory).toHaveLength(0);
    expect(after.grounded.manifest.redactionFlags).toContain("memory_invalidated");
    expect(after.grounded.resolutionOutcome).toBe("unresolved");
    expect(after.grounded.groundedQuestion).toMatch(/changed or no longer exists/i);
  });
});

describe("the persisted manifest", () => {
  it("summarises the grounding without carrying the prompt, conversation text, or file content", async () => {
    const { app, versionNumber } = await setupTitleApp("manifest");
    const attachment = await readyTextAttachment(app.id, "brief.txt", "sensitive brief body");
    const first = await sendRequest(app.id, versionNumber, "a previous request nobody should re-persist", [attachment.id]);
    const trigger = await sendRequest(app.id, versionNumber, "the title whose value is Home");

    const context = await build(app.id, first.conversation.id, trigger.message.id, versionNumber, "the title whose value is Home");
    const persisted = JSON.stringify(toPersistableManifest(context.grounded));

    expect(persisted).not.toContain("sensitive brief body");
    expect(persisted).not.toContain("a previous request nobody should re-persist");
    expect(JSON.parse(persisted)).toMatchObject({
      resolutionOutcome: "resolved",
      resolvedTargetId: "pages.home.name",
      historyTurnCount: 1,
    });
    expect(JSON.parse(persisted).attachmentEvidence).toEqual([{ id: attachment.id, availability: "text_included" }]);
  });

  it("estimates tokens and lists the specification version it was grounded against", async () => {
    const { app, versionNumber } = await setupTitleApp("manifest-tokens");
    const trigger = await sendRequest(app.id, versionNumber, "the title whose value is Home");

    const context = await build(app.id, trigger.conversation.id, trigger.message.id, versionNumber, "the title whose value is Home");

    expect(context.grounded.manifest.specificationVersionNumber).toBe(versionNumber);
    expect(context.grounded.manifest.estimatedTokens).toBeGreaterThan(0);
    expect(context.grounded.manifest.includedSourceIds).toContain(`spec@${versionNumber}`);
    expect(context.grounded.manifest.includedSourceIds).toContain("target:pages.home.name");
  });
});
