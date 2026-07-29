import { and, desc, eq } from "drizzle-orm";
import type { ApplicationSpecificationType } from "@asafarim/appbuilder-schema";
import type {
  ContextAttachmentEvidence,
  ContextManifest,
  ContextMemoryFact,
  ContextTargetCandidate,
  ContextTurn,
  GroundedModificationContext,
} from "@asafarim/appbuilder-ai";
import type { Db } from "../db/client";
import { conversationMessages } from "../db/schema";
import { listAttachmentEvidenceForMessages, type ConversationAttachmentRow } from "../repositories/attachments";
import { recallConversationMemory } from "../repositories/conversationMemory";
import { ATTACHMENT_LIMITS, categoryForMimeType } from "../attachments/limits";
import { buildSpecIndex, type SpecIndex } from "./specIndex";
import { describeReference, type RecalledMemory } from "./memory";
import { mapPreviewEvidence, toContextPreviewEvidence, type PreviewEvidenceMapping } from "./previewEvidence";
import { resolveTargets, type TargetCandidate, type TargetResolution } from "./targetResolver";
import type { SelectionContextType } from "./selectionContext";

/**
 * M13 slice D — `buildModificationContext` is the ONLY builder of provider
 * input for a conversational modification (M13, "Context and target
 * resolution"). Everything a modification is interpreted against comes from
 * here: the current server-loaded specification and its index, the validated
 * selection and its preview evidence, relevant recent turns, verified
 * memory, claimed attachment evidence, and the deterministically ranked
 * target candidates.
 *
 * Three properties this module is responsible for holding:
 *
 * **Bounded.** Every source has a ceiling (turn count, per-turn characters,
 * total history characters, per-file and per-call extracted text), applied
 * here rather than hoped for upstream. A conversation with 900 messages and
 * eight 50k-character CSVs must produce the same shape of prompt as a
 * two-message one.
 *
 * **Accounted for.** Whatever is dropped or shortened is recorded in the
 * manifest with a reason. That is what lets the assistant say "I couldn't
 * read the screenshot" instead of quietly answering as though it had, and
 * what lets an operator later explain a decision without the prompt itself
 * being retained.
 *
 * **Honest about trust.** Conversation text and extracted file text are
 * user/file authored and are carried as data, wrapped as untrusted input at
 * prompt-build time (packages/appbuilder-ai/src/prompts/
 * buildModificationPrompt.ts). Target candidates, memory statements, and the
 * preview mapping are server-derived — every one of them was produced by
 * matching against the specification the server itself loaded, never by
 * trusting a client claim.
 */

export const CONTEXT_LIMITS = {
  /** Turns considered for inclusion, newest-first, before relevance filtering. */
  MAX_HISTORY_MESSAGES_SCANNED: 40,
  /** Turns actually included. */
  MAX_HISTORY_TURNS: 12,
  MAX_TURN_CHARS: 600,
  MAX_TOTAL_HISTORY_CHARS: 8_000,
  /** Recent user messages whose attachments count as evidence for this request. */
  MAX_MESSAGES_WITH_ATTACHMENT_EVIDENCE: 3,
  MAX_ATTACHMENTS: ATTACHMENT_LIMITS.MAX_ATTACHMENTS_PER_MESSAGE * 2,
  MAX_ATTACHMENT_TEXT_CHARS_PER_FILE: ATTACHMENT_LIMITS.MAX_EXTRACTED_TEXT_CHARS_PER_FILE,
  MAX_ATTACHMENT_TEXT_CHARS_TOTAL: ATTACHMENT_LIMITS.MAX_EXTRACTED_TEXT_CHARS_PER_MODEL_CALL,
  MAX_CANDIDATES: 10,
} as const;

/**
 * Message types that never inform interpretation. `system_status` is
 * transport noise ("this change was cancelled") — including it spends the
 * history budget on turns that say nothing about intent.
 */
const IRRELEVANT_MESSAGE_TYPES = new Set(["system_status"]);

export interface BuildModificationContextInput {
  db: Db;
  appId: string;
  conversationId: string;
  /** The `user_request` message this job is answering — excluded from history (it IS the request) and the primary source of attachment evidence. */
  triggeringMessageId: string;
  userRequest: string;
  currentSpec: ApplicationSpecificationType;
  currentVersionNumber: number;
  selection: SelectionContextType | null;
  /** True when the configured provider can actually analyze images — drives the honest "I did not look at your screenshot" disclosure. */
  visionAvailable?: boolean;
}

export interface ModificationContextResult {
  index: SpecIndex;
  resolution: TargetResolution;
  memory: RecalledMemory;
  previewEvidence: PreviewEvidenceMapping | null;
  /** Exactly what is handed to the provider. */
  grounded: GroundedModificationContext;
}

