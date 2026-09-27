import type { TemporalValue } from "./temporal";

/**
 * The versioned shape other apps hand to TimelineAI when a person chooses to
 * continue with events they reviewed elsewhere (the public AI Workbench's
 * cited-timeline tool first). `payload` is exactly TimelineAI's
 * `events_extraction` proposal payload
 * (apps/timelineai/lib/ai/schemas.ts#EventsExtractionPayloadSchema), and a
 * TimelineAI test validates `toTimelineEventsImport` output against that
 * schema, so a change on either side fails CI instead of drifting.
 *
 * Bump TIMELINE_EVENTS_CONTRACT_VERSION on any breaking change.
 */
export const TIMELINE_EVENTS_CONTRACT_VERSION = "timelineai-events/1";

export type TimelineConfidence = "low" | "medium" | "high";

export interface TimelineCitation {
  label: string;
  url?: string;
  excerpt?: string;
}

export interface TimelineEventCandidate {
  title: string;
  description?: string;
  displayDate?: string;
  /** Set only when the date is exact to the day; never derived from a coarser value. */
  startAt?: string;
  endAt?: string;
  temporalValue?: TemporalValue;
  citations: TimelineCitation[];
  confidence: TimelineConfidence;
  /** True when no source passage supports the event; surfaced, never hidden. */
  uncitedInference: boolean;
}

export interface TimelineEventsImport {
  contractVersion: typeof TIMELINE_EVENTS_CONTRACT_VERSION;
  payload: { kind: "events_extraction"; events: TimelineEventCandidate[] };
}

/** TimelineAI's limits for an imported event (mirrors its Zod schema). */
export const TIMELINE_IMPORT_LIMITS = {
  events: 100,
  title: 200,
  description: 4000,
  displayDate: 64,
  displayText: 120,
  citations: 10,
  citationLabel: 200,
  excerpt: 500,
} as const;

export interface ReviewedTimelineEvent {
  title: string;
  description?: string;
  when: TemporalValue;
  citations: { label: string; excerpt?: string }[];
  confidence: TimelineConfidence;
  inferred: boolean;
}

/**
 * Maps reviewed events to TimelineAI's import payload. Keeps the stated
 * precision (`temporalValue` + `displayDate`), sets `startAt`/`endAt` only
 * for day-exact dates, and marks any event without a citation as an uncited
 * inference rather than dropping it. Returns null for an empty list, since
 * TimelineAI requires at least one event.
 */
export function toTimelineEventsImport(events: readonly ReviewedTimelineEvent[]): TimelineEventsImport | null {
  const L = TIMELINE_IMPORT_LIMITS;
  const mapped = events.slice(0, L.events).map((event): TimelineEventCandidate => {
    const citations = event.citations.slice(0, L.citations).map((c) => ({
      label: c.label.slice(0, L.citationLabel),
      ...(c.excerpt ? { excerpt: c.excerpt.slice(0, L.excerpt) } : {}),
    }));
    const when = clampTemporal(event.when);
    const start = when.precision === "range" ? when.rangeStart : when;
    const end = when.precision === "range" ? when.rangeEnd : undefined;
    const description = event.description?.trim();
    return {
      title: event.title.trim().slice(0, L.title),
      ...(description ? { description: description.slice(0, L.description) } : {}),
      displayDate: when.displayText.slice(0, L.displayDate),
      ...(start && exactDay(start) ? { startAt: isoDay(start) } : {}),
      ...(end && exactDay(end) ? { endAt: isoDay(end) } : {}),
      temporalValue: when,
      citations,
      confidence: event.confidence,
      uncitedInference: event.inferred || citations.length === 0,
    };
  });
  if (!mapped.length) return null;
  return { contractVersion: TIMELINE_EVENTS_CONTRACT_VERSION, payload: { kind: "events_extraction", events: mapped } };
}

function exactDay(value: TemporalValue): value is TemporalValue & { year: number; month: number; day: number } {
  return value.precision === "day" && value.era === "CE" && Boolean(value.year && value.month && value.day);
}

function isoDay(value: TemporalValue & { year: number; month: number; day: number }): string {
  const pad = (n: number, width = 2) => String(n).padStart(width, "0");
  return `${pad(value.year, 4)}-${pad(value.month)}-${pad(value.day)}T00:00:00.000Z`;
}

/** Keeps a value inside TimelineAI's schema limits without changing what it claims. */
function clampTemporal(value: TemporalValue): TemporalValue {
  const text = value.displayText.trim().slice(0, TIMELINE_IMPORT_LIMITS.displayText) || "Undated";
  return {
    ...value,
    displayText: text,
    ...(value.rangeStart ? { rangeStart: clampTemporal(value.rangeStart) } : {}),
    ...(value.rangeEnd ? { rangeEnd: clampTemporal(value.rangeEnd) } : {}),
  };
}
