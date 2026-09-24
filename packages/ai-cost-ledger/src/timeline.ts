import { z } from "zod";
import { coverageBasisPoints, coverageStatus, type CostBasis, type CostTotals, type CoverageStatus } from "./aggregate";
import { COST_SOURCES, CREDENTIAL_SOURCES } from "./event";

/**
 * Read-model contract shared by every app's cost timeline endpoint:
 * cursor pagination, UTC date filters, grouping, subtotals, grand total,
 * unknown count and coverage. Amounts cross the wire as integer-micro
 * **strings** (JSON has no bigint, and a JS number loses precision past
 * 2^53 micros ≈ $9bn — unlikely, but the contract should not care).
 */

export const DATE_PRESETS = ["7d", "30d", "90d", "month", "prev_month", "year", "custom"] as const;
export type DatePreset = (typeof DATE_PRESETS)[number];

export const COST_STATUS_FILTERS = ["actual", "estimated", "unknown", "fixture", "legacy"] as const;
export type CostStatusFilter = (typeof COST_STATUS_FILTERS)[number];

const csv = <T extends [string, ...string[]]>(values: T) =>
  z
    .union([z.array(z.enum(values)), z.string()])
    .optional()
    .transform((v) => {
      if (v === undefined) return undefined;
      const list = Array.isArray(v) ? v : v.split(",").filter(Boolean);
      const allowed = new Set<string>(values);
      const parsed = list.filter((x): x is T[number] => allowed.has(x));
      return parsed.length > 0 ? parsed : undefined;
    });

export const CostTimelineQuerySchema = z
  .object({
    preset: z.enum(DATE_PRESETS).default("30d"),
    from: z.string().datetime({ offset: true }).optional(),
    to: z.string().datetime({ offset: true }).optional(),
    cursor: z.string().max(400).optional(),
    limit: z.coerce.number().int().min(1).max(100).default(25),
    operation: z.string().max(400).optional(),
    provider: z.string().max(80).optional(),
    model: z.string().max(160).optional(),
    status: csv([...COST_STATUS_FILTERS] as [CostStatusFilter, ...CostStatusFilter[]]),
    credential: z.enum(CREDENTIAL_SOURCES).optional(),
    source: z.enum(COST_SOURCES).optional(),
  })
  .passthrough();
export type CostTimelineQuery = z.infer<typeof CostTimelineQuerySchema>;

export interface ResolvedRange {
  from: Date;
  /** Exclusive upper bound. */
  to: Date;
  preset: DatePreset;
}

const DAY_MS = 86_400_000;

/**
 * Resolve a preset/custom range to **UTC** instants. Aggregation always
 * uses these boundaries; the UI explains them in the viewer's timezone.
 * A custom range longer than `maxDays` is clamped, so one request cannot
 * ask the server to aggregate unbounded history.
 */
export function resolveRange(
  query: Pick<CostTimelineQuery, "preset" | "from" | "to">,
  now: Date = new Date(),
  maxDays = 366,
): ResolvedRange {
  const endOfToday = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()) + DAY_MS);
  switch (query.preset) {
    case "7d":
    case "30d":
    case "90d": {
      const days = Number.parseInt(query.preset, 10);
      return { preset: query.preset, from: new Date(endOfToday.getTime() - days * DAY_MS), to: endOfToday };
    }
    case "month":
      return { preset: "month", from: new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1)), to: endOfToday };
    case "prev_month":
      return {
        preset: "prev_month",
        from: new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - 1, 1)),
        to: new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1)),
      };
    case "year":
      return { preset: "year", from: new Date(Date.UTC(now.getUTCFullYear(), 0, 1)), to: endOfToday };
    case "custom": {
      const to = query.to ? new Date(query.to) : endOfToday;
      let from = query.from ? new Date(query.from) : new Date(to.getTime() - 30 * DAY_MS);
      if (from > to) from = new Date(to.getTime() - DAY_MS);
      if (to.getTime() - from.getTime() > maxDays * DAY_MS) from = new Date(to.getTime() - maxDays * DAY_MS);
      return { preset: "custom", from, to };
    }
  }
}

