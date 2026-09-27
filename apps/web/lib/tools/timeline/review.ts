import { compareTemporalValues, toTimelineEventsImport, type TimelineEventsImport } from "@asafarim/timeline-contract";
import { escapeMd } from "../test-plan/export";
import { isApproximate, PRECISION_LABELS, CITED_TIMELINE_SCHEMA_VERSION, CONFLICT_LABELS, type CitedTimeline, type TimelineConflict, type TimelineEvent } from "./schema";
import { precisionCaveat, readDate } from "./dates";

/**
 * Local review state for a generated timeline. Pure and browser-only:
 * nothing here is saved, published, or sent to TimelineAI.
 */
export type EventStatus = "accepted" | "rejected" | "pending";
export type EventOrigin = "ai" | "example" | "fixture" | "edited";
/**
 * `open`: not looked at yet. `unresolved`: the reader deliberately keeps both
 * claims. `corrected`: fixed by editing or rejecting events. `dismissed`: not
 * a real conflict.
 */
export type ConflictStatus = "open" | "unresolved" | "corrected" | "dismissed";

export interface ReviewEvent extends TimelineEvent {
  status: EventStatus;
  origin: EventOrigin;
  /** The reader changed the date: it's no longer the text's own wording. */
  dateEdited?: boolean;
}
export interface ReviewConflict extends TimelineConflict {
  status: ConflictStatus;
  note?: string;
}
export interface TimelineReview {
  /** In the reader's order. */
  events: ReviewEvent[];
  conflicts: ReviewConflict[];
}

export function initialTimelineReview(timeline: CitedTimeline, origin: EventOrigin): TimelineReview {
  const conflicted = new Set(timeline.conflicts.flatMap((c) => c.eventIds));
  return {
    // Only cited events outside any conflict start accepted; inferred or conflicted ones wait for a decision.
    events: timeline.events.map((e) => ({ ...e, origin, status: e.basis === "cited" && !conflicted.has(e.id) ? "accepted" : "pending" })),
    conflicts: timeline.conflicts.map((c) => ({ ...c, status: "open" })),
  };
}

export type TimelineAction =
  | { type: "set-status"; id: string; status: EventStatus }
  | { type: "accept-all-cited" }
  | { type: "move"; id: string; by: -1 | 1 }
  | { type: "sort-by-date" }
  | { type: "save-event"; event: ReviewEvent }
  | { type: "set-conflict"; id: string; status: ConflictStatus; note?: string }
  | { type: "reset"; state: TimelineReview };

export function timelineReducer(state: TimelineReview, action: TimelineAction): TimelineReview {
  switch (action.type) {
    case "set-status":
      return { ...state, events: state.events.map((e) => (e.id === action.id ? { ...e, status: action.status } : e)) };
    case "accept-all-cited":
      return { ...state, events: state.events.map((e) => (e.basis === "cited" && e.status === "pending" ? { ...e, status: "accepted" } : e)) };
    case "move": {
      const i = state.events.findIndex((e) => e.id === action.id);
      const j = i + action.by;
      if (i < 0 || j < 0 || j >= state.events.length) return state;
      const events = [...state.events];
      [events[i], events[j]] = [events[j], events[i]];
      return { ...state, events };
    }
    case "sort-by-date": {
      const events = state.events.map((e, index) => ({ e, index })).sort((a, b) => compareTemporalValues(a.e.when, b.e.when) || a.index - b.index);
      return { ...state, events: events.map(({ e }) => e) };
    }
    case "save-event":
      return { ...state, events: state.events.map((e) => (e.id === action.event.id ? action.event : e)) };
    case "set-conflict":
      return {
        ...state,
        conflicts: state.conflicts.map((c) => (c.id === action.id ? { ...c, status: action.status, ...(action.note?.trim() ? { note: action.note.trim().slice(0, 300) } : {}) } : c)),
      };
    case "reset":
      return action.state;
  }
}

export interface EventDraft {
  title: string;
  description: string;
  dateText: string;
}

export function eventDraft(e: TimelineEvent): EventDraft {
  return { title: e.title, description: e.description, dateText: e.when.precision === "unknown" && e.when.displayText === "Undated" ? "" : e.when.displayText };
}

/**
 * Applies an edit. The date is re-read with TimelineAI's parser, so the
 * reader can't set a precision the words don't support either; a changed
 * date is marked as edited because it's no longer the text's own wording.
 */
export function applyEventEdit(event: ReviewEvent, draft: EventDraft): { ok: true; event: ReviewEvent } | { ok: false; errors: string[] } {
  const title = draft.title.trim();
  if (!title) return { ok: false, errors: ["Add a title."] };
  const previousDate = eventDraft(event).dateText;
  const dateChanged = draft.dateText.trim() !== previousDate.trim();
  const when = dateChanged ? readDate(draft.dateText) : event.when;
  const caveat = dateChanged ? precisionCaveat(when) : null;
  return {
    ok: true,
    event: {
      ...event,
      title: title.slice(0, 200),
      description: draft.description.trim().slice(0, 1_000),
      when,
      approximate: dateChanged ? isApproximate(when.displayText) : event.approximate,
      ...(dateChanged ? { dateEdited: true } : {}),
      ...(caveat ? { uncertainty: caveat } : {}),
      origin: "edited",
    },
  };
}