export async function buildModificationContext(
  input: BuildModificationContextInput,
): Promise<ModificationContextResult> {
  const index = buildSpecIndex(input.currentSpec, input.currentVersionNumber);

  const includedSourceIds: string[] = [`spec@${input.currentVersionNumber}`];
  const omitted: { sourceId: string; reason: string }[] = [];
  const truncated: { sourceId: string; originalChars: number; includedChars: number }[] = [];
  const redactionFlags = new Set<string>();

  // ─── Memory (verified against the current index) ─────────────────────────
  const memory = await recallConversationMemory(input.db, input.conversationId, index);
  for (const dropped of memory.invalidated) {
    omitted.push({
      sourceId: `memory:${dropped.targetId ?? dropped.descriptor}`,
      reason: `stale_memory_${dropped.reason}`,
    });
  }
  if (memory.invalidated.length > 0) redactionFlags.add("memory_invalidated");

  // ─── Preview evidence → stable targets ───────────────────────────────────
  const previewEvidence = mapPreviewEvidence(
    input.selection
      ? {
          pageId: input.selection.pageId,
          componentId: input.selection.componentId,
          componentKind: input.selection.componentKind,
          label: input.selection.label,
          ...(input.selection.previewEvidence ?? {}),
        }
      : null,
    index,
  );
  if (previewEvidence) includedSourceIds.push(`preview_evidence:${previewEvidence.kind}`);

  // ─── Deterministic target resolution ─────────────────────────────────────
  const resolution = resolveTargets({
    request: input.userRequest,
    index,
    selection: input.selection
      ? {
          pageId: input.selection.pageId,
          componentId: input.selection.componentId,
          componentKind: input.selection.componentKind,
          label: input.selection.label,
        }
      : null,
    memory: memory.facts,
    memoryWasInvalidated: memory.invalidated.length > 0,
  });

  // ─── Relevant recent turns ───────────────────────────────────────────────
  const history = await assembleHistory(input, includedSourceIds, omitted, truncated);

  // ─── Attachment evidence ─────────────────────────────────────────────────
  const attachments = await assembleAttachments(input, history, includedSourceIds, omitted, truncated, redactionFlags);

  const memoryFacts = describeMemory(memory, index, includedSourceIds);
  const candidates = resolution.candidates.slice(0, CONTEXT_LIMITS.MAX_CANDIDATES).map(toContextCandidate);
  for (const candidate of candidates) includedSourceIds.push(`target:${candidate.targetId}`);

  const manifest: ContextManifest = {
    specificationVersionNumber: input.currentVersionNumber,
    includedSourceIds,
    omitted,
    truncated,
    estimatedTokens: estimateTokens({ request: input.userRequest, spec: input.currentSpec, history, attachments, candidates }),
    redactionFlags: [...redactionFlags],
  };

  const grounded: GroundedModificationContext = {
    history,
    memory: memoryFacts,
    attachments,
    targetCandidates: candidates,
    resolvedTarget: resolution.resolved ? toContextCandidate(resolution.resolved) : null,
    resolutionOutcome: resolution.outcome,
    groundedQuestion: resolution.question,
    previewEvidence: toContextPreviewEvidence(previewEvidence),
    manifest,
  };

  return { index, resolution, memory, previewEvidence, grounded };
}

// ─── History ───────────────────────────────────────────────────────────────

async function assembleHistory(
  input: BuildModificationContextInput,
  includedSourceIds: string[],
  omitted: { sourceId: string; reason: string }[],
  truncated: { sourceId: string; originalChars: number; includedChars: number }[],
): Promise<ContextTurn[]> {
  const rows = await input.db
    .select()
    .from(conversationMessages)
    .where(and(eq(conversationMessages.appId, input.appId), eq(conversationMessages.conversationId, input.conversationId)))
    .orderBy(desc(conversationMessages.createdAt))
    .limit(CONTEXT_LIMITS.MAX_HISTORY_MESSAGES_SCANNED);

  const turns: ContextTurn[] = [];
  let charBudget = CONTEXT_LIMITS.MAX_TOTAL_HISTORY_CHARS;

  // Newest-first while spending the budget (recency is what disambiguates a
  // follow-up), then reversed to chronological order for the prompt.
  for (const row of rows) {
    if (row.id === input.triggeringMessageId) continue;
    if (turns.length >= CONTEXT_LIMITS.MAX_HISTORY_TURNS) {
      omitted.push({ sourceId: `message:${row.id}`, reason: "history_turn_limit" });
      continue;
    }
    if (IRRELEVANT_MESSAGE_TYPES.has(row.messageType)) {
      omitted.push({ sourceId: `message:${row.id}`, reason: "not_relevant_to_interpretation" });
      continue;
    }
    if (charBudget <= 0) {
      omitted.push({ sourceId: `message:${row.id}`, reason: "history_character_budget" });
      continue;
    }

    const original = row.content ?? "";
    const limit = Math.min(CONTEXT_LIMITS.MAX_TURN_CHARS, charBudget);
    const content = original.slice(0, limit);
    const wasTruncated = content.length < original.length;
    charBudget -= content.length;

    if (wasTruncated) {
      truncated.push({ sourceId: `message:${row.id}`, originalChars: original.length, includedChars: content.length });
    }
    includedSourceIds.push(`message:${row.id}`);
    turns.push({
      id: row.id,
      role: row.role as ContextTurn["role"],
      messageType: row.messageType,
      content,
      createdAt: row.createdAt.toISOString(),
      truncated: wasTruncated,
      baseVersionNumber: row.baseVersionNumber ?? undefined,
    });
  }

  return turns.reverse();
}

