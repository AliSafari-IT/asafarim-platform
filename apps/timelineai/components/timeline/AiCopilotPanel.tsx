"use client";

import { useEffect, useState } from "react";
import { apiFetch, ApiError } from "@/lib/client/api";
import { AI_PROPOSAL_KINDS, type AiProposalKind, type AiProposalPayload } from "@/lib/ai/schemas";
import { NARRATIVE_AUDIENCE_PRESETS, type NarrativeAudiencePreset } from "@/lib/ai/narrative";
import type { TemporalConflict, TemporalPrecision, TemporalValue } from "@/lib/ai/temporal";

/** Minimal shape the panel needs from a saved event — not the full editor row. */
export interface AiCopilotTargetEvent {
  id: string;
  title: string;
}

export interface AiProposalRow {
  id: string;
  kind: AiProposalKind;
  status: "pending" | "accepted" | "rejected" | "undone";
  payload: AiProposalPayload;
  createdAt: string;
  /** events_extraction only — chunk ids that already produced an accepted event on a prior import of the same document. */
  alreadyImportedChunkIds?: string[];
}

export interface AiCopilotPanelProps {
  timelineId: string;
  events: AiCopilotTargetEvent[];
  /** Called after Accept/Undo successfully changes the saved timeline, so the caller can offer to reload. */
  onApplied?: () => void;
}

export interface ConflictingEventRow {
  id: string;
  title: string;
  displayDate: string | null;
  value: TemporalValue;
}

const CONFLICT_CODE_LABELS: Record<TemporalConflict["code"], string> = {
  impossible_range: "Impossible range",
  ordering_cycle: "Contradictory ordering",
  ordering_violation: "Ordering conflict",
};

const PRECISION_LABELS: Record<TemporalPrecision, string> = {
  day: "Exact date",
  month: "Month",
  year: "Year",
  quarter: "Quarter",
  season: "Season",
  decade: "Decade",
  century: "Century",
  range: "Range",
  unknown: "Unknown",
};

const EXACT_PRECISIONS: TemporalPrecision[] = ["day", "month", "year"];

/** A stable key for a conflict so a dismissal survives a reload as long as the same events are still in conflict for the same reason. */
export function conflictSignature(conflict: Pick<TemporalConflict, "code" | "eventIds">): string {
  return `${conflict.code}:${[...conflict.eventIds].sort().join(",")}`;
}

function dismissedConflictsStorageKey(timelineId: string): string {
  return `timelineai:dismissed-conflicts:${timelineId}`;
}

function loadDismissedConflicts(timelineId: string): Set<string> {
  try {
    const raw = window.localStorage.getItem(dismissedConflictsStorageKey(timelineId));
    const parsed: unknown = raw ? JSON.parse(raw) : [];
    return new Set(Array.isArray(parsed) ? parsed.filter((v): v is string => typeof v === "string") : []);
  } catch {
    return new Set();
  }
}

function saveDismissedConflicts(timelineId: string, signatures: Set<string>): void {
  try {
    window.localStorage.setItem(dismissedConflictsStorageKey(timelineId), JSON.stringify([...signatures]));
  } catch {
    // Best-effort only — a private window or full storage just means dismissals don't persist this session.
  }
}

const KIND_LABELS: Record<AiProposalKind, string> = {
  events_extraction: "Extract events from text",
  narrative_suggestion: "Rewrite a field",
  visual_recommendation: "Suggest a visual direction",
  temporal_correction: "Interpret a date",
};

const KIND_HELP: Record<AiProposalKind, string> = {
  events_extraction: "Paste notes, an article, or a list of dates — the copilot proposes events to add.",
  narrative_suggestion: "Paste or describe what you want said — the copilot proposes a rewrite of one field.",
  visual_recommendation: "Optional context about the story's tone — the copilot recommends a layout and theme.",
  temporal_correction: "Describe the date in your own words (e.g. \"early spring, 1990\").",
};

const AUDIENCE_LABELS: Record<NarrativeAudiencePreset, string> = {
  executive_update: "Executive update",
  product_history: "Product history",
  lesson: "Lesson / retrospective",
  portfolio_story: "Portfolio story",
  memorial: "Memorial",
  launch_narrative: "Launch narrative",
};

// Mirrors lib/ai/source-import.ts#SOURCE_IMPORT_KINDS — not imported directly
// since that module pulls in node:crypto, which a client bundle can't ship.
const SOURCE_IMPORT_KINDS = ["paste", "markdown", "csv", "json", "url"] as const;
type SourceImportKind = (typeof SOURCE_IMPORT_KINDS)[number];

