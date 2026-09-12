"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { ConfirmDialog } from "@asafarim/ui";
import { EventEditorList } from "./EventEditorList";
import { TimelineRenderer } from "./renderers/TimelineRenderer";
import { TimelineAppearance } from "./TimelineAppearance";
import { AiCopilotPanel } from "./AiCopilotPanel";
import { TimelineInputSchema, TIMELINE_TYPES } from "@/lib/schemas";
import { TYPE_LABELS } from "@/lib/labels";
import { resolveLayoutForType } from "@/lib/timeline-config";
import { apiFetch, ApiError } from "@/lib/client/api";
import {
  blankEvent,
  toTimelineInput,
  type EditorEvent,
  type EditorState,
} from "@/lib/client/editor-types";

export interface TimelineEditorProps {
  mode: "create" | "edit";
  timelineId?: string;
  initial?: Partial<EditorState>;
  version?: number;
  /** Guests never see the publish action — only save/submit for review. */
  isGuest?: boolean;
  onSaved?: (result: { id: string; publicId: string }) => void;
}

function emptyState(initial?: Partial<EditorState>): EditorState {
  return {
    title: "",
    subtitle: "",
    description: "",
    timelineType: "general",
    layout: "vertical",
    theme: null,
    events: [blankEvent(0)],
    sortMode: "manual",
    aiLockedFields: [],
    ...initial,
  };
}

/**
 * aiLocked/aiLockedFields/temporalPrecision are display-only fields that
 * persist immediately through their own dedicated endpoints the moment a
 * user toggles them (see handleToggleEventLock/handleToggleFieldLock below)
 * — they should never make the editor think there's unsaved manual work,
 * so the dirty check compares state with them stripped out.
 */
function dirtyCheckReplacer(key: string, value: unknown): unknown {
  if (key === "aiLocked" || key === "aiLockedFields" || key === "temporalPrecision") return undefined;
  return value;
}

