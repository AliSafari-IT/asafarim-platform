import { z } from "zod";
import { TemporalValueSchema } from "./temporal";

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

export const NarrativeSuggestionPayloadSchema = z
  .object({
    kind: z.literal("narrative_suggestion"),
    eventId: z.string().min(1).max(64).optional(), // absent = timeline-level (title/subtitle/description)
    field: z.enum(["title", "subtitle", "description"]),
    suggestedText: z.string().min(1).max(4000),
    rationale: z.string().max(1000).optional(),
    confidence: ConfidenceSchema,
  })
  .strict();

export const VisualRecommendationPayloadSchema = z
  .object({
    kind: z.literal("visual_recommendation"),
    layout: z.string().min(1).max(32).optional(),
    theme: z.record(z.string(), z.unknown()).optional(),
    rationale: z.string().max(1000).optional(),
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
