import { z } from "zod";
import { SEASONS, TEMPORAL_ERAS, TEMPORAL_PRECISIONS, type TemporalPrecision, type TemporalValue } from "@asafarim/timeline-contract";

/**
 * Text → Cited Timeline contracts (#677). Versioned: bump
 * CITED_TIMELINE_SCHEMA_VERSION on any breaking change to input or output.
 *
 * Dates use TimelineAI's canonical `TemporalValue` from
 * @asafarim/timeline-contract, and the precision is always computed on the
 * server by TimelineAI's parser from the phrase the text actually uses — the
 * model never sets a precision, so it can't turn "spring 1990" into
 * 1990-04-01.
 */
export const CITED_TIMELINE_SCHEMA_VERSION = "cited-timeline/1";

export const DETAIL_LEVELS = ["key", "standard", "detailed"] as const;
export type DetailLevel = (typeof DETAIL_LEVELS)[number];
export const DETAIL_LABELS: Record<DetailLevel, string> = {
  key: "Key events only",
  standard: "Standard",
  detailed: "Detailed: every dated event",
};

export const CONFIDENCES = ["low", "medium", "high"] as const;
export type Confidence = (typeof CONFIDENCES)[number];

export const CONFLICT_KINDS = ["conflicting_dates", "impossible_range", "ordering", "ambiguous_date"] as const;
export type ConflictKind = (typeof CONFLICT_KINDS)[number];
export const CONFLICT_LABELS: Record<ConflictKind, string> = {
  conflicting_dates: "Conflicting dates",
  impossible_range: "Impossible range",
  ordering: "Order doesn't add up",
  ambiguous_date: "Ambiguous date",
};

export const PRECISION_LABELS: Record<TemporalPrecision, string> = {
  day: "Exact day",
  month: "Month",
  year: "Year",
  quarter: "Quarter",
  season: "Season",
  decade: "Decade",
  century: "Century",
  range: "Range",
  unknown: "Date unclear",
};

export const TEXT_LIMITS = { min: 40, max: 12_000 } as const;

// ── Input ────────────────────────────────────────────────────────────────────
const optionalText = (max: number, label: string) =>
  z
    .string()
    .trim()
    .max(max, `${label} is over the ${max.toLocaleString("en")}-character limit.`)
    .optional()
    .transform((v) => (v ? v : undefined));

export const timelineInputSchema = z
  .object({
    text: z
      .string()
      .trim()
      .min(TEXT_LIMITS.min, `Add a little more text — at least ${TEXT_LIMITS.min} characters.`)
      .max(TEXT_LIMITS.max, `The text is over the ${TEXT_LIMITS.max.toLocaleString("en")}-character limit.`),
    title: optionalText(120, "The title"),
    audience: optionalText(120, "The audience"),
    dateRange: optionalText(100, "The date range"),
    detail: z.enum(DETAIL_LEVELS).default("standard"),
  })
  .strict();
export type TimelineInput = z.output<typeof timelineInputSchema>;
export type TimelineInputRaw = z.input<typeof timelineInputSchema>;

// ── Output ───────────────────────────────────────────────────────────────────
/** Web's validator for TimelineAI's TemporalValue (same limits as apps/timelineai/lib/ai/temporal.ts). */
export const temporalValueSchema: z.ZodType<TemporalValue> = z.lazy(() =>
  z
    .object({
      precision: z.enum(TEMPORAL_PRECISIONS),
      era: z.enum(TEMPORAL_ERAS),
      year: z.number().int().min(1).max(9999).optional(),
      month: z.number().int().min(1).max(12).optional(),
      day: z.number().int().min(1).max(31).optional(),
      quarter: z.number().int().min(1).max(4).optional(),
      season: z.enum(SEASONS).optional(),
      rangeStart: temporalValueSchema.optional(),
      rangeEnd: temporalValueSchema.optional(),
      displayText: z.string().min(1).max(120),
    })
    .strict()
);

export const SOURCE_ID = /^S\d{1,3}$/;
export const EVENT_ID = /^EV-\d{2,3}$/;