export function TimelineEditor({ mode, timelineId, initial, version, isGuest, onSaved }: TimelineEditorProps) {
  const router = useRouter();
  const [state, setState] = useState<EditorState>(() => emptyState(initial));
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<Record<string, Record<string, string>>>({});
  const [confirmDeleteKey, setConfirmDeleteKey] = useState<string | null>(null);
  const [confirmDiscard, setConfirmDiscard] = useState(false);
  const [confirmReloadForAi, setConfirmReloadForAi] = useState(false);
  const [lockError, setLockError] = useState<string | null>(null);
  const [lockBusyKey, setLockBusyKey] = useState<string | null>(null);
  const [fieldLockBusy, setFieldLockBusy] = useState(false);
  const isDirty = useMemo(
    () => JSON.stringify(state, dirtyCheckReplacer) !== JSON.stringify(emptyState(initial), dirtyCheckReplacer),
    [state, initial]
  );

  function updateEvent(key: string, patch: Partial<EditorEvent>) {
    setState((s) => ({ ...s, events: s.events.map((e) => (e.key === key ? { ...e, ...patch } : e)) }));
  }

  /**
   * Locking is a protection setting, not an AI-generation action — it
   * persists immediately through its own endpoint, independent of both the
   * AI kill switch and the "Save changes" button, and of whether the event
   * has been saved yet at all (a brand-new, not-yet-saved event has no id
   * to lock).
   */
  async function handleToggleEventLock(key: string) {
    const target = state.events.find((e) => e.key === key);
    if (!target?.id || !timelineId) return;
    setLockError(null);
    setLockBusyKey(key);
    const nextLocked = !target.aiLocked;
    try {
      await apiFetch(`/api/timelines/${timelineId}/events/${target.id}/ai-lock`, {
        method: "PUT",
        body: { locked: nextLocked },
      });
      updateEvent(key, { aiLocked: nextLocked });
    } catch (error) {
      setLockError(error instanceof ApiError ? error.message : "Couldn't update that lock. Please try again.");
    } finally {
      setLockBusyKey(null);
    }
  }

  async function handleToggleFieldLock(field: "title" | "subtitle" | "description") {
    if (!timelineId) return;
    setLockError(null);
    setFieldLockBusy(true);
    const nextFields = state.aiLockedFields.includes(field)
      ? state.aiLockedFields.filter((f) => f !== field)
      : [...state.aiLockedFields, field];
    try {
      await apiFetch(`/api/timelines/${timelineId}/ai/lock`, { method: "PUT", body: { fields: nextFields } });
      setState((s) => ({ ...s, aiLockedFields: nextFields }));
    } catch (error) {
      setLockError(error instanceof ApiError ? error.message : "Couldn't update that lock. Please try again.");
    } finally {
      setFieldLockBusy(false);
    }
  }

  function duplicateEvent(key: string) {
    setState((s) => {
      const source = s.events.find((e) => e.key === key);
      if (!source) return s;
      const index = s.events.findIndex((e) => e.key === key);
      const copy: EditorEvent = { ...source, key: `${key}-copy-${Date.now()}` };
      const events = [...s.events];
      events.splice(index + 1, 0, copy);
      return { ...s, events };
    });
  }

  function requestDeleteEvent(key: string) {
    // Destructive action gets a confirm step per spec §5 ("undo or
    // confirmation for destructive editor actions") — deleting an event
    // with content is not reversible in this editor session.
    const target = state.events.find((e) => e.key === key);
    if (target && !target.title && !target.description) {
      setState((s) => ({ ...s, events: s.events.filter((e) => e.key !== key) }));
      return;
    }
    setConfirmDeleteKey(key);
  }

  function confirmDeleteEvent() {
    if (!confirmDeleteKey) return;
    setState((s) => ({ ...s, events: s.events.filter((e) => e.key !== confirmDeleteKey) }));
    setConfirmDeleteKey(null);
  }

  async function handleSave() {
    setFormError(null);
    setFieldErrors({});
    const input = toTimelineInput(state);
    const parsed = TimelineInputSchema.safeParse(input);
    if (!parsed.success) {
      const perEvent: Record<string, Record<string, string>> = {};
      let topLevel: string | null = null;
      for (const issue of parsed.error.issues) {
        if (issue.path[0] === "events" && typeof issue.path[1] === "number") {
          const key = state.events[issue.path[1] as number]?.key;
          const field = String(issue.path[2] ?? "general");
          if (key) perEvent[key] = { ...perEvent[key], [field]: issue.message };
        } else {
          topLevel = issue.message;
        }
      }
      setFieldErrors(perEvent);
      setFormError(topLevel ?? "Please fix the highlighted fields before saving.");
      return;
    }

    setSaving(true);
    try {
      if (mode === "create") {
        const result = await apiFetch<{ timeline: { id: string; publicId: string } }>("/api/timelines", {
          method: "POST",
          body: parsed.data,
        });
        onSaved?.(result.timeline);
      } else if (timelineId) {
        const result = await apiFetch<{ timeline: { id: string; publicId: string; version: number } }>(
          `/api/timelines/${timelineId}`,
          { method: "PUT", body: { ...parsed.data, version } }
        );
        onSaved?.(result.timeline);
      }
    } catch (error) {
      if (error instanceof ApiError && error.status === 409) {
        setFormError(error.message);
      } else if (error instanceof ApiError) {
        setFormError(error.message);
      } else {
        setFormError("Something went wrong saving your timeline. Please try again.");
      }
    } finally {
      setSaving(false);
    }
  }

  function handleAiApplied() {
    // The copilot panel writes straight to the saved timeline, independent
    // of this component's local draft state — reloading is the simplest
    // honest way to bring the form fields back in sync with it. Unsaved
    // manual edits would be lost, so that path is confirmed first.
    if (isDirty) {
      setConfirmReloadForAi(true);
    } else {
      window.location.reload();
    }
  }

  const previewInput = toTimelineInput(state);

  return (
    <div className="grid gap-8 lg:grid-cols-2">
      <div className="flex flex-col gap-6">
        {isGuest ? (
          <div className="rounded-lg border border-amber-500/40 bg-amber-500/10 p-3 text-sm">
            You're creating this without an account. It will be reviewed by an admin before it's
            publicly shareable — you can still preview and export it right away.
          </div>
        ) : null}

        {formError ? (
          <div role="alert" className="rounded-lg border border-red-500/40 bg-red-500/10 p-3 text-sm">
            {formError}
          </div>
        ) : null}

        <label className="flex flex-col gap-1 text-sm">
          <span className="font-medium">Title</span>
          <input
            className="rounded border border-[var(--color-border,rgba(0,0,0,0.2))] bg-transparent px-3 py-2"
            value={state.title}
            onChange={(e) => setState((s) => ({ ...s, title: e.target.value }))}
            placeholder="e.g. Our company's first year"
          />
        </label>

        <label className="flex flex-col gap-1 text-sm">
          <span className="font-medium">Subtitle / introduction (optional)</span>
          <input
            className="rounded border border-[var(--color-border,rgba(0,0,0,0.2))] bg-transparent px-3 py-2"
            value={state.subtitle}
            onChange={(e) => setState((s) => ({ ...s, subtitle: e.target.value }))}
          />
        </label>

        {mode === "edit" && timelineId ? (
          <fieldset className="flex flex-col gap-2 rounded-lg border border-[var(--color-border,rgba(0,0,0,0.15))] p-3 text-sm">
            <legend className="px-1 font-medium">Protect from AI rewrites</legend>
            <p className="text-xs text-[var(--color-text-muted,inherit)]">
              The AI copilot's narrative suggestions will never touch a checked field, whether or not it's
              currently turned on.
            </p>
            <div className="flex flex-wrap gap-4">
              {(["title", "subtitle", "description"] as const).map((field) => (
                <label key={field} className="flex items-center gap-1.5">
                  <input
                    type="checkbox"
                    checked={state.aiLockedFields.includes(field)}
                    onChange={() => handleToggleFieldLock(field)}
                    disabled={fieldLockBusy}
                  />
                  {field === "title" ? "Title" : field === "subtitle" ? "Subtitle" : "Description"}
                </label>
              ))}
            </div>
            {lockError ? (
              <p role="alert" className="text-xs text-red-600">
                {lockError}
              </p>
            ) : null}
          </fieldset>
        ) : null}

        <label className="flex flex-col gap-1 text-sm">
          <span className="font-medium">Type</span>
          <select
            className="rounded border border-[var(--color-border,rgba(0,0,0,0.2))] bg-transparent px-3 py-2"
            value={state.timelineType}
            onChange={(e) => {
              const timelineType = e.target.value as EditorState["timelineType"];
              // Keep the current layout when it still suits the new type,
              // otherwise fall back to that type's first option. Events are
              // untouched either way — this is a presentation change.
              setState((s) => ({
                ...s,
                timelineType,
                layout: resolveLayoutForType(timelineType, s.layout),
              }));
            }}
          >
            {TIMELINE_TYPES.map((t) => (
              <option key={t} value={t}>
                {TYPE_LABELS[t]}
              </option>
            ))}
          </select>
        </label>

        <TimelineAppearance
          timelineType={state.timelineType}
          layout={state.layout}
          theme={state.theme}
          onLayoutChange={(layout) => setState((s) => ({ ...s, layout }))}
          onThemeChange={(patch) => setState((s) => ({ ...s, theme: { ...(s.theme ?? {}), ...patch } }))}
        />

        <fieldset className="flex items-center gap-4 text-sm">
          <legend className="mb-1 font-medium">Event order</legend>
          <label className="flex items-center gap-1.5">
            <input
              type="radio"
              name="sortMode"
              checked={state.sortMode === "chronological"}
              onChange={() => setState((s) => ({ ...s, sortMode: "chronological" }))}
            />
            Sort automatically by date
          </label>
          <label className="flex items-center gap-1.5">
            <input
              type="radio"
              name="sortMode"
              checked={state.sortMode === "manual"}
              onChange={() => setState((s) => ({ ...s, sortMode: "manual" }))}
            />
            Order manually
          </label>
        </fieldset>

        <div>
          <div className="mb-2 flex items-center justify-between">
            <h2 className="font-medium">Events</h2>
            <button
              type="button"
              className="rounded-lg bg-[var(--color-primary)] px-3 py-1.5 text-sm font-medium text-white"
              onClick={() => setState((s) => ({ ...s, events: [...s.events, blankEvent(s.events.length)] }))}
            >
              + Add event
            </button>
          </div>
          <EventEditorList
            events={state.events}
            onReorder={(events) => setState((s) => ({ ...s, events }))}
            onChangeEvent={updateEvent}
            onDuplicateEvent={duplicateEvent}
            onDeleteEvent={requestDeleteEvent}
            fieldErrors={fieldErrors}
            onToggleLock={mode === "edit" && timelineId ? handleToggleEventLock : undefined}
            lockBusyKey={lockBusyKey}
          />
        </div>

        {mode === "edit" && timelineId ? (
          <AiCopilotPanel
            timelineId={timelineId}
            events={state.events
              .filter((e): e is EditorEvent & { id: string } => !!e.id)
              .map((e) => ({ id: e.id, title: e.title, aiLocked: e.aiLocked }))}
            aiLockedFields={state.aiLockedFields}
            onApplied={handleAiApplied}
          />
        ) : null}

        <div className="flex items-center gap-3">
          <button
            type="button"
            className="rounded-lg bg-[var(--color-primary)] px-5 py-2.5 font-medium text-white disabled:opacity-50"
            onClick={handleSave}
            disabled={saving}
            aria-busy={saving || undefined}
          >
            {saving ? "Saving…" : isGuest ? "Submit for review" : mode === "create" ? "Save timeline" : "Save changes"}
          </button>
          <button
            type="button"
            className="rounded-lg border border-[var(--color-border,currentColor)] px-5 py-2.5 font-medium"
            onClick={() => (isDirty ? setConfirmDiscard(true) : router.back())}
          >
            Cancel
          </button>
        </div>
      </div>

      <div className="lg:sticky lg:top-6 lg:self-start">
        <h2 className="mb-3 text-sm font-medium text-[var(--color-text-muted,inherit)]">Live preview</h2>
        <div className="rounded-xl border border-[var(--color-border,rgba(0,0,0,0.12))] bg-[var(--color-surface)] p-6">
          <TimelineRenderer layout={state.layout} timeline={previewInput} />
        </div>
      </div>

      <ConfirmDialog
        open={confirmDeleteKey !== null}
        title="Delete this event?"
        message="This event has content and can't be recovered once deleted."
        tone="danger"
        confirmLabel="Delete"
        onConfirm={confirmDeleteEvent}
        onCancel={() => setConfirmDeleteKey(null)}
      />
      <ConfirmDialog
        open={confirmDiscard}
        title="Discard your changes?"
        message="You'll lose anything you've entered on this timeline."
        tone="danger"
        confirmLabel="Discard"
        onConfirm={() => router.back()}
        onCancel={() => setConfirmDiscard(false)}
      />
      <ConfirmDialog
        open={confirmReloadForAi}
        title="Reload to see the AI change?"
        message="The AI copilot already saved this change to your timeline. Reloading shows it in the fields above, but any unsaved manual edits here will be lost."
        tone="danger"
        confirmLabel="Reload"
        onConfirm={() => window.location.reload()}
        onCancel={() => setConfirmReloadForAi(false)}
      />
    </div>
  );
}