const IMPORT_KIND_LABELS: Record<SourceImportKind, string> = {
  paste: "Pasted text",
  markdown: "Markdown",
  csv: "CSV",
  json: "JSON",
  url: "Web page",
};

const MAX_IMPORT_CHARS = 20_000;

function extensionToImportKind(filename: string): Exclude<SourceImportKind, "url"> {
  const ext = filename.split(".").pop()?.toLowerCase();
  if (ext === "md" || ext === "markdown") return "markdown";
  if (ext === "csv") return "csv";
  if (ext === "json") return "json";
  return "paste";
}

export function summarizePayload(payload: AiProposalPayload): string {
  switch (payload.kind) {
    case "events_extraction": {
      const titles = payload.events.slice(0, 3).map((e) => e.title);
      const more = payload.events.length > 3 ? ` (+${payload.events.length - 3} more)` : "";
      return `${payload.events.length} event${payload.events.length === 1 ? "" : "s"}: ${titles.join(", ")}${more}`;
    }
    case "narrative_suggestion": {
      const target = payload.eventId ? "an event's" : "the timeline's";
      return `Rewrite ${target} ${payload.field}: "${payload.suggestedText.slice(0, 140)}${payload.suggestedText.length > 140 ? "…" : ""}"`;
    }
    case "visual_recommendation": {
      const best = payload.candidates[payload.recommendedIndex];
      return best
        ? `Recommended: ${best.layout} layout, ${best.density} density, ${best.cardStyle} cards — ${best.rationale}`
        : "No candidate available.";
    }
    case "temporal_correction":
      return `Interpreted as: ${payload.temporalValue.displayText}`;
  }
}

/** True when this extracted event's source chunk already produced an accepted event on a prior import. */
export function isEventAlreadyImported(
  event: { sourceChunkId?: string },
  alreadyImportedChunkIds: string[] | undefined
): boolean {
  return !!(event.sourceChunkId && alreadyImportedChunkIds?.includes(event.sourceChunkId));
}

/**
 * Which event indexes an "Accept selected" click should send: every index
 * the user explicitly toggled, defaulting the rest to "selected" unless
 * already imported (those default off, since accepting them would be a
 * silent no-op — the dedupe check would just skip them again).
 */
export function computeDefaultSelectedIndexes(
  events: { sourceChunkId?: string }[],
  alreadyImportedChunkIds: string[] | undefined,
  overrides: Record<number, boolean> | undefined
): number[] {
  return events
    .map((_, i) => i)
    .filter((i) => overrides?.[i] ?? !isEventAlreadyImported(events[i]!, alreadyImportedChunkIds));
}

export function hasUncitedContent(payload: AiProposalPayload): boolean {
  if (payload.kind === "events_extraction") return payload.events.some((e) => e.uncitedInference);
  if (payload.kind === "temporal_correction") return payload.uncitedInference;
  if (payload.kind === "narrative_suggestion") return payload.unsupportedClaim;
  return false;
}

const STATUS_LABELS: Record<AiProposalRow["status"], string> = {
  pending: "Pending review",
  accepted: "Applied",
  rejected: "Rejected",
  undone: "Undone",
};

/**
 * The generic AI copilot surface for the timeline editor (TLAI-002-UI),
 * plus the cited-import entry point (TLAI-003-UI): generate a proposal
 * from free text or an imported source, review it inline — including
 * per-event citations for events_extraction — and accept/reject/undo.
 * Per-kind review surfaces beyond events_extraction (conflict panel,
 * variant compare, visual preview) are separate, more specialized panels
 * layered on top of this later.
 */
