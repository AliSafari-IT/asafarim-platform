import { z } from "zod";
import { SEASONS, TEMPORAL_ERAS, TEMPORAL_PRECISIONS, type TemporalValue } from "@asafarim/timeline-contract";

/**
 * The date-precision contract itself (types, ordering, conflict detection)
 * lives in @asafarim/timeline-contract so other apps — the public AI
 * Workbench first — use TimelineAI's definition instead of a second one.
 * TimelineAI still owns it: this Zod schema is the validator, anchored to
 * that type, and everything is re-exported here so existing imports keep
 * working.
 */
export * from "@asafarim/timeline-contract";

export const TemporalValueSchema: z.ZodType<TemporalValue, z.ZodTypeDef, unknown> = z
  .object({
    precision: z.enum(TEMPORAL_PRECISIONS),
    era: z.enum(TEMPORAL_ERAS).default("CE"),
    year: z.number().int().min(1).max(9999).optional(),
    month: z.number().int().min(1).max(12).optional(),
    day: z.number().int().min(1).max(31).optional(),
    quarter: z.number().int().min(1).max(4).optional(),
    season: z.enum(SEASONS).optional(),
    rangeStart: z.lazy(() => TemporalValueSchema).optional(),
    rangeEnd: z.lazy(() => TemporalValueSchema).optional(),
    displayText: z.string().min(1).max(120),
  })
  .strict();
