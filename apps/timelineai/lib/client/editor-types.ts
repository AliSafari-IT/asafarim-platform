import type { TimelineEventInput, TimelineInput } from "../schemas";
import { temporalSortKey, type TemporalValue } from "../ai/temporal";

/**
 * Editor-local event shape: adds a stable client-side `key` for React/DnD
 * identity before a new event has been saved (and thus has no server id).
 *
 * `temporalPrecision` is display/sort-only — read from the server (set
 * only by an accepted AI temporal_correction proposal, never by manual
 * editing) and deliberately excluded from toTimelineInput's output below,
 * so a save can never write an arbitrary precision claim through this field.
 */
export interface EditorEvent extends Omit<TimelineEventInput, "sortOrder"> {
  key: string;
  sortOrder: number;
  temporalPrecision?: TemporalValue | null;
}

export interface EditorState {
  title: string;
  subtitle: string;
  description: string;
  timelineType: TimelineInput["timelineType"];
  layout: TimelineInput["layout"];
  theme: TimelineInput["theme"];
  events: EditorEvent[];
  /** "chronological" sorts by startAt at render/save time; "manual" keeps sortOrder as-is. */
  sortMode: "chronological" | "manual";
}

/**
 * A precision-aware AI temporal_correction (decade, century, season, ...)
 * has no exact startAt to sort by, but does have a resolvable anchor year
 * via lib/ai/temporal.ts#temporalSortKey — the same deterministic key the
 * server's conflict detection already uses (lib/ai/temporal.ts is the
 * source of truth; this reuses it rather than re-deriving an ordering).
 * Falls back to startAt for events with no recorded precision.
 */
function chronologicalSortKey(event: EditorEvent): number {
  if (event.temporalPrecision) return temporalSortKey(event.temporalPrecision);
  if (!event.startAt) return Number.POSITIVE_INFINITY;
  // Same year*10_000 + month*100 + day scale temporalSortKey uses (not
  // epoch milliseconds) so a startAt-only event and a precision-only event
  // compare on the same axis instead of two incompatible magnitudes.
  const d = new Date(event.startAt);
  return d.getUTCFullYear() * 10_000 + (d.getUTCMonth() + 1) * 100 + d.getUTCDate();
}

export function toTimelineInput(state: EditorState): TimelineInput {
  const events =
    state.sortMode === "chronological"
      ? [...state.events].sort((a, b) => chronologicalSortKey(a) - chronologicalSortKey(b))
      : state.events;

  return {
    title: state.title,
    subtitle: state.subtitle || null,
    description: state.description || null,
    timelineType: state.timelineType,
    layout: state.layout,
    theme: state.theme ?? null,
    events: events.map((event, index) => ({
      id: event.id,
      startAt: event.startAt || null,
      endAt: event.endAt || null,
      displayDate: event.displayDate || null,
      title: event.title,
      description: event.description || null,
      imageUrl: event.imageUrl || null,
      imageStorageKey: event.imageStorageKey || null,
      icon: event.icon || null,
      label: event.label || null,
      link: event.link || null,
      accentColor: event.accentColor || null,
      sortOrder: index,
    })),
  };
}

let keyCounter = 0;
export function newEventKey(): string {
  keyCounter += 1;
  return `new-${Date.now()}-${keyCounter}`;
}

export function blankEvent(sortOrder: number): EditorEvent {
  return {
    key: newEventKey(),
    startAt: null,
    endAt: null,
    displayDate: null,
    title: "",
    description: null,
    imageUrl: null,
    imageStorageKey: null,
    icon: null,
    label: null,
    link: null,
    accentColor: null,
    sortOrder,
  };
}