export const timelineEventSchema = z
  .object({
    id: z.string().regex(EVENT_ID),
    title: z.string().trim().min(1).max(200),
    description: z.string().trim().max(1_000),
    when: temporalValueSchema,
    /** The wording hedges ("circa", "about", "early"): show it as approximate. */
    approximate: z.boolean(),
    /** "cited" quotes the text; "inferred" is an uncited inference (TimelineAI's `uncitedInference`). */
    basis: z.enum(["cited", "inferred"]),
    sourceIds: z.array(z.string().regex(SOURCE_ID)).max(10),
    confidence: z.enum(CONFIDENCES),
    /** Why the date or the event is uncertain. Required for inferred events. */
    uncertainty: z.string().trim().max(300).optional(),
  })
  .strict()
  .superRefine((e, ctx) => {
    if (e.basis === "cited" && !e.sourceIds.length) ctx.addIssue({ code: "custom", message: "cited events must cite a source", path: ["sourceIds"] });
    if (e.basis === "inferred" && !e.uncertainty) ctx.addIssue({ code: "custom", message: "inferred events must explain themselves", path: ["uncertainty"] });
  });
export type TimelineEvent = z.output<typeof timelineEventSchema>;

export const conflictSchema = z
  .object({
    id: z.string().regex(/^CF\d{1,2}$/),
    kind: z.enum(CONFLICT_KINDS),
    description: z.string().trim().min(1).max(500),
    eventIds: z.array(z.string().regex(EVENT_ID)).min(1).max(10),
    sourceIds: z.array(z.string().regex(SOURCE_ID)).max(10),
  })
  .strict();
export type TimelineConflict = z.output<typeof conflictSchema>;

export const citedTimelineSchema = z
  .object({
    schemaVersion: z.literal(CITED_TIMELINE_SCHEMA_VERSION),
    title: z.string().trim().min(1).max(200),
    summary: z.string().trim().min(1).max(1_000),
    sources: z.array(z.object({ id: z.string().regex(SOURCE_ID), text: z.string().min(1).max(600) }).strict()).min(1).max(150),
    /** In chronological order (TimelineAI's sort key); undated events last. */
    events: z.array(timelineEventSchema).min(1).max(60),
    conflicts: z.array(conflictSchema).max(20),
  })
  .strict()
  .superRefine((t, ctx) => {
    const sources = new Map(t.sources.map((s) => [s.id, s.text]));
    const events = new Set<string>();
    t.events.forEach((e, i) => {
      if (events.has(e.id)) ctx.addIssue({ code: "custom", message: `duplicate event id ${e.id}`, path: ["events", i, "id"] });
      events.add(e.id);
      for (const id of e.sourceIds) if (!sources.has(id)) ctx.addIssue({ code: "custom", message: `unknown source ${id}`, path: ["events", i, "sourceIds"] });
      // A cited, dated event's date phrase must be in the text it cites: no normalized or invented dates.
      if (e.basis === "cited" && e.when.precision !== "unknown" && !dateIsQuoted(e.when.displayText, e.sourceIds.map((id) => sources.get(id) ?? ""))) {
        ctx.addIssue({ code: "custom", message: `the date of ${e.id} isn't in its cited text`, path: ["events", i, "when"] });
      }
    });
    t.conflicts.forEach((c, i) => {
      for (const id of c.eventIds) if (!events.has(id)) ctx.addIssue({ code: "custom", message: `unknown event ${id}`, path: ["conflicts", i, "eventIds"] });
      for (const id of c.sourceIds) if (!sources.has(id)) ctx.addIssue({ code: "custom", message: `unknown source ${id}`, path: ["conflicts", i, "sourceIds"] });
    });
  });
export type CitedTimeline = z.output<typeof citedTimelineSchema>;

export function dateIsQuoted(phrase: string, texts: readonly string[]): boolean {
  const needle = normalize(phrase);
  return texts.some((t) => normalize(t).includes(needle));
}

function normalize(text: string): string {
  return text.toLowerCase().replace(/[–—]/g, "-").replace(/\s+/g, " ").trim();
}

const APPROXIMATE = /\b(?:circa|ca\.|c\.|about|around|approximately|roughly|some ?time|early|mid|late|probably|perhaps|possibly)\b|~/i;
export function isApproximate(phrase: string): boolean {
  return APPROXIMATE.test(phrase);
}

// ── What the model returns (precision and ids are added by the server) ──────
export const modelOutputSchema = z.object({
  title: z.string(),
  summary: z.string(),
  events: z.array(
    z.object({
      key: z.string(),
      title: z.string(),
      description: z.string(),
      /** The date exactly as the text words it, or "" when the text gives none. */
      dateText: z.string(),
      basis: z.enum(["cited", "inferred"]),
      sourceIds: z.array(z.string()),
      confidence: z.enum(CONFIDENCES),
      uncertainty: z.string(),
    })
  ),
  conflicts: z.array(z.object({ kind: z.enum(CONFLICT_KINDS), description: z.string(), eventKeys: z.array(z.string()), sourceIds: z.array(z.string()) })),
});
export type ModelOutput = z.output<typeof modelOutputSchema>;