// ─── Attachments ───────────────────────────────────────────────────────────

async function assembleAttachments(
  input: BuildModificationContextInput,
  history: readonly ContextTurn[],
  includedSourceIds: string[],
  omitted: { sourceId: string; reason: string }[],
  truncated: { sourceId: string; originalChars: number; includedChars: number }[],
  redactionFlags: Set<string>,
): Promise<ContextAttachmentEvidence[]> {
  // The triggering message first, then the most recent prior user turns —
  // "make this blue" three messages after the screenshot is still about the
  // screenshot.
  const priorUserMessageIds = history
    .filter((turn) => turn.role === "user")
    .slice(-CONTEXT_LIMITS.MAX_MESSAGES_WITH_ATTACHMENT_EVIDENCE)
    .map((turn) => turn.id);
  const messageIds = [input.triggeringMessageId, ...priorUserMessageIds];

  const rows = await listAttachmentEvidenceForMessages(input.db, input.appId, messageIds);
  if (rows.length === 0) return [];

  const evidence: ContextAttachmentEvidence[] = [];
  let textBudget = CONTEXT_LIMITS.MAX_ATTACHMENT_TEXT_CHARS_TOTAL;
  let sawUntrustedText = false;

  for (const row of rows.slice(0, CONTEXT_LIMITS.MAX_ATTACHMENTS)) {
    const mimeType = row.detectedMimeType ?? row.declaredMimeType;
    const category = categoryForMimeType(mimeType) ?? "text";
    const base = { id: row.id, filename: row.originalFilename, mimeType, category } as const;

    const unusable = describeUnusable(row);
    if (unusable) {
      omitted.push({ sourceId: `attachment:${row.id}`, reason: unusable.manifestReason });
      evidence.push({ ...base, availability: "unavailable", reason: unusable.userFacingReason });
      continue;
    }

    if (category === "image") {
      // Image understanding needs BOTH a vision-capable provider AND a path
      // that actually forwards image parts. Slice D has neither: slice B
      // deferred image extraction explicitly, and multimodal provider calls
      // are not built yet. So the disclosure below is worded around what
      // this pipeline did, not around what some model might be capable of —
      // claiming "the model can't see images" when it can would be its own
      // small lie. What matters to the user is identical either way: the
      // image was not read, and the answer does not rest on it.
      omitted.push({
        sourceId: `attachment:${row.id}`,
        reason: input.visionAvailable ? "image_parts_not_sent" : "vision_unavailable",
      });
      redactionFlags.add(input.visionAvailable ? "image_not_analyzed" : "vision_unavailable");
      evidence.push({
        ...base,
        availability: "image_not_analyzed",
        reason: "Image content is not sent to the model yet, so this image was not read — only its filename and type are known.",
      });
      continue;
    }

    const full = row.extractedText ?? "";
    if (full.length === 0) {
      omitted.push({ sourceId: `attachment:${row.id}`, reason: "no_extracted_text" });
      evidence.push({
        ...base,
        availability: "unavailable",
        reason: "No readable text could be extracted from this file.",
      });
      continue;
    }

    if (textBudget <= 0) {
      omitted.push({ sourceId: `attachment:${row.id}`, reason: "attachment_text_budget" });
      evidence.push({
        ...base,
        availability: "unavailable",
        reason: "Earlier attachments used the whole text budget for this request, so this file was not read.",
      });
      continue;
    }

    const limit = Math.min(CONTEXT_LIMITS.MAX_ATTACHMENT_TEXT_CHARS_PER_FILE, textBudget);
    const text = full.slice(0, limit);
    const wasTruncated = text.length < full.length;
    textBudget -= text.length;
    sawUntrustedText = true;

    if (wasTruncated) {
      truncated.push({ sourceId: `attachment:${row.id}`, originalChars: full.length, includedChars: text.length });
    }
    includedSourceIds.push(`attachment:${row.id}`);
    evidence.push({
      ...base,
      availability: wasTruncated ? "text_truncated" : "text_included",
      text,
      originalChars: full.length,
      includedChars: text.length,
    });
  }

  if (sawUntrustedText) redactionFlags.add("untrusted_attachment_text");
  return evidence;
}

