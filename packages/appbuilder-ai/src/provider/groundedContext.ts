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

/**
 * M13 slice F — how fresh an imported public reference's content is AT PROMPT
 * TIME. There is deliberately no `"live"` member: by the time a stored
 * reference reaches a prompt it was fetched at some earlier moment, so the
 * only honest labels are "still inside its cache TTL", "past it", and "we
 * have nothing usable". `"live"` exists only on the import API's immediate
 * response, for a fetch that just succeeded in that request (see
 * apps/appbuilder/lib/references/provenance.ts).
 */
export type ReferenceFreshness = "cached" | "stale" | "unavailable";

export type ReferenceEvidenceAvailability =
  | "text_included"
  | "text_truncated"
  /** Facts were extracted but the body text was not included (bounded out, or an adapter that only yields facts). */
  | "facts_only"
  /** The import failed or has never succeeded — disclosed, never silently dropped. */
  | "unavailable";

/** One structured fact an adapter extracted from a reference, e.g. `{ label: "Public repositories", value: "42" }`. */
export interface ReferenceFact {
  label: string;
  value: string;
}

/**
 * M13 slice F — one public HTTPS reference the user explicitly imported,
 * with its provenance. Two things this shape exists to make impossible:
 *
 * 1. **Passing third-party content off as fresh.** `fetchedAt` and
 *    `freshness` are always present, and the prompt is instructed to date
 *    anything it repeats from here. A failed refresh downgrades freshness —
 *    it never keeps the previous "cached" label.
 * 2. **Passing third-party content off as trusted.** `text` is remote,
 *    attacker-controllable data. It is wrapped via `wrapUntrustedInput` by
 *    `buildModificationPrompt` exactly like attachment text; the provenance
 *    fields around it are server-derived and stay outside the wrapper.
 */
export interface ContextReferenceEvidence {
  id: string;
  /** The normalized URL the user asked for. */
  sourceUrl: string;
  /** Where the fetch actually ended up after redirects, when it differs. */
  finalUrl?: string;
  host: string;
  /** Which adapter produced this — `generic_https`, `github_profile`, `github_repository`. */
  adapter: string;
  adapterVersion: string;
  /** ISO timestamp of the fetch that produced the content below. */
  fetchedAt: string | null;
  freshness: ReferenceFreshness;
  availability: ReferenceEvidenceAvailability;
  /** Safe, user-facing reason when the content isn't usable — never a raw error. */
  reason?: string;
  /** Bounded extracted text. Untrusted remote data; wrapped at prompt-build time. */
  text?: string;
  /** Bounded structured facts an adapter extracted. Also remote data, so also wrapped. */
  facts?: readonly ReferenceFact[];
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

/** M13 slice E — one catalogue entry the model can cite when classifying a request as partially_supported/unsupported. See capabilities/catalog.ts#buildCapabilityCatalog. */
export interface ContextCapabilityEntry {
  id: string;
  description: string;
  status:
    | "supported_now"
    | "supported_as_plan"
    | "partially_supported"
    | "unsupported_schema"
    | "unsupported_component"
    | "unsupported_integration"
    | "unsupported_flag"
    | "temporarily_unavailable";
}

export interface GroundedModificationContext {
  history: readonly ContextTurn[];
  memory: readonly ContextMemoryFact[];
  attachments: readonly ContextAttachmentEvidence[];
  /** M13 slice F — public HTTPS references the user imported into this conversation, newest first, bounded by the assembler. */
  references: readonly ContextReferenceEvidence[];
  targetCandidates: readonly ContextTargetCandidate[];
  /** Set only when exactly one candidate cleared the calibrated confidence threshold AND margin. */
  resolvedTarget: ContextTargetCandidate | null;
  resolutionOutcome: TargetResolutionOutcome;
  /**
   * A single grounded question naming the actual competing candidates, when
   * (and only when) resolution is ambiguous. Slice D produced it as a
   * failure message; slice E's pipeline persists it as a resumable,
   * non-failing `needs_clarification` pause instead (lib/modification/
   * pipeline.ts).
   */
  groundedQuestion: string | null;
  previewEvidence: ContextPreviewEvidence | null;
  /** M13 slice E — the capability catalogue this request should be judged against (see capabilities/catalog.ts). Bounded to the unsupported/plan-relevant subset by the assembler. */
  capabilities: readonly ContextCapabilityEntry[];
  manifest: ContextManifest;
}
