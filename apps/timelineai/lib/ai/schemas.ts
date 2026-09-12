import { z } from "zod";
import { TemporalValueSchema } from "./temporal";
import { TIMELINE_LAYOUTS } from "../schemas";
import {
  checkVisualAccessibility,
  VISUAL_DIRECTOR_ACCENTS,
  VISUAL_DIRECTOR_BACKGROUNDS,
} from "./visual-accessibility";
import { NARRATIVE_AUDIENCE_PRESETS, NARRATIVE_ELEMENTS, NARRATIVE_VARIANTS } from "./narrative";

/**
 * Structured shapes for everything an AI provider may propose. These are
 * the ONLY shapes lib/server/services/ai-proposals.ts will persist or ever
 * apply to a Timeline/TimelineEvent — provider output that doesn't parse
 * against one of these is a provider_failure, never a partial write.
 */

export const AI_PROPOSAL_KINDS = [
  "events_extraction",
  "narrative_suggestion",
  "visual_recommendation",
  "temporal_correction",
] as const;
export type AiProposalKind = (typeof AI_PROPOSAL_KINDS)[number];

export const ConfidenceSchema = z.enum(["low", "medium", "high"]);
export type Confidence = z.infer<typeof ConfidenceSchema>;

export const CitationSchema = z
  .object({
    label: z.string().min(1).max(200),
    url: z
      .string()
      .url()
      .max(2000)
      .refine((value) => /^https?:\/\//i.test(value), { message: "Citation URL must be http(s)." })
      .optional(),
    excerpt: z.string().max(500).optional(),
  })
  .strict();
export type Citation = z.infer<typeof CitationSchema>;

export const WarningSchema = z
  .object({
    code: z.string().min(1).max(64),
    message: z.string().min(1).max(500),
  })
  .strict();
export type Warning = z.infer<typeof WarningSchema>;

/** Which provider/model actually produced this — never trusted for authorization, only for audit/display. */
export const ModelMetadataSchema = z
  .object({
    provider: z.string().min(1).max(64),
    model: z.string().min(1).max(128),
    /** Provider-reported or fixture-assigned request id, for support/debugging — not a secret. */
    requestId: z.string().max(128).optional(),
  })
  .strict();
export type ModelMetadata = z.infer<typeof ModelMetadataSchema>;

export const ExtractedEventSchema = z
  .object({
    title: z.string().min(1).max(200),
    description: z.string().max(4000).optional(),
    displayDate: z.string().max(64).optional(),
    startAt: z.string().datetime().optional(),
    endAt: z.string().datetime().optional(),
    /** Structured precision/confidence for this event's date, when the provider can supply one (lib/ai/temporal.ts). */
    temporalValue: TemporalValueSchema.optional(),
    citations: z.array(CitationSchema).max(10).default([]),
    confidence: ConfidenceSchema,
    /** Stable id of the source-document chunk this event was extracted from (lib/ai/source-import.ts). Absent for non-import generations. */
    sourceChunkId: z.string().max(64).optional(),
    /** True when the model inferred this event without a directly quotable source passage — surfaced instead of a citation, never silently dropped. */
    uncitedInference: z.boolean().default(false),
  })
  .strict()
  .refine((event) => event.citations.length > 0 || event.uncitedInference, {
    message: "An extracted event needs at least one citation, or must be flagged as an uncited inference.",
    path: ["citations"],
  });
export type ExtractedEvent = z.infer<typeof ExtractedEventSchema>;

export const EventsExtractionPayloadSchema = z
  .object({
    kind: z.literal("events_extraction"),
    events: z.array(ExtractedEventSchema).min(1).max(100),
    /** Set when this extraction came from a source import (lib/ai/source-import.ts) — ties events back to their TimelineSourceImport for dedupe. */
    sourceContentHash: z.string().max(64).optional(),
  })
  .strict();

export const NarrativeVariantSchema = z
  .object({
    variant: z.enum(NARRATIVE_VARIANTS),
    text: z.string().min(1).max(4000),
  })
  .strict();

/**
 * A stylistic rewrite of one existing field — never a new fact. `variants`
 * carries concise/standard/immersive alternatives alongside the default
 * `suggestedText` (itself one of the variants) so a whole narrative pass
 * stores as ONE proposal rather than three; accept picks one (see
 * AcceptAiProposalOptions#variant in ai-proposals.ts).
 * `unsupportedClaim` flags text the provider added that isn't grounded in
 * the field's original content or a citation — surfaced, never silently
 * dropped or silently accepted as fact.
 */
export const NarrativeSuggestionPayloadSchema = z
  .object({
    kind: z.literal("narrative_suggestion"),
    eventId: z.string().min(1).max(64).optional(), // absent = timeline-level (title/subtitle/description)
    field: z.enum(["title", "subtitle", "description"]),
    element: z.enum(NARRATIVE_ELEMENTS).default("field_rewrite"),
    audiencePreset: z.enum(NARRATIVE_AUDIENCE_PRESETS).optional(),
    suggestedText: z.string().min(1).max(4000),
    variants: z.array(NarrativeVariantSchema).max(3).default([]),
    rationale: z.string().max(1000).optional(),
    confidence: ConfidenceSchema,
    unsupportedClaim: z.boolean().default(false),
  })
  .strict();

const VISUAL_BACKGROUND_IDS = VISUAL_DIRECTOR_BACKGROUNDS.map((b) => b.id) as [string, ...string[]];
const VISUAL_ACCENT_IDS = VISUAL_DIRECTOR_ACCENTS.map((a) => a.id) as [string, ...string[]];

/**
 * A single visual direction: layout plus a theme built ONLY from the
 * approved token vocabulary (lib/ai/visual-accessibility.ts) — never a
 * free-form color, CSS, or HTML string. `theme` here is a strict subset of
 * lib/schemas.ts#ThemeSettingsSchema (the shape the manual editor accepts)
 * so this can be persisted through the same field, but with a much
 * narrower allowlist since it's machine-generated.
 */
/** Mirrors lib/ai/visual-director.ts#ContentSummary — duplicated as a zod shape (rather than imported) so this file stays free of that module's own imports. */
const ContentSummarySchema = z
  .object({
    eventCount: z.number().int().min(0),
    hasDurations: z.boolean(),
    hasManyBranches: z.boolean(),
    avgDescriptionLength: z.number().int().min(0),
  })
  .strict();

export const VisualDirectionSchema = z
  .object({
    layout: z.enum(TIMELINE_LAYOUTS),
    backgroundId: z.enum(VISUAL_BACKGROUND_IDS),
    accentId: z.enum(VISUAL_ACCENT_IDS),
    density: z.enum(["compact", "comfortable", "spacious"]),
    cardStyle: z.enum(["flat", "elevated", "outlined"]),
    rationale: z.string().min(1).max(500),
    /** Echoes the heuristic's own inputs (lib/ai/visual-director.ts#recommendVisualDirections) so a recommendation is auditable, not a black box — see TLAI-006-UI. */
    inputsUsed: ContentSummarySchema,
  })
  .strict()
  .superRefine((direction, ctx) => {
    const violations = checkVisualAccessibility({
      backgroundId: direction.backgroundId,
      accentId: direction.accentId,
      layout: direction.layout,
      density: direction.density,
      eventCount: 0, // per-candidate contrast/token checks only; count-based checks are the heuristic's job before this ever reaches a schema
    });
    // Only the token/contrast violations apply without a real event count —
    // "density_overflow_risk" needs the generator's own count and is
    // enforced there (lib/ai/visual-director.ts), not re-derivable here.
    for (const violation of violations.filter((v) => v.code !== "density_overflow_risk")) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, message: violation.message, path: ["backgroundId"] });
    }
  });