export function AiCopilotPanel({ timelineId, events, onApplied }: AiCopilotPanelProps) {
  const [enabled, setEnabled] = useState<boolean | null>(null);
  const [proposals, setProposals] = useState<AiProposalRow[] | null>(null);
  const [listError, setListError] = useState<string | null>(null);

  const [mode, setMode] = useState<"generate" | "import">("generate");

  const [kind, setKind] = useState<AiProposalKind>("events_extraction");
  const [sourceContent, setSourceContent] = useState("");
  const [narrativeField, setNarrativeField] = useState<"title" | "subtitle" | "description">("description");
  const [narrativeEventId, setNarrativeEventId] = useState<string>("");
  const [narrativeAudiencePreset, setNarrativeAudiencePreset] = useState<NarrativeAudiencePreset | "">("");
  const [targetEventId, setTargetEventId] = useState<string>(events[0]?.id ?? "");

  const [generating, setGenerating] = useState(false);
  const [generateError, setGenerateError] = useState<string | null>(null);

  const [importSourceKind, setImportSourceKind] = useState<SourceImportKind>("paste");
  const [importContent, setImportContent] = useState("");
  const [importUrl, setImportUrl] = useState("");
  const [importLabel, setImportLabel] = useState("");
  const [importing, setImporting] = useState(false);
  const [importError, setImportError] = useState<string | null>(null);
  const [importNotice, setImportNotice] = useState<string | null>(null);

  const [busyProposalId, setBusyProposalId] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [selection, setSelection] = useState<Record<string, Record<number, boolean>>>({});

  const [conflicts, setConflicts] = useState<TemporalConflict[] | null>(null);
  const [conflictEvents, setConflictEvents] = useState<ConflictingEventRow[]>([]);
  const [conflictsError, setConflictsError] = useState<string | null>(null);
  const [dismissedConflicts, setDismissedConflicts] = useState<Set<string>>(() => new Set());

  useEffect(() => {
    let cancelled = false;
    apiFetch<{ enabled: boolean }>("/api/ai/status")
      .then((res) => {
        if (!cancelled) setEnabled(res.enabled);
      })
      .catch(() => {
        if (!cancelled) setEnabled(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  async function loadProposals() {
    setListError(null);
    try {
      const res = await apiFetch<{ proposals: AiProposalRow[] }>(`/api/timelines/${timelineId}/ai/proposals`);
      setProposals(res.proposals);
    } catch (error) {
      setListError(error instanceof ApiError ? error.message : "Couldn't load AI proposals.");
    }
  }

  async function loadConflicts() {
    setConflictsError(null);
    try {
      const res = await apiFetch<{ conflicts: TemporalConflict[]; events: ConflictingEventRow[] }>(
        `/api/timelines/${timelineId}/ai/temporal-conflicts`
      );
      setConflicts(res.conflicts);
      setConflictEvents(res.events);
    } catch (error) {
      setConflictsError(error instanceof ApiError ? error.message : "Couldn't check for date conflicts.");
    }
  }

  useEffect(() => {
    if (enabled) {
      loadProposals();
      loadConflicts();
      setDismissedConflicts(loadDismissedConflicts(timelineId));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- only re-run when AI becomes enabled, not on every loadProposals/loadConflicts identity change
  }, [enabled, timelineId]);

  function dismissConflict(conflict: TemporalConflict) {
    setDismissedConflicts((prev) => {
      const next = new Set(prev).add(conflictSignature(conflict));
      saveDismissedConflicts(timelineId, next);
      return next;
    });
  }

  /** Jumps to the Generate tab, pre-filled to reinterpret this event's date. */
  function startReinterpret(eventId: string) {
    setMode("generate");
    setKind("temporal_correction");
    setTargetEventId(eventId);
    setGenerateError(null);
  }

  async function handleGenerate() {
    setGenerateError(null);
    if (!sourceContent.trim()) {
      setGenerateError("Enter some text first.");
      return;
    }
    if (kind === "temporal_correction" && !targetEventId) {
      setGenerateError("Choose which event this date belongs to.");
      return;
    }

    setGenerating(true);
    try {
      await apiFetch(`/api/timelines/${timelineId}/ai/proposals`, {
        method: "POST",
        body: {
          kind,
          sourceContent,
          ...(kind === "temporal_correction" ? { targetEventId } : {}),
          ...(kind === "narrative_suggestion"
            ? {
                narrativeField,
                narrativeEventId: narrativeEventId || undefined,
                narrativeAudiencePreset: narrativeAudiencePreset || undefined,
              }
            : {}),
        },
      });
      setSourceContent("");
      await loadProposals();
    } catch (error) {
      setGenerateError(error instanceof ApiError ? error.message : "Couldn't generate a proposal. Please try again.");
    } finally {
      setGenerating(false);
    }
  }

  async function handleFileChosen(file: File) {
    setImportError(null);
    if (file.size > MAX_IMPORT_CHARS * 4) {
      // Rough pre-check by bytes before we even read it — the real,
      // authoritative check is the character count below (and, again,
      // server-side).
      setImportError(`That file is too large (max ${MAX_IMPORT_CHARS.toLocaleString()} characters).`);
      return;
    }
    const text = await file.text();
    if (text.length > MAX_IMPORT_CHARS) {
      setImportError(
        `That file is too long (${text.length.toLocaleString()} characters, max ${MAX_IMPORT_CHARS.toLocaleString()}). Try a smaller excerpt.`
      );
      return;
    }
    setImportSourceKind(extensionToImportKind(file.name));
    setImportContent(text);
    setImportLabel(file.name);
  }

  async function handleImport() {
    setImportError(null);
    setImportNotice(null);

    if (importSourceKind === "url") {
      let parsed: URL;
      try {
        parsed = new URL(importUrl);
      } catch {
        setImportError("Enter a valid URL, including https://.");
        return;
      }
      if (parsed.protocol !== "https:") {
        setImportError("Only https:// links can be imported.");
        return;
      }
    } else if (!importContent.trim()) {
      setImportError("Paste some text or choose a file first.");
      return;
    } else if (importContent.length > MAX_IMPORT_CHARS) {
      setImportError(
        `That's too long (${importContent.length.toLocaleString()} characters, max ${MAX_IMPORT_CHARS.toLocaleString()}). Try a smaller excerpt.`
      );
      return;
    }

    setImporting(true);
    try {
      const res = await apiFetch<{ wasReimport: boolean }>(`/api/timelines/${timelineId}/ai/import`, {
        method: "POST",
        body: {
          kind: importSourceKind,
          ...(importSourceKind === "url" ? { url: importUrl } : { content: importContent }),
          label: importLabel || undefined,
        },
      });
      setImportNotice(
        res.wasReimport
          ? "You've imported this exact content before — showing fresh suggestions from it. Events already added from it won't be duplicated."
          : "Imported. Review the proposed events below before accepting."
      );
      setImportContent("");
      setImportUrl("");
      setImportLabel("");
      await loadProposals();
    } catch (error) {
      setImportError(error instanceof ApiError ? error.message : "Couldn't import that source. Please try again.");
    } finally {
      setImporting(false);
    }
  }

  function toggleSelected(proposalId: string, index: number, fallback: boolean) {
    setSelection((prev) => {
      const current = prev[proposalId] ?? {};
      const currentlySelected = index in current ? current[index] : fallback;
      return { ...prev, [proposalId]: { ...current, [index]: !currentlySelected } };
    });
  }

  async function handleAction(
    proposalId: string,
    action: "accept" | "reject" | "undo",
    body?: { eventIndexes?: number[] }
  ) {
    setActionError(null);
    setBusyProposalId(proposalId);
    try {
      await apiFetch(`/api/timelines/${timelineId}/ai/proposals/${proposalId}/${action}`, {
        method: "POST",
        body,
      });
      await loadProposals();
      if (action === "accept" || action === "undo") onApplied?.();
    } catch (error) {
      setActionError(error instanceof ApiError ? error.message : "That action didn't go through. Please try again.");
    } finally {
      setBusyProposalId(null);
    }
  }

  if (enabled === null) {
    return (
      <section className="rounded-xl border border-[var(--color-border,rgba(0,0,0,0.15))] p-4 text-sm text-[var(--color-text-muted,inherit)]">
        Checking AI availability…
      </section>
    );
  }

  if (!enabled) {
    return (
      <section className="rounded-xl border border-[var(--color-border,rgba(0,0,0,0.15))] p-4">
        <h2 className="font-medium">AI copilot</h2>
        <p className="mt-1 text-sm text-[var(--color-text-muted,inherit)]">
          AI features are optional and turned off for this deployment right now. Everything above — creating,
          editing, and publishing — works exactly the same without it.
        </p>
      </section>
    );
  }

  const pending = proposals?.filter((p) => p.status === "pending") ?? [];
  const resolved = proposals?.filter((p) => p.status !== "pending") ?? [];
  const visibleConflicts = (conflicts ?? []).filter((c) => !dismissedConflicts.has(conflictSignature(c)));

  return (
    <section className="flex flex-col gap-4 rounded-xl border border-[var(--color-border,rgba(0,0,0,0.15))] p-4">
      <div>
        <h2 className="font-medium">AI copilot</h2>
        <p className="mt-0.5 text-xs text-[var(--color-text-muted,inherit)]">
          Every suggestion is a proposal you review — nothing is written to your timeline until you accept it.
        </p>
      </div>

      {conflictsError ? (
        <div role="alert" className="rounded-lg border border-red-500/40 bg-red-500/10 p-3 text-sm">
          {conflictsError}
        </div>
      ) : null}

      {visibleConflicts.length > 0 ? (
        <section className="flex flex-col gap-2 rounded-lg border border-amber-500/40 bg-amber-500/5 p-3">
          <h3 className="text-sm font-medium">
            Date conflicts ({visibleConflicts.length})
          </h3>
          <ul className="flex flex-col gap-2">
            {visibleConflicts.map((conflict) => {
              const signature = conflictSignature(conflict);
              const affected = conflict.eventIds
                .map((id) => conflictEvents.find((e) => e.id === id))
                .filter((e): e is ConflictingEventRow => !!e);
              return (
                <li key={signature} className="rounded-md border border-amber-500/30 bg-[var(--color-surface)] p-2 text-sm">
                  <div className="flex items-center justify-between gap-2">
                    <span className="font-medium">{CONFLICT_CODE_LABELS[conflict.code]}</span>
                    <button
                      type="button"
                      className="text-xs text-[var(--color-text-muted,inherit)] underline"
                      onClick={() => dismissConflict(conflict)}
                    >
                      Leave unresolved
                    </button>
                  </div>
                  <p className="mt-0.5 text-[var(--color-text-muted,inherit)]">{conflict.message}</p>
                  {affected.length > 0 ? (
                    <ul className="mt-2 flex flex-col gap-1.5">
                      {affected.map((event) => (
                        <li
                          key={event.id}
                          className="flex flex-wrap items-center justify-between gap-2 rounded border border-[var(--color-border,rgba(0,0,0,0.1))] px-2 py-1"
                        >
                          <span>
                            <span className="font-medium">{event.title}</span>
                            {event.displayDate ? (
                              <span className="text-[var(--color-text-muted,inherit)]"> — {event.displayDate}</span>
                            ) : null}
                            <span
                              className={`ml-2 rounded-full px-2 py-0.5 text-xs ${
                                EXACT_PRECISIONS.includes(event.value.precision)
                                  ? "bg-emerald-500/15 text-emerald-700 dark:text-emerald-400"
                                  : event.value.precision === "unknown"
                                    ? "bg-black/10 dark:bg-white/10"
                                    : "bg-sky-500/15 text-sky-700 dark:text-sky-400"
                              }`}
                            >
                              {PRECISION_LABELS[event.value.precision]}
                            </span>
                          </span>
                          <button
                            type="button"
                            className="rounded-lg border border-[var(--color-border,currentColor)] px-2 py-1 text-xs font-medium"
                            onClick={() => startReinterpret(event.id)}
                          >
                            Reinterpret this date
                          </button>
                        </li>
                      ))}
                    </ul>
                  ) : null}
                </li>
              );
            })}
          </ul>
        </section>
      ) : null}

      <div className="flex gap-1 rounded-lg border border-[var(--color-border,rgba(0,0,0,0.15))] p-1 text-sm">
        <button
          type="button"
          className={`flex-1 rounded-md px-3 py-1.5 font-medium ${mode === "generate" ? "bg-[var(--color-primary)] text-white" : ""}`}
          onClick={() => setMode("generate")}
          aria-pressed={mode === "generate"}
        >
          Generate
        </button>
        <button
          type="button"
          className={`flex-1 rounded-md px-3 py-1.5 font-medium ${mode === "import" ? "bg-[var(--color-primary)] text-white" : ""}`}
          onClick={() => setMode("import")}
          aria-pressed={mode === "import"}
        >
          Import a source
        </button>
      </div>

      {mode === "generate" ? (
        <div className="flex flex-col gap-3">
          <label className="flex flex-col gap-1 text-sm">
            <span className="font-medium">What should it do?</span>
            <select
              className="rounded border border-[var(--color-border,rgba(0,0,0,0.2))] bg-transparent px-3 py-2"
              value={kind}
              onChange={(e) => setKind(e.target.value as AiProposalKind)}
            >
              {AI_PROPOSAL_KINDS.map((k) => (
                <option key={k} value={k}>
                  {KIND_LABELS[k]}
                </option>
              ))}
            </select>
            <span className="text-xs text-[var(--color-text-muted,inherit)]">{KIND_HELP[kind]}</span>
          </label>

          {kind === "narrative_suggestion" ? (
            <div className="grid gap-3 sm:grid-cols-2">
              <label className="flex flex-col gap-1 text-sm">
                <span className="font-medium">Target</span>
                <select
                  className="rounded border border-[var(--color-border,rgba(0,0,0,0.2))] bg-transparent px-3 py-2"
                  value={narrativeEventId}
                  onChange={(e) => {
                    const value = e.target.value;
                    setNarrativeEventId(value);
                    if (value && narrativeField === "subtitle") setNarrativeField("description");
                  }}
                >
                  <option value="">Whole timeline</option>
                  {events.map((ev) => (
                    <option key={ev.id} value={ev.id}>
                      {ev.title || "Untitled event"}
                    </option>
                  ))}
                </select>
              </label>
              <label className="flex flex-col gap-1 text-sm">
                <span className="font-medium">Field</span>
                <select
                  className="rounded border border-[var(--color-border,rgba(0,0,0,0.2))] bg-transparent px-3 py-2"
                  value={narrativeField}
                  onChange={(e) => setNarrativeField(e.target.value as typeof narrativeField)}
                >
                  <option value="title">Title</option>
                  <option value="description">Description</option>
                  {!narrativeEventId ? <option value="subtitle">Subtitle</option> : null}
                </select>
              </label>
              <label className="flex flex-col gap-1 text-sm sm:col-span-2">
                <span className="font-medium">Audience (optional)</span>
                <select
                  className="rounded border border-[var(--color-border,rgba(0,0,0,0.2))] bg-transparent px-3 py-2"
                  value={narrativeAudiencePreset}
                  onChange={(e) => setNarrativeAudiencePreset(e.target.value as NarrativeAudiencePreset | "")}
                >
                  <option value="">No specific audience</option>
                  {NARRATIVE_AUDIENCE_PRESETS.map((preset) => (
                    <option key={preset} value={preset}>
                      {AUDIENCE_LABELS[preset]}
                    </option>
                  ))}
                </select>
              </label>
            </div>
          ) : null}

          {kind === "temporal_correction" ? (
            <label className="flex flex-col gap-1 text-sm">
              <span className="font-medium">Which event?</span>
              <select
                className="rounded border border-[var(--color-border,rgba(0,0,0,0.2))] bg-transparent px-3 py-2"
                value={targetEventId}
                onChange={(e) => setTargetEventId(e.target.value)}
              >
                {events.length === 0 ? <option value="">Save an event first</option> : null}
                {events.map((ev) => (
                  <option key={ev.id} value={ev.id}>
                    {ev.title || "Untitled event"}
                  </option>
                ))}
              </select>
            </label>
          ) : null}

          <label className="flex flex-col gap-1 text-sm">
            <span className="font-medium">{kind === "temporal_correction" ? "Date phrase" : "Text"}</span>
            <textarea
              className="min-h-24 rounded border border-[var(--color-border,rgba(0,0,0,0.2))] bg-transparent px-3 py-2"
              value={sourceContent}
              onChange={(e) => setSourceContent(e.target.value)}
              maxLength={20_000}
            />
          </label>

          {generateError ? (
            <div role="alert" className="rounded-lg border border-red-500/40 bg-red-500/10 p-3 text-sm">
              {generateError}
            </div>
          ) : null}

          <div>
            <button
              type="button"
              className="rounded-lg bg-[var(--color-primary)] px-4 py-2 text-sm font-medium text-white disabled:opacity-50"
              onClick={handleGenerate}
              disabled={generating}
              aria-busy={generating || undefined}
            >
              {generating ? "Generating…" : "Generate"}
            </button>
          </div>
        </div>
      ) : (
        <div className="flex flex-col gap-3">
          <label className="flex flex-col gap-1 text-sm">
            <span className="font-medium">Source type</span>
            <select
              className="rounded border border-[var(--color-border,rgba(0,0,0,0.2))] bg-transparent px-3 py-2"
              value={importSourceKind}
              onChange={(e) => setImportSourceKind(e.target.value as SourceImportKind)}
            >
              {SOURCE_IMPORT_KINDS.map((k) => (
                <option key={k} value={k}>
                  {IMPORT_KIND_LABELS[k]}
                </option>
              ))}
            </select>
          </label>

          {importSourceKind === "url" ? (
            <label className="flex flex-col gap-1 text-sm">
              <span className="font-medium">Web page URL</span>
              <input
                type="url"
                className="rounded border border-[var(--color-border,rgba(0,0,0,0.2))] bg-transparent px-3 py-2"
                value={importUrl}
                onChange={(e) => setImportUrl(e.target.value)}
                placeholder="https://…"
              />
            </label>
          ) : (
            <>
              <label className="flex flex-col gap-1 text-sm">
                <span className="font-medium">Upload a file (.txt, .md, .csv, .json)</span>
                <input
                  type="file"
                  accept=".txt,.md,.markdown,.csv,.json,text/plain,text/markdown,text/csv,application/json"
                  className="text-sm"
                  onChange={(e) => {
                    const file = e.target.files?.[0];
                    if (file) void handleFileChosen(file);
                  }}
                />
              </label>
              <label className="flex flex-col gap-1 text-sm">
                <span className="font-medium">Or paste text</span>
                <textarea
                  className="min-h-24 rounded border border-[var(--color-border,rgba(0,0,0,0.2))] bg-transparent px-3 py-2"
                  value={importContent}
                  onChange={(e) => setImportContent(e.target.value)}
                  maxLength={MAX_IMPORT_CHARS}
                />
                <span className="text-xs text-[var(--color-text-muted,inherit)]">
                  {importContent.length.toLocaleString()} / {MAX_IMPORT_CHARS.toLocaleString()} characters
                </span>
              </label>
            </>
          )}

          {importError ? (
            <div role="alert" className="rounded-lg border border-red-500/40 bg-red-500/10 p-3 text-sm">
              {importError}
            </div>
          ) : null}
          {importNotice ? (
            <div className="rounded-lg border border-[var(--color-border,rgba(0,0,0,0.15))] bg-black/5 p-3 text-sm dark:bg-white/5">
              {importNotice}
            </div>
          ) : null}

          <div>
            <button
              type="button"
              className="rounded-lg bg-[var(--color-primary)] px-4 py-2 text-sm font-medium text-white disabled:opacity-50"
              onClick={handleImport}
              disabled={importing}
              aria-busy={importing || undefined}
            >
              {importing ? "Importing…" : "Import and extract events"}
            </button>
          </div>
        </div>
      )}

      {actionError ? (
        <div role="alert" className="rounded-lg border border-red-500/40 bg-red-500/10 p-3 text-sm">
          {actionError}
        </div>
      ) : null}
      {listError ? (
        <div role="alert" className="rounded-lg border border-red-500/40 bg-red-500/10 p-3 text-sm">
          {listError}
        </div>
      ) : null}

      <div className="flex flex-col gap-3">
        <h3 className="text-sm font-medium">Pending review {pending.length > 0 ? `(${pending.length})` : ""}</h3>
        {proposals === null ? (
          <p className="text-sm text-[var(--color-text-muted,inherit)]">Loading…</p>
        ) : pending.length === 0 ? (
          <p className="text-sm text-[var(--color-text-muted,inherit)]">
            No pending proposals. Generate or import one above to see it here.
          </p>
        ) : (
          <ul className="flex flex-col gap-2">
            {pending.map((proposal) => {
              if (proposal.kind !== "events_extraction" || proposal.payload.kind !== "events_extraction") {
                return (
                  <li
                    key={proposal.id}
                    className="rounded-lg border border-[var(--color-border,rgba(0,0,0,0.15))] p-3 text-sm"
                  >
                    <div className="flex items-center justify-between gap-2">
                      <span className="font-medium">{KIND_LABELS[proposal.kind]}</span>
                      {hasUncitedContent(proposal.payload) ? (
                        <span className="rounded-full bg-amber-500/15 px-2 py-0.5 text-xs text-amber-600 dark:text-amber-400">
                          Uncited
                        </span>
                      ) : null}
                    </div>
                    <p className="mt-1 text-[var(--color-text-muted,inherit)]">{summarizePayload(proposal.payload)}</p>
                    <div className="mt-2 flex gap-2">
                      <button
                        type="button"
                        className="rounded-lg bg-[var(--color-primary)] px-3 py-1.5 text-xs font-medium text-white disabled:opacity-50"
                        onClick={() => handleAction(proposal.id, "accept")}
                        disabled={busyProposalId === proposal.id}
                      >
                        Accept
                      </button>
                      <button
                        type="button"
                        className="rounded-lg border border-[var(--color-border,currentColor)] px-3 py-1.5 text-xs font-medium disabled:opacity-50"
                        onClick={() => handleAction(proposal.id, "reject")}
                        disabled={busyProposalId === proposal.id}
                      >
                        Reject
                      </button>
                    </div>
                  </li>
                );
              }

              const payload = proposal.payload;
              const eventIndexes = computeDefaultSelectedIndexes(
                payload.events,
                proposal.alreadyImportedChunkIds,
                selection[proposal.id]
              );

              return (
                <li
                  key={proposal.id}
                  className="rounded-lg border border-[var(--color-border,rgba(0,0,0,0.15))] p-3 text-sm"
                >
                  <div className="font-medium">{KIND_LABELS[proposal.kind]}</div>
                  <ul className="mt-2 flex flex-col gap-2">
                    {payload.events.map((event, index) => {
                      const alreadyImported = isEventAlreadyImported(event, proposal.alreadyImportedChunkIds);
                      const selected = selection[proposal.id]?.[index] ?? !alreadyImported;
                      return (
                        <li
                          key={index}
                          className="rounded-md border border-[var(--color-border,rgba(0,0,0,0.1))] p-2"
                        >
                          <label className="flex items-start gap-2">
                            <input
                              type="checkbox"
                              className="mt-1"
                              checked={selected}
                              onChange={() => toggleSelected(proposal.id, index, !alreadyImported)}
                              disabled={alreadyImported}
                            />
                            <span className="flex-1">
                              <span className="font-medium">{event.title}</span>
                              {event.description ? (
                                <p className="mt-0.5 text-xs text-[var(--color-text-muted,inherit)]">
                                  {event.description}
                                </p>
                              ) : null}
                              <span className="mt-1 flex flex-wrap gap-1">
                                {alreadyImported ? (
                                  <span className="rounded-full bg-black/10 px-2 py-0.5 text-xs dark:bg-white/10">
                                    Already imported
                                  </span>
                                ) : event.citations.length > 0 ? (
                                  event.citations.map((c, ci) => (
                                    <span
                                      key={ci}
                                      className="rounded-full bg-emerald-500/15 px-2 py-0.5 text-xs text-emerald-700 dark:text-emerald-400"
                                      title={c.excerpt}
                                    >
                                      {c.label}
                                    </span>
                                  ))
                                ) : event.uncitedInference ? (
                                  <span className="rounded-full bg-amber-500/15 px-2 py-0.5 text-xs text-amber-600 dark:text-amber-400">
                                    Uncited inference
                                  </span>
                                ) : null}
                              </span>
                            </span>
                          </label>
                        </li>
                      );
                    })}
                  </ul>
                  <div className="mt-3 flex items-center gap-2">
                    <button
                      type="button"
                      className="rounded-lg bg-[var(--color-primary)] px-3 py-1.5 text-xs font-medium text-white disabled:opacity-50"
                      onClick={() => handleAction(proposal.id, "accept", { eventIndexes })}
                      disabled={busyProposalId === proposal.id || eventIndexes.length === 0}
                    >
                      Accept selected ({eventIndexes.length})
                    </button>
                    <button
                      type="button"
                      className="rounded-lg border border-[var(--color-border,currentColor)] px-3 py-1.5 text-xs font-medium disabled:opacity-50"
                      onClick={() => handleAction(proposal.id, "reject")}
                      disabled={busyProposalId === proposal.id}
                    >
                      Reject all
                    </button>
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </div>

      {resolved.length > 0 ? (
        <details className="text-sm">
          <summary className="cursor-pointer font-medium">History ({resolved.length})</summary>
          <ul className="mt-2 flex flex-col gap-2">
            {resolved.map((proposal) => (
              <li
                key={proposal.id}
                className="rounded-lg border border-[var(--color-border,rgba(0,0,0,0.1))] p-3 text-xs"
              >
                <div className="flex items-center justify-between gap-2">
                  <span className="font-medium">{KIND_LABELS[proposal.kind]}</span>
                  <span className="text-[var(--color-text-muted,inherit)]">{STATUS_LABELS[proposal.status]}</span>
                </div>
                <p className="mt-1 text-[var(--color-text-muted,inherit)]">{summarizePayload(proposal.payload)}</p>
                {proposal.status === "accepted" ? (
                  <button
                    type="button"
                    className="mt-2 rounded-lg border border-[var(--color-border,currentColor)] px-3 py-1.5 text-xs font-medium disabled:opacity-50"
                    onClick={() => handleAction(proposal.id, "undo")}
                    disabled={busyProposalId === proposal.id}
                  >
                    Undo
                  </button>
                ) : null}
              </li>
            ))}
          </ul>
        </details>
      ) : null}
    </section>
  );
}
