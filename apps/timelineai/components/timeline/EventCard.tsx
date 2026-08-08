"use client";

import { useSortable } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { GripVertical, ChevronUp, ChevronDown, Copy, Trash2 } from "lucide-react";
import type { EditorEvent } from "@/lib/client/editor-types";

export interface EventCardProps {
  event: EditorEvent;
  index: number;
  count: number;
  onChange: (patch: Partial<EditorEvent>) => void;
  onDuplicate: () => void;
  onDelete: () => void;
  onMove: (direction: "up" | "down") => void;
  errors?: Record<string, string>;
}

/** One event's editable fields, draggable and keyboard-reorderable. */
export function EventCard({ event, index, count, onChange, onDuplicate, onDelete, onMove, errors }: EventCardProps) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: event.key,
  });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.6 : 1,
  };

  return (
    <li
      ref={setNodeRef}
      style={style}
      className="rounded-lg border border-[var(--color-border,rgba(0,0,0,0.12))] bg-[var(--color-surface)] p-4"
    >
      <div className="mb-3 flex items-center gap-2">
        <button
          type="button"
          className="cursor-grab touch-none rounded p-1 text-[var(--color-text-muted,inherit)] hover:bg-black/5 active:cursor-grabbing"
          aria-label={`Drag to reorder "${event.title || "untitled event"}"`}
          {...attributes}
          {...listeners}
        >
          <GripVertical size={16} aria-hidden />
        </button>
        <span className="text-sm font-medium text-[var(--color-text-muted,inherit)]">
          Event {index + 1}
        </span>
        <div className="ml-auto flex items-center gap-1">
          <button
            type="button"
            className="rounded p-1.5 hover:bg-black/5 disabled:opacity-30"
            onClick={() => onMove("up")}
            disabled={index === 0}
            aria-label="Move event up"
          >
            <ChevronUp size={16} aria-hidden />
          </button>
          <button
            type="button"
            className="rounded p-1.5 hover:bg-black/5 disabled:opacity-30"
            onClick={() => onMove("down")}
            disabled={index === count - 1}
            aria-label="Move event down"
          >
            <ChevronDown size={16} aria-hidden />
          </button>
          <button
            type="button"
            className="rounded p-1.5 hover:bg-black/5"
            onClick={onDuplicate}
            aria-label="Duplicate event"
          >
            <Copy size={16} aria-hidden />
          </button>
          <button
            type="button"
            className="rounded p-1.5 text-red-600 hover:bg-red-500/10"
            onClick={onDelete}
            aria-label="Delete event"
          >
            <Trash2 size={16} aria-hidden />
          </button>
        </div>
      </div>

      <div className="grid gap-3 sm:grid-cols-2">
        <label className="flex flex-col gap-1 text-sm sm:col-span-2">
          <span>Title</span>
          <input
            className="rounded border border-[var(--color-border,rgba(0,0,0,0.2))] bg-transparent px-3 py-2"
            value={event.title}
            onChange={(e) => onChange({ title: e.target.value })}
            placeholder="What happened?"
          />
          {errors?.title ? <span className="text-xs text-red-600">{errors.title}</span> : null}
        </label>

        <label className="flex flex-col gap-1 text-sm">
          <span>Date</span>
          <input
            type="date"
            className="rounded border border-[var(--color-border,rgba(0,0,0,0.2))] bg-transparent px-3 py-2"
            value={event.startAt ? event.startAt.slice(0, 10) : ""}
            onChange={(e) =>
              onChange({ startAt: e.target.value ? new Date(e.target.value).toISOString() : null })
            }
          />
        </label>

        <label className="flex flex-col gap-1 text-sm">
          <span>End date (optional, for durations)</span>
          <input
            type="date"
            className="rounded border border-[var(--color-border,rgba(0,0,0,0.2))] bg-transparent px-3 py-2"
            value={event.endAt ? event.endAt.slice(0, 10) : ""}
            onChange={(e) =>
              onChange({ endAt: e.target.value ? new Date(e.target.value).toISOString() : null })
            }
          />
          {errors?.endAt ? <span className="text-xs text-red-600">{errors.endAt}</span> : null}
        </label>

        <label className="flex flex-col gap-1 text-sm sm:col-span-2">
          <span>Or, an approximate date (e.g. "Spring 1932", "circa 500 BCE")</span>
          <input
            className="rounded border border-[var(--color-border,rgba(0,0,0,0.2))] bg-transparent px-3 py-2"
            value={event.displayDate ?? ""}
            onChange={(e) => onChange({ displayDate: e.target.value || null })}
          />
        </label>

        <label className="flex flex-col gap-1 text-sm sm:col-span-2">
          <span>Description</span>
          <textarea
            className="min-h-20 rounded border border-[var(--color-border,rgba(0,0,0,0.2))] bg-transparent px-3 py-2"
            value={event.description ?? ""}
            onChange={(e) => onChange({ description: e.target.value || null })}
          />
        </label>

        <label className="flex flex-col gap-1 text-sm">
          <span>Label / category</span>
          <input
            className="rounded border border-[var(--color-border,rgba(0,0,0,0.2))] bg-transparent px-3 py-2"
            value={event.label ?? ""}
            onChange={(e) => onChange({ label: e.target.value || null })}
          />
        </label>

        <label className="flex flex-col gap-1 text-sm">
          <span>Accent color</span>
          <input
            type="color"
            className="h-10 w-full rounded border border-[var(--color-border,rgba(0,0,0,0.2))] bg-transparent"
            value={event.accentColor ?? "#6d5ef8"}
            onChange={(e) => onChange({ accentColor: e.target.value })}
          />
        </label>

        <label className="flex flex-col gap-1 text-sm">
          <span>Link (optional)</span>
          <input
            className="rounded border border-[var(--color-border,rgba(0,0,0,0.2))] bg-transparent px-3 py-2"
            value={event.link ?? ""}
            onChange={(e) => onChange({ link: e.target.value || null })}
            placeholder="https://…"
          />
          {errors?.link ? <span className="text-xs text-red-600">{errors.link}</span> : null}
        </label>

        <label className="flex flex-col gap-1 text-sm">
          <span>Image URL (optional)</span>
          <input
            className="rounded border border-[var(--color-border,rgba(0,0,0,0.2))] bg-transparent px-3 py-2"
            value={event.imageUrl ?? ""}
            onChange={(e) => onChange({ imageUrl: e.target.value || null })}
            placeholder="https://…"
          />
          {errors?.imageUrl ? <span className="text-xs text-red-600">{errors.imageUrl}</span> : null}
        </label>
      </div>
    </li>
  );
}
