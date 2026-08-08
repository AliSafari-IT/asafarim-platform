"use client";

import {
  DndContext,
  closestCenter,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
  type DragEndEvent,
} from "@dnd-kit/core";
import {
  SortableContext,
  sortableKeyboardCoordinates,
  verticalListSortingStrategy,
  arrayMove,
} from "@dnd-kit/sortable";
import { EventCard } from "./EventCard";
import type { EditorEvent } from "@/lib/client/editor-types";

export interface EventEditorListProps {
  events: EditorEvent[];
  onReorder: (events: EditorEvent[]) => void;
  onChangeEvent: (key: string, patch: Partial<EditorEvent>) => void;
  onDuplicateEvent: (key: string) => void;
  onDeleteEvent: (key: string) => void;
  fieldErrors?: Record<string, Record<string, string>>;
}

/**
 * Drag-and-drop reordering (mouse/touch via dnd-kit) plus fully equivalent
 * keyboard reordering (Up/Down buttons on each card, and dnd-kit's own
 * keyboard sensor for Space+Arrow drag) — spec requires both to be
 * available, not just one as a fallback for the other.
 */
export function EventEditorList({
  events,
  onReorder,
  onChangeEvent,
  onDuplicateEvent,
  onDeleteEvent,
  fieldErrors,
}: EventEditorListProps) {
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 4 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates })
  );

  function handleDragEnd(dragEvent: DragEndEvent) {
    const { active, over } = dragEvent;
    if (!over || active.id === over.id) return;
    const oldIndex = events.findIndex((e) => e.key === active.id);
    const newIndex = events.findIndex((e) => e.key === over.id);
    if (oldIndex === -1 || newIndex === -1) return;
    onReorder(arrayMove(events, oldIndex, newIndex));
  }

  function moveByButton(key: string, direction: "up" | "down") {
    const index = events.findIndex((e) => e.key === key);
    const target = direction === "up" ? index - 1 : index + 1;
    if (index === -1 || target < 0 || target >= events.length) return;
    onReorder(arrayMove(events, index, target));
  }

  if (events.length === 0) {
    return (
      <p className="rounded-lg border border-dashed border-[var(--color-border,rgba(0,0,0,0.2))] p-6 text-center text-sm text-[var(--color-text-muted,inherit)]">
        No events yet — add your first one below.
      </p>
    );
  }

  return (
    // Explicit deterministic `id` — otherwise dnd-kit derives its internal
    // aria-describedby id from a module-level render counter, which drifts
    // between the SSR pass and the client's first render and trips a
    // (harmless but noisy) hydration-mismatch warning.
    <DndContext
      id="timeline-events-dnd"
      sensors={sensors}
      collisionDetection={closestCenter}
      onDragEnd={handleDragEnd}
    >
      <SortableContext items={events.map((e) => e.key)} strategy={verticalListSortingStrategy}>
        <ol className="flex flex-col gap-3">
          {events.map((event, index) => (
            <EventCard
              key={event.key}
              event={event}
              index={index}
              count={events.length}
              onChange={(patch) => onChangeEvent(event.key, patch)}
              onDuplicate={() => onDuplicateEvent(event.key)}
              onDelete={() => onDeleteEvent(event.key)}
              onMove={(direction) => moveByButton(event.key, direction)}
              errors={fieldErrors?.[event.key]}
            />
          ))}
        </ol>
      </SortableContext>
    </DndContext>
  );
}