/** Human description of a date, precision first: "Year: 1924", "Range: from 1998 to 2003". */
export function describeWhen(e: Pick<TimelineEvent, "when" | "approximate">): string {
  const prefix = e.approximate ? "About " : "";
  return e.when.precision === "unknown" ? e.when.displayText : `${prefix}${e.when.displayText}`;
}

export const EXPORT_NOTICE = "Draft timeline for review: only accepted events are included, and nothing has been published or sent to TimelineAI.";

export function acceptedEvents(review: TimelineReview): ReviewEvent[] {
  return review.events.filter((e) => e.status === "accepted");
}

export interface TimelineExport {
  schemaVersion: typeof CITED_TIMELINE_SCHEMA_VERSION;
  exportedAt: string;
  notice: string;
  title: string;
  summary: string;
  events: ReviewEvent[];
  conflicts: ReviewConflict[];
  sources: CitedTimeline["sources"];
  excluded: { rejected: number; pending: number };
}

export function toExportJson(timeline: CitedTimeline, review: TimelineReview, now = new Date()): TimelineExport {
  const events = acceptedEvents(review);
  const ids = new Set(events.map((e) => e.id));
  return {
    schemaVersion: CITED_TIMELINE_SCHEMA_VERSION,
    exportedAt: now.toISOString(),
    notice: EXPORT_NOTICE,
    title: timeline.title,
    summary: timeline.summary,
    events: events.map((e) => ({ ...e })),
    conflicts: review.conflicts.filter((c) => c.eventIds.some((id) => ids.has(id))).map((c) => ({ ...c })),
    sources: timeline.sources,
    excluded: { rejected: review.events.filter((e) => e.status === "rejected").length, pending: review.events.filter((e) => e.status === "pending").length },
  };
}

/** TimelineAI's versioned import payload for the accepted events, or null if none. */
export function toTimelineAiImport(timeline: CitedTimeline, review: TimelineReview): TimelineEventsImport | null {
  const sources = new Map(timeline.sources.map((s) => [s.id, s.text]));
  return toTimelineEventsImport(
    acceptedEvents(review).map((e) => ({
      title: e.title,
      description: [e.description, e.uncertainty ? `Uncertainty: ${e.uncertainty}` : ""].filter(Boolean).join("\n\n"),
      when: e.when,
      citations: e.sourceIds.map((id) => ({ label: id, excerpt: sources.get(id) })),
      confidence: e.confidence,
      inferred: e.basis === "inferred",
    }))
  );
}

const STATUS_LABEL: Record<ConflictStatus, string> = {
  open: "not reviewed",
  unresolved: "kept unresolved on purpose",
  corrected: "corrected",
  dismissed: "dismissed as not a conflict",
};
export { STATUS_LABEL as CONFLICT_STATUS_LABEL };

export function toMarkdown(timeline: CitedTimeline, review: TimelineReview): string {
  const sources = new Map(timeline.sources.map((s) => [s.id, s.text]));
  const data = toExportJson(timeline, review);
  const out = [`# Timeline: ${escapeMd(timeline.title)}`, "", `> ${EXPORT_NOTICE}`, "", escapeMd(timeline.summary), "", "## Events", ""];
  for (const e of data.events) {
    out.push(`### ${escapeMd(describeWhen(e))} — ${escapeMd(e.title)}`, "");
    out.push(`- **Date precision:** ${PRECISION_LABELS[e.when.precision]}${e.approximate ? " (approximate)" : ""}${e.dateEdited ? " — date edited by you" : ""}`);
    out.push(`- **Confidence:** ${e.confidence}`);
    if (e.basis === "cited") out.push(`- **Source:** ${e.sourceIds.map((id) => `${id} "${escapeMd(sources.get(id) ?? "")}"`).join("; ")}`);
    else out.push("- **Uncited inference:** not stated in the text");
    if (e.uncertainty) out.push(`- **Uncertainty:** ${escapeMd(e.uncertainty)}`);
    if (e.description) out.push("", escapeMd(e.description));
    out.push("");
  }
  if (data.conflicts.length) {
    out.push("## Conflicts", "");
    for (const c of data.conflicts) {
      out.push(`- **${c.id} ${CONFLICT_LABELS[c.kind]}** (${STATUS_LABEL[c.status]}): ${escapeMd(c.description)} _(${c.eventIds.join(", ")})_${c.note ? ` Note: ${escapeMd(c.note)}` : ""}`);
    }
    out.push("");
  }
  if (data.excluded.rejected || data.excluded.pending) {
    out.push(`_Not included: ${data.excluded.rejected} rejected and ${data.excluded.pending} unreviewed event(s)._`, "");
  }
  out.push("## Source text", "", ...timeline.sources.map((s) => `- **${s.id}** ${escapeMd(s.text)}`), "");
  return out.join("\n");
}

export type { TimelineConflict };