/** Safe, user-facing wording for an attachment that exists but can't be used — never a raw failure message or storage detail. */
function describeUnusable(row: ConversationAttachmentRow): { manifestReason: string; userFacingReason: string } | null {
  switch (row.status) {
    case "ready":
      return null;
    case "quarantined":
      return { manifestReason: "attachment_quarantined", userFacingReason: "This file was quarantined by the security scan and was not read." };
    case "failed":
      return { manifestReason: "attachment_failed", userFacingReason: "This file could not be processed, so it was not read." };
    case "pending":
    case "uploaded":
    case "processing":
      return { manifestReason: "attachment_not_ready", userFacingReason: "This file was still being processed and was not read." };
    default:
      return { manifestReason: "attachment_unavailable", userFacingReason: "This file was not available to read." };
  }
}

// ─── Projections ───────────────────────────────────────────────────────────

function describeMemory(memory: RecalledMemory, index: SpecIndex, includedSourceIds: string[]): ContextMemoryFact[] {
  const facts: ContextMemoryFact[] = [];

  for (const reference of memory.facts.references) {
    facts.push({
      kind: "reference",
      statement: describeReference(reference, index.byTargetId.get(reference.targetId)),
      targetId: reference.targetId,
      sourceMessageIds: reference.sourceMessageIds,
      specificationVersionNumber: reference.specificationVersionNumber,
    });
  }
  for (const assumption of memory.facts.assumptions) {
    facts.push({
      kind: "assumption",
      statement: assumption.statement,
      targetId: assumption.targetId,
      sourceMessageIds: assumption.sourceMessageIds,
      specificationVersionNumber: assumption.specificationVersionNumber,
    });
  }
  for (const preference of memory.facts.preferences) {
    facts.push({
      kind: "preference",
      statement: `${preference.key}: ${preference.value}`,
      sourceMessageIds: preference.sourceMessageIds,
      specificationVersionNumber: preference.specificationVersionNumber,
    });
  }

  for (const fact of facts) includedSourceIds.push(`memory:${fact.targetId ?? fact.statement.slice(0, 40)}`);
  return facts;
}

function toContextCandidate(candidate: TargetCandidate): ContextTargetCandidate {
  const { target } = candidate;
  return {
    targetId: target.targetId,
    kind: target.kind,
    property: target.property,
    label: target.label,
    value: target.value,
    pageId: target.pageId,
    componentId: target.componentId,
    entityId: target.entityId,
    fieldId: target.fieldId,
    navigationItemId: target.navigationItemId,
    strategy: candidate.role === "capability" ? `${candidate.strategy}:capability` : candidate.strategy,
    confidence: candidate.confidence,
    evidence: candidate.evidence,
  };
}

/**
 * A deliberately coarse characters/4 estimate. It exists for budgeting and
 * observability, not billing — the provider's own usage metadata
 * (UsageMetadata.promptTokens) remains the authoritative count, and nothing
 * branches on this number.
 */
function estimateTokens(parts: {
  request: string;
  spec: ApplicationSpecificationType;
  history: readonly ContextTurn[];
  attachments: readonly ContextAttachmentEvidence[];
  candidates: readonly ContextTargetCandidate[];
}): number {
  const chars =
    parts.request.length +
    JSON.stringify({ entities: parts.spec.entities, pages: parts.spec.pages, branding: parts.spec.branding }).length +
    parts.history.reduce((sum, turn) => sum + turn.content.length, 0) +
    parts.attachments.reduce((sum, a) => sum + (a.text?.length ?? 0), 0) +
    JSON.stringify(parts.candidates).length;
  return Math.ceil(chars / 4);
}

/**
 * The safe summary persisted on the job (`modification_jobs.context_manifest`).
 * Carries the manifest and the resolver's verdict — never the prompt, the
 * conversation text, or extracted attachment content.
 */
export function toPersistableManifest(grounded: GroundedModificationContext): Record<string, unknown> {
  return {
    manifest: grounded.manifest,
    resolutionOutcome: grounded.resolutionOutcome,
    resolvedTargetId: grounded.resolvedTarget?.targetId ?? null,
    resolvedStrategy: grounded.resolvedTarget?.strategy ?? null,
    resolvedConfidence: grounded.resolvedTarget?.confidence ?? null,
    candidateTargetIds: grounded.targetCandidates.map((candidate) => candidate.targetId),
    historyTurnCount: grounded.history.length,
    memoryFactCount: grounded.memory.length,
    attachmentEvidence: grounded.attachments.map((a) => ({ id: a.id, availability: a.availability })),
    previewEvidenceKind: grounded.previewEvidence?.kind ?? null,
  };
}
