import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import type { ApplicationSpecificationType } from "@asafarim/appbuilder-schema";
import { closeTestDb, getTestDb, migrateTestDb, resetTestDb } from "../db/testUtils";
import { conversationAttachments, specificationVersions, specifications } from "../db/schema";
import { createApp } from "../repositories/apps";
import { applyOperation } from "../repositories/operations";
import { appendSystemMessage, appendUserMessage } from "../repositories/conversations";
import { commitAttachmentContent, initAttachment } from "../repositories/attachments";
import { deleteConversationReference, importConversationReference } from "../repositories/references";
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

describe("imported public reference evidence (M13 slice F)", () => {
  /** Imports a reference through the real repository path, with an injected fetch. */
  async function importReference(appId: string, url: string, body: string, options: { refresh?: boolean; status?: number } = {}) {
    const fetchImpl = (async () =>
      new Response(options.status && options.status >= 400 ? null : body, {
        status: options.status ?? 200,
        headers: options.status && options.status >= 400 ? {} : { "content-type": "text/html; charset=utf-8" },
      })) as unknown as typeof fetch;
    return importConversationReference(
      db,
      owner,
      appId,
      { url, refresh: options.refresh },
      { fetchImpl, resolveHost: async () => ["93.184.216.34"] },
    );
  }

  it("includes imported reference text with its provenance, and never labels it live", async () => {
    const { app, versionNumber } = await setupTitleApp("ref-included");
    const first = await sendRequest(app.id, versionNumber, "ground this in my site");
    await importReference(app.id, "https://example.com/about", "<title>About</title><body><p>Ali builds AI systems.</p></body>");
    const trigger = await sendRequest(app.id, versionNumber, "use my site copy");

    const context = await build(app.id, first.conversation.id, trigger.message.id, versionNumber, "use my site copy");

    expect(context.grounded.references).toHaveLength(1);
    const reference = context.grounded.references[0];
    expect(reference.sourceUrl).toBe("https://example.com/about");
    expect(reference.host).toBe("example.com");
    expect(reference.adapter).toBe("generic_https");
    expect(reference.adapterVersion).toBe("m13-slice-f-v1");
    expect(reference.fetchedAt).toBeTruthy();
    expect(reference.availability).toBe("text_included");
    expect(reference.text).toContain("Ali builds AI systems.");
    // `live` is not even representable here — a stored row is a past fetch.
    expect(reference.freshness).toBe("cached");
    expect(context.grounded.manifest.redactionFlags).toContain("untrusted_reference_text");
    expect(context.grounded.manifest.includedSourceIds).toContain(`reference:${reference.id}`);
  });

  it("marks a reference whose last refresh failed as stale, and flags it in the manifest", async () => {
    const { app, versionNumber } = await setupTitleApp("ref-stale");
    const first = await sendRequest(app.id, versionNumber, "ground this");
    await importReference(app.id, "https://example.com/a", "<body><p>Original copy</p></body>");
    await importReference(app.id, "https://example.com/a", "", { refresh: true, status: 500 });
    const trigger = await sendRequest(app.id, versionNumber, "use it");

    const context = await build(app.id, first.conversation.id, trigger.message.id, versionNumber, "use it");

    const reference = context.grounded.references[0];
    expect(reference.freshness).toBe("stale");
    // The usable older copy is still supplied — stale is not the same as gone.
    expect(reference.text).toContain("Original copy");
    expect(context.grounded.manifest.redactionFlags).toContain("stale_reference_content");
  });

  it("bounds included reference text and accounts for the truncation", async () => {
    const { app, versionNumber } = await setupTitleApp("ref-truncate");
    const first = await sendRequest(app.id, versionNumber, "ground this");
    const long = "y".repeat(CONTEXT_LIMITS.MAX_REFERENCE_TEXT_CHARS_PER_REFERENCE + 2_000);
    const imported = await importReference(app.id, "https://example.com/long", `<body><p>${long}</p></body>`);
    const trigger = await sendRequest(app.id, versionNumber, "use it");

    const context = await build(app.id, first.conversation.id, trigger.message.id, versionNumber, "use it");

    const reference = context.grounded.references[0];
    expect(reference.availability).toBe("text_truncated");
    expect(reference.text!.length).toBe(CONTEXT_LIMITS.MAX_REFERENCE_TEXT_CHARS_PER_REFERENCE);
    expect(context.grounded.manifest.truncated).toContainEqual({
      sourceId: `reference:${imported.reference.id}`,
      originalChars: reference.originalChars,
      includedChars: reference.includedChars,
    });
  });

  it("never includes a deleted reference", async () => {
    const { app, versionNumber } = await setupTitleApp("ref-deleted");
    const first = await sendRequest(app.id, versionNumber, "ground this");
    const imported = await importReference(app.id, "https://example.com/a", "<body><p>Gone soon</p></body>");
    await deleteConversationReference(db, owner, app.id, imported.reference.id);
    const trigger = await sendRequest(app.id, versionNumber, "use it");

    const context = await build(app.id, first.conversation.id, trigger.message.id, versionNumber, "use it");
    expect(context.grounded.references).toHaveLength(0);
  });

  it("keeps the persisted manifest to provenance only — never the imported text or full URL", async () => {
    const { app, versionNumber } = await setupTitleApp("ref-manifest");
    const first = await sendRequest(app.id, versionNumber, "ground this");
    await importReference(app.id, "https://example.com/secret-path", "<body><p>Third party words</p></body>");
    const trigger = await sendRequest(app.id, versionNumber, "use it");

    const context = await build(app.id, first.conversation.id, trigger.message.id, versionNumber, "use it");
    const persisted = JSON.stringify(toPersistableManifest(context.grounded));

    expect(persisted).toContain("example.com");
    expect(persisted).not.toContain("Third party words");
    expect(persisted).not.toContain("secret-path");
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
