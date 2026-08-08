import type { TimelineEventInput, TimelineInput } from "../schemas";

/**
 * Editor-local event shape: adds a stable client-side `key` for React/DnD
 * identity before a new event has been saved (and thus has no server id).
 */
export interface EditorEvent extends Omit<TimelineEventInput, "sortOrder"> {
  key: string;
  sortOrder: number;
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

export function toTimelineInput(state: EditorState): TimelineInput {
  const events =
    state.sortMode === "chronological"
      ? [...state.events].sort((a, b) => {
          const at = a.startAt ? new Date(a.startAt).getTime() : Number.POSITIVE_INFINITY;
          const bt = b.startAt ? new Date(b.startAt).getTime() : Number.POSITIVE_INFINITY;
          return at - bt;
        })
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
