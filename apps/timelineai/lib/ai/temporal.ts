import { z } from "zod";

/**
 * A date/time value that represents exactly how certain the source was —
 * never coerced to a false exact date. "circa 1200 BCE" stays a
 * century-precision BCE year; "early 2020" stays a quarter-ish range; only
 * a source that actually gave a day gets precision "day". Downstream code
 * (sorting, display, TimelineEvent.startAt/endAt) must read `precision`
 * before trusting any numeric field.
 */

export const TEMPORAL_PRECISIONS = [
  "day", // exact calendar date
  "month",
  "year",
  "quarter", // Q1-Q4 of a year
  "season", // spring/summer/autumn/winter of a year
  "decade",
  "century",
  "range", // an explicit start..end span, itself of any precision
  "unknown", // recognized as *a* date reference but not parseable to a value
] as const;
export type TemporalPrecision = (typeof TEMPORAL_PRECISIONS)[number];

export const TEMPORAL_ERAS = ["CE", "BCE"] as const;
export type TemporalEra = (typeof TEMPORAL_ERAS)[number];

export const SEASONS = ["spring", "summer", "autumn", "winter"] as const;
export type Season = (typeof SEASONS)[number];

// Declared by hand (rather than inferred) because the schema below is
// self-referential via rangeStart/rangeEnd — z.infer can't resolve a
// recursive z.lazy() without an explicit type to anchor it to.
export interface TemporalValue {
  precision: TemporalPrecision;
  era: TemporalEra;
  year?: number;
  month?: number; // set only when precision is "day" or "month"
  day?: number; // set only when precision is "day"
  quarter?: number;
  season?: Season;
  /** Only for precision "range" — both ends are themselves TemporalValues, so a range can span approximate bounds ("between the 1990s and 2005"). */
  rangeStart?: TemporalValue;
  rangeEnd?: TemporalValue;
  /** Original phrase, always preserved verbatim for display — never overwritten by a normalized guess. */
  displayText: string;
}

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

export class ImpossibleRangeError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ImpossibleRangeError";
  }
}

/**
 * A representative year for sorting/comparison only — never used to
 * overwrite `displayText` or claim a precision the value doesn't have.
 * Range values use their start's anchor; decade/century use their first
 * year; BCE years sort before CE by negating.
 */
function anchorYear(value: TemporalValue): number | null {
  const base = value.precision === "range" ? value.rangeStart ?? null : value;
  if (!base?.year) return null;
  return value.era === "BCE" || base.era === "BCE" ? -base.year : base.year;
}

const QUARTER_MONTH: Record<number, number> = { 1: 1, 2: 4, 3: 7, 4: 10 };
const SEASON_MONTH: Record<Season, number> = { spring: 3, summer: 6, autumn: 9, winter: 12 };

/**
 * A deterministic numeric sort key. Same precision/year always produces
 * the same key (stable across runs), and coarser precisions sort by their
 * earliest plausible instant — a decade sorts before any exact date within
 * it, which is the least-surprising placement for "approximate before
 * precise" ties.
 */
export function temporalSortKey(value: TemporalValue): number {
  const year = anchorYear(value);
  if (year === null) return Number.POSITIVE_INFINITY; // "unknown" sorts last, deterministically

  let month = 1;
  if (value.precision === "day" || value.precision === "month") month = value.month ?? 1;
  else if (value.precision === "quarter" && value.quarter) month = QUARTER_MONTH[value.quarter] ?? 1;
  else if (value.precision === "season" && value.season) month = SEASON_MONTH[value.season] ?? 1;

  const day = value.precision === "day" ? value.day ?? 1 : 1;
  return year * 10_000 + month * 100 + day;
}

/**
 * Deterministic total order across every precision, including "unknown"
 * (undated) — those sort last, in original array order relative to each
 * other, satisfying "sorting is deterministic across exact, ranged,
 * approximate, and undated events" without ever comparing incomparable
 * precisions as if they were equally exact.
 */
export function compareTemporalValues(a: TemporalValue, b: TemporalValue): number {
  return temporalSortKey(a) - temporalSortKey(b);
}

export interface OrderingConstraint {
  eventId: string;
  beforeEventId?: string;
  afterEventId?: string;
}

export interface TemporalConflict {
  code: "impossible_range" | "ordering_cycle" | "ordering_violation";
  message: string;
  eventIds: string[];
}

/** Range end must not sort before its own start — recursed into, so a range-of-ranges is checked too. */
function checkImpossibleRanges(eventId: string, value: TemporalValue, out: TemporalConflict[]): void {
  if (value.precision === "range" && value.rangeStart && value.rangeEnd) {
    if (temporalSortKey(value.rangeEnd) < temporalSortKey(value.rangeStart)) {
      out.push({
        code: "impossible_range",
        message: `"${value.displayText}" has an end before its start.`,
        eventIds: [eventId],
      });
    }
    checkImpossibleRanges(eventId, value.rangeStart, out);
    checkImpossibleRanges(eventId, value.rangeEnd, out);
  }
}

/**
 * Surfaces contradictions instead of resolving them: impossible ranges,
 * cycles in explicit before/after constraints, and a constraint that
 * disagrees with the events' own resolved dates. Nothing here mutates
 * anything — this is read-only, for a conflict-review panel to display
 * with citations and a "leave unresolved" option.
 */
export function detectTemporalConflicts(
  events: { id: string; value: TemporalValue }[],
  constraints: OrderingConstraint[] = []
): TemporalConflict[] {
  const conflicts: TemporalConflict[] = [];
  const byId = new Map(events.map((e) => [e.id, e.value]));

  for (const event of events) checkImpossibleRanges(event.id, event.value, conflicts);

  // Cycle detection over the explicit before/after graph (DFS, small N expected per timeline).
  const graph = new Map<string, string[]>();
  for (const c of constraints) {
    if (c.beforeEventId) {
      graph.set(c.eventId, [...(graph.get(c.eventId) ?? []), c.beforeEventId]);
    }
    if (c.afterEventId) {
      graph.set(c.afterEventId, [...(graph.get(c.afterEventId) ?? []), c.eventId]);
    }
  }
  const visiting = new Set<string>();
  const visited = new Set<string>();
  const stack: string[] = [];
  function dfs(node: string): boolean {
    if (visiting.has(node)) {
      const cycleStart = stack.indexOf(node);
      conflicts.push({
        code: "ordering_cycle",
        message: "These events have contradictory before/after constraints that form a cycle.",
        eventIds: stack.slice(cycleStart >= 0 ? cycleStart : 0).concat(node),
      });
      return true;
    }
    if (visited.has(node)) return false;
    visiting.add(node);
    stack.push(node);
    for (const next of graph.get(node) ?? []) {
      if (dfs(next)) return true;
    }
    stack.pop();
    visiting.delete(node);
    visited.add(node);
    return false;
  }
  for (const node of graph.keys()) {
    if (!visited.has(node)) dfs(node);
  }

  // A constraint that disagrees with the events' own resolved (known) dates.
  for (const c of constraints) {
    if (!c.beforeEventId) continue;
    const a = byId.get(c.eventId);
    const b = byId.get(c.beforeEventId);
    if (!a || !b) continue;
    const keyA = temporalSortKey(a);
    const keyB = temporalSortKey(b);
    if (Number.isFinite(keyA) && Number.isFinite(keyB) && keyA > keyB) {
      conflicts.push({
        code: "ordering_violation",
        message: `"${a.displayText}" is marked before "${b.displayText}" but its own date is later.`,
        eventIds: [c.eventId, c.beforeEventId],
      });
    }
  }

  return conflicts;
}