// ── Cursor ────────────────────────────────────────────────────────────────
// Timeline order is (occurredAt DESC, id DESC); the cursor is the last row
// of the previous page. Opaque base64url so clients never build one.

export interface TimelineCursor {
  occurredAt: Date;
  id: string;
}

export function encodeCursor(c: TimelineCursor): string {
  return Buffer.from(JSON.stringify({ t: c.occurredAt.toISOString(), i: c.id }), "utf8").toString("base64url");
}

export function decodeCursor(raw: string | undefined | null): TimelineCursor | null {
  if (!raw) return null;
  try {
    const parsed = JSON.parse(Buffer.from(raw, "base64url").toString("utf8")) as { t?: unknown; i?: unknown };
    if (typeof parsed.t !== "string" || typeof parsed.i !== "string" || parsed.i.length > 191) return null;
    const occurredAt = new Date(parsed.t);
    if (Number.isNaN(occurredAt.getTime())) return null;
    return { occurredAt, id: parsed.i };
  } catch {
    return null;
  }
}

// ── Wire DTOs ────────────────────────────────────────────────────────────

export interface CostTotalsDTO {
  eventCount: number;
  knownCount: number;
  unknownCount: number;
  actualCount: number;
  estimatedCount: number;
  fixtureCount: number;
  legacyCount: number;
  adjustmentCount: number;
  effectiveKnownMicros: string;
  actualMicros: string;
  estimatedMicros: string;
  adjustmentMicros: string;
  byokMicros: string;
  platformMicros: string;
  inputTokens: number;
  outputTokens: number;
  coverageBasisPoints: number | null;
  coverage: CoverageStatus;
}

export function totalsToDTO(t: CostTotals): CostTotalsDTO {
  return {
    eventCount: t.eventCount,
    knownCount: t.knownCount,
    unknownCount: t.unknownCount,
    actualCount: t.actualCount,
    estimatedCount: t.estimatedCount,
    fixtureCount: t.fixtureCount,
    legacyCount: t.legacyCount,
    adjustmentCount: t.adjustmentCount,
    effectiveKnownMicros: t.effectiveKnownMicros.toString(),
    actualMicros: t.actualMicros.toString(),
    estimatedMicros: t.estimatedMicros.toString(),
    adjustmentMicros: t.adjustmentMicros.toString(),
    byokMicros: t.byokMicros.toString(),
    platformMicros: t.platformMicros.toString(),
    inputTokens: t.inputTokens,
    outputTokens: t.outputTokens,
    coverageBasisPoints: coverageBasisPoints(t),
    coverage: coverageStatus(t),
  };
}

export interface TimelineItemDTO {
  id: string;
  occurredAt: string;
  operation: string;
  outcome: string;
  provider: string;
  model: string;
  promptVersion: string | null;
  usage: { bucket: string; unit: string; quantity: number }[];
  /** null = unknown ("Not tracked"), never rendered as $0.00. */
  amountMicros: string | null;
  basis: CostBasis;
  costSource: string;
  credentialSource: string;
  finality: string;
  latencyMs: number | null;
  legacy: boolean;
  subjectType: string;
  subjectId: string;
  workflowId: string | null;
}

export interface CostGroupDTO {
  key: string;
  label: string;
  /** Secondary line, e.g. employer or project name. */
  detail: string | null;
  kind: string;
  totals: CostTotalsDTO;
}

export interface CostTimelineResponse {
  range: { from: string; to: string; preset: DatePreset };
  summary: CostTotalsDTO;
  groups: CostGroupDTO[];
  items: TimelineItemDTO[];
  nextCursor: string | null;
  generatedAt: string;
}