export type VisualDirection = z.infer<typeof VisualDirectionSchema>;

// Not .superRefine()'d here for the same reason noted on
// TemporalCorrectionPayloadSchema below — a discriminatedUnion member must
// stay a plain ZodObject. The recommendedIndex-bounds check is enforced on
// AiProposalPayloadSchema's own .superRefine() instead. Each candidate's
// accessibility/token validity is still enforced right here via
// VisualDirectionSchema, since that's a nested array element, not a union
// member.
export const VisualRecommendationPayloadSchema = z
  .object({
    kind: z.literal("visual_recommendation"),
    candidates: z.array(VisualDirectionSchema).min(2).max(3),
    /** Index into `candidates` the provider considers the best default — accept() may still choose a different one. */
    recommendedIndex: z.number().int().min(0).max(2).default(0),
    confidence: ConfidenceSchema,
  })
  .strict();

/**
 * A proposed correction to one event's date, with the evidence and any
 * detected conflicts the review panel should show alongside it. Applying
 * this never auto-resolves a conflict — `conflictCodes` is informational,
 * surfaced to the user, not something accept() reacts to differently.
 */
// Not .refine()'d here — a discriminatedUnion member must stay a plain
// ZodObject (refine wraps it in ZodEffects, which discriminatedUnion
// rejects). The citation-or-uncited-inference rule is enforced instead by
// the .superRefine() on AiProposalPayloadSchema below, once the branch is
// already resolved.
export const TemporalCorrectionPayloadSchema = z
  .object({
    kind: z.literal("temporal_correction"),
    eventId: z.string().min(1).max(64),
    temporalValue: TemporalValueSchema,
    citations: z.array(CitationSchema).max(10).default([]),
    confidence: ConfidenceSchema,
    uncitedInference: z.boolean().default(false),
    conflictCodes: z.array(z.enum(["impossible_range", "ordering_cycle", "ordering_violation"])).max(10).default([]),
  })
  .strict();

export const AiProposalPayloadSchema = z
  .discriminatedUnion("kind", [
    EventsExtractionPayloadSchema,
    NarrativeSuggestionPayloadSchema,
    VisualRecommendationPayloadSchema,
    TemporalCorrectionPayloadSchema,
  ])
  .superRefine((payload, ctx) => {
    if (payload.kind === "temporal_correction" && payload.citations.length === 0 && !payload.uncitedInference) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "A temporal correction needs at least one citation, or must be flagged as an uncited inference.",
        path: ["citations"],
      });
    }
    if (payload.kind === "visual_recommendation" && payload.recommendedIndex >= payload.candidates.length) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "recommendedIndex must point at one of the provided candidates.",
        path: ["recommendedIndex"],
      });
    }
  });
export type AiProposalPayload = z.infer<typeof AiProposalPayloadSchema>;

/** The full, validated envelope a provider call resolves to. */
export const AiGenerationResultSchema = z
  .object({
    payload: AiProposalPayloadSchema,
    warnings: z.array(WarningSchema).max(20).default([]),
    model: ModelMetadataSchema,
  })
  .strict();
export type AiGenerationResult = z.infer<typeof AiGenerationResultSchema>;
