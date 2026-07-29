/**
 * M13 slice D — the bounded, server-assembled evidence a conversational
 * modification request is interpreted against.
 *
 * These are *input* types, not model output: every field is produced by
 * `apps/appbuilder/lib/modification/contextAssembler.ts` from data the
 * server already trusts itself to have loaded (the current specification,
 * the persisted conversation, claimed attachments, structured memory), then
 * bounded and truncated before it ever reaches a provider. Nothing here is
 * re-derived from a model response, so none of it needs a Zod schema the
 * way `schemas/modificationProposal.ts` does — the provider boundary
 * validates what comes *back*, not what we send.
 *
 * Two invariants the shapes below encode deliberately:
 *
 * 1. **Targets are stable specification addresses, never DOM selectors.**
 *    A candidate carries `targetId` plus the stable ids an operation would
 *    actually need (`pageId`, `componentId`, `entityId`, `fieldId`). Preview
 *    evidence is reported separately and only ever as *evidence* — it is
 *    resolved to spec targets server-side and never becomes mutation
 *    authority (docs/appbuilder-m13-multimodal-contextual-assistant.md,
 *    "Context and target resolution").
 * 2. **Everything a user or a file authored is untrusted prompt data.**
 *    Conversation turns and extracted attachment text are wrapped via
 *    `wrapUntrustedInput` by `buildModificationPrompt`; the manifest records
 *    what was included, omitted, or truncated so the decision can be audited
 *    without persisting the prompt itself.
 */

/** One relevant prior conversation turn, content-bounded by the assembler. */
export interface ContextTurn {
  id: string;
  role: "user" | "assistant" | "system";
  messageType: string;
  /** Bounded copy of the message body — untrusted text, wrapped at prompt-build time. */
  content: string;
  createdAt: string;
  truncated: boolean;
  /** The specification version this turn was about, when the message recorded one. */
  baseVersionNumber?: number;
}

/**
 * One durable, evidence-linked memory fact. Never an opaque prose summary:
 * a fact always names the message(s) that produced it and the specification
 * version it was true at, so it can be invalidated rather than trusted
 * forever (see `apps/appbuilder/lib/modification/memory.ts`).
 */
export interface ContextMemoryFact {
  kind: "reference" | "assumption" | "preference";
  /** Plain-language statement, e.g. `"the title" refers to the Home page's name (currently "Home")`. */
  statement: string;
  targetId?: string;
  sourceMessageIds: readonly string[];
  specificationVersionNumber: number;
}

export type AttachmentEvidenceAvailability =
  | "text_included"
  | "text_truncated"
  /** A supported image the configured provider cannot analyze (or extraction is not implemented) — disclosed, never silently dropped. */
  | "image_not_analyzed"
  /** Present on the message but unusable: still processing, quarantined, or failed. */
  | "unavailable";

export interface ContextAttachmentEvidence {
  id: string;
  filename: string;
  mimeType: string;
  category: "image" | "text" | "pdf";
  availability: AttachmentEvidenceAvailability;
  /** Safe, user-facing reason when the content isn't usable — never a raw error. */
  reason?: string;
  /** Bounded extracted text. Untrusted data; wrapped at prompt-build time. */
  text?: string;
  originalChars?: number;
  includedChars?: number;
}

/** One ranked, stable-id-addressed target the request might be about. */
export interface ContextTargetCandidate {
  /** Deterministic address of an editable property, e.g. `pages.home.name`. */
  targetId: string;
  kind: string;
  property: string;
  label: string;
  value: string | null;
  pageId?: string;
  componentId?: string;
  entityId?: string;
  fieldId?: string;
  navigationItemId?: string;
  /** Which deterministic rule matched — `selection`, `stable_id`, `exact_value`, … */
  strategy: string;
  confidence: number;
  /** Bounded, human-readable reasons this candidate matched. */
  evidence: readonly string[];
}

export type PreviewEvidenceKind = "spec_target" | "builder_chrome" | "unmapped";

/**
 * What the preview interaction actually pointed at, after the server mapped
 * it onto the current specification. `targetIds` are spec addresses — the
 * originating DOM selector/text is intentionally NOT forwarded to the
 * provider.
 */
export interface ContextPreviewEvidence {
  kind: PreviewEvidenceKind;
  reason?: string;
  targetIds?: readonly string[];
}

export interface ContextOmission {
  sourceId: string;
  reason: string;
}

export interface ContextTruncation {
  sourceId: string;
  originalChars: number;
  includedChars: number;
}

/**
 * The auditable record of what this call was actually grounded in. Persisted
 * (safely) alongside the job; the prompt itself never is.
 */
export interface ContextManifest {
  specificationVersionNumber: number;
  includedSourceIds: readonly string[];
  omitted: readonly ContextOmission[];
  truncated: readonly ContextTruncation[];
  estimatedTokens: number;
  /** e.g. `untrusted_attachment_text`, `vision_unavailable`, `memory_invalidated`. */
  redactionFlags: readonly string[];
}

export type TargetResolutionOutcome = "resolved" | "ambiguous" | "unresolved";

export interface GroundedModificationContext {
  history: readonly ContextTurn[];
  memory: readonly ContextMemoryFact[];
  attachments: readonly ContextAttachmentEvidence[];
  targetCandidates: readonly ContextTargetCandidate[];
  /** Set only when exactly one candidate cleared the calibrated confidence threshold AND margin. */
  resolvedTarget: ContextTargetCandidate | null;
  resolutionOutcome: TargetResolutionOutcome;
  /**
   * A single grounded question naming the actual competing candidates, when
   * (and only when) resolution is ambiguous. Slice D produces it; making it
   * a resumable, non-failing conversation state is slice E.
   */
  groundedQuestion: string | null;
  previewEvidence: ContextPreviewEvidence | null;
  manifest: ContextManifest;
}
