"use client";

import { useEffect, useState } from "react";
import { apiFetch, ApiError } from "@/lib/client/api";
import { AI_PROPOSAL_KINDS, type AiProposalKind, type AiProposalPayload } from "@/lib/ai/schemas";
import { NARRATIVE_AUDIENCE_PRESETS, type NarrativeAudiencePreset } from "@/lib/ai/narrative";

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
}

export interface AiCopilotPanelProps {
  timelineId: string;
  events: AiCopilotTargetEvent[];
  /** Called after Accept/Undo successfully changes the saved timeline, so the caller can offer to reload. */
  onApplied?: () => void;
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
 * The generic AI copilot surface for the timeline editor (TLAI-002-UI):
 * generate a proposal from any of the four backend kinds, review it inline,
 * and accept/reject/undo. Per-kind review surfaces (cited-import, conflict
 * panel, variant compare, visual preview) are separate, more specialized
 * panels layered on top of this later — this one only guarantees every
 * proposal is reachable, reviewable, and reversible.
 */
export function AiCopilotPanel({ timelineId, events, onApplied }: AiCopilotPanelProps) {
  const [enabled, setEnabled] = useState<boolean | null>(null);
  const [proposals, setProposals] = useState<AiProposalRow[] | null>(null);
  const [listError, setListError] = useState<string | null>(null);

  const [kind, setKind] = useState<AiProposalKind>("events_extraction");
  const [sourceContent, setSourceContent] = useState("");
  const [narrativeField, setNarrativeField] = useState<"title" | "subtitle" | "description">("description");
  const [narrativeEventId, setNarrativeEventId] = useState<string>("");
  const [narrativeAudiencePreset, setNarrativeAudiencePreset] = useState<NarrativeAudiencePreset | "">("");
  const [targetEventId, setTargetEventId] = useState<string>(events[0]?.id ?? "");

  const [generating, setGenerating] = useState(false);
  const [generateError, setGenerateError] = useState<string | null>(null);
  const [busyProposalId, setBusyProposalId] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);

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

  useEffect(() => {
    if (enabled) loadProposals();
    // eslint-disable-next-line react-hooks/exhaustive-deps -- only re-run when AI becomes enabled, not on every loadProposals identity change
  }, [enabled, timelineId]);

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

  async function handleAction(proposalId: string, action: "accept" | "reject" | "undo") {
    setActionError(null);
    setBusyProposalId(proposalId);
    try {
      await apiFetch(`/api/timelines/${timelineId}/ai/proposals/${proposalId}/${action}`, { method: "POST" });
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

  return (
    <section className="flex flex-col gap-4 rounded-xl border border-[var(--color-border,rgba(0,0,0,0.15))] p-4">
      <div>
        <h2 className="font-medium">AI copilot</h2>
        <p className="mt-0.5 text-xs text-[var(--color-text-muted,inherit)]">
          Every suggestion is a proposal you review — nothing is written to your timeline until you accept it.
        </p>
      </div>

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
          <span className="font-medium">
            {kind === "temporal_correction" ? "Date phrase" : "Text"}
          </span>
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
            No pending proposals. Generate one above to see it here.
          </p>
        ) : (
          <ul className="flex flex-col gap-2">
            {pending.map((proposal) => (
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
            ))}
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
