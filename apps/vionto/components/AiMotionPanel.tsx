"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Sparkles, Trash2, Loader2, Play, X } from "lucide-react";

/**
 * AI motion panel — generate short Kling image-to-video clips for selected
 * hero images in the current album. Completed, accepted clips replace the
 * static pan-and-zoom segment for their image in the final render; every
 * other image keeps the existing cinematic motion.
 */

type AiClip = {
  id: string;
  assetId: string;
  albumItemId: string | null;
  versionId: string | null;
  status: "pending" | "submitted" | "processing" | "succeeded" | "failed";
  prompt: string;
  model: string;
  mode: string;
  durationSeconds: number;
  errorMessage: string | null;
  accepted: boolean;
  previewUrl: string | null;
  createdAt: string;
};

type PanelItem = {
  albumItemId: string;
  assetId: string;
  thumbnailUrl: string | null;
};

type Props = {
  projectId: string;
  versionId: string | null;
  albumId: string;
  items: PanelItem[];
};

const MAX_SELECTION = 3;

type ProviderId = "fal" | "kling";

type ModelOption = {
  id: string;
  label: string;
  /** Rough USD per 5s clip, for the cost hint. */
  costPer5s: number;
  /** Whether the std/pro quality toggle applies to this model. */
  usesMode: boolean;
};

/** Client-side mirror of the server registry's generative-video models. */
const MODELS: Record<ProviderId, ModelOption[]> = {
  fal: [
    { id: "fal-ai/ltx-video/image-to-video", label: "LTX — fast & cheap", costPer5s: 0.02, usesMode: true },
    { id: "fal-ai/wan-i2v", label: "WAN 2.x — balanced", costPer5s: 0.35, usesMode: true },
    { id: "fal-ai/kling-video/v1.6/standard/image-to-video", label: "Kling via fal — premium", costPer5s: 0.42, usesMode: true },
  ],
  kling: [{ id: "kling-v1-6", label: "Kling v1.6 (direct)", costPer5s: 0.28, usesMode: true }],
};

const PROVIDER_LABELS: Record<ProviderId, string> = { fal: "fal.ai", kling: "Kling (direct)" };

const DEFAULT_PROMPT =
  "Preserve every person's identity, facial features, and fine details exactly as " +
  "in the source image. Add smooth, subtle, natural motion — a slow cinematic " +
  "camera push-in or gentle parallax. Keep the original composition, colors, " +
  "and realistic lighting. Avoid blur, flicker, warping, or extra elements.";

const STATUS_LABELS: Record<AiClip["status"], string> = {
  pending: "Pending",
  submitted: "Queued",
  processing: "Generating…",
  succeeded: "Ready",
  failed: "Failed",
};

const STATUS_CLASSES: Record<AiClip["status"], string> = {
  pending: "bg-[var(--color-surface-soft)] text-[var(--color-text-muted)]",
  submitted: "bg-blue-500/15 text-blue-400",
  processing: "bg-amber-500/15 text-amber-400",
  succeeded: "bg-emerald-500/15 text-emerald-400",
  failed: "bg-red-500/15 text-red-400",
};

export function AiMotionPanel({ projectId, versionId, albumId, items }: Props) {
  const [clips, setClips] = useState<AiClip[]>([]);
  const [expanded, setExpanded] = useState(false);
  const [selection, setSelection] = useState<Set<string>>(new Set());
  const [prompt, setPrompt] = useState(DEFAULT_PROMPT);
  const [duration, setDuration] = useState<5 | 10>(5);
  const [mode, setMode] = useState<"std" | "pro">("std");
  const [provider, setProvider] = useState<ProviderId>("fal");
  const [model, setModel] = useState<string>(MODELS.fal[1].id);
  const [isGenerating, setIsGenerating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [previewClip, setPreviewClip] = useState<AiClip | null>(null);
  const pollTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const listUrl = useCallback(() => {
    const params = new URLSearchParams({ albumId });
    if (versionId) params.set("versionId", versionId);
    return `/api/projects/${projectId}/ai-clips?${params.toString()}`;
  }, [projectId, albumId, versionId]);

  const loadClips = useCallback(async () => {
    try {
      const res = await fetch(listUrl());
      if (!res.ok) return;
      const data = (await res.json()) as { clips: AiClip[] };
      setClips(data.clips);
    } catch {
      // Transient — the next poll retries.
    }
  }, [listUrl]);

  useEffect(() => {
    setClips([]);
    setSelection(new Set());
    void loadClips();
  }, [loadClips]);

  // Poll while any clip is still generating; the GET endpoint advances
  // provider state and persists finished videos server-side.
  const hasInFlight = clips.some((c) => c.status === "submitted" || c.status === "processing");
  useEffect(() => {
    if (!hasInFlight) return;
    pollTimer.current = setTimeout(() => void loadClips(), 6000);
    return () => {
      if (pollTimer.current) clearTimeout(pollTimer.current);
    };
  }, [hasInFlight, clips, loadClips]);

  function toggleSelect(assetId: string) {
    setSelection((prev) => {
      const next = new Set(prev);
      if (next.has(assetId)) {
        next.delete(assetId);
      } else if (next.size < MAX_SELECTION) {
        next.add(assetId);
      }
      return next;
    });
  }

  async function handleGenerate() {
    if (selection.size === 0 || isGenerating) return;
    setIsGenerating(true);
    setError(null);
    try {
      const res = await fetch(`/api/projects/${projectId}/ai-clips`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          versionId: versionId ?? undefined,
          albumId,
          items: Array.from(selection).map((assetId) => ({
            assetId,
            albumItemId: items.find((i) => i.assetId === assetId)?.albumItemId,
          })),
          prompt: prompt.trim(),
          provider,
          model,
          mode,
          durationSeconds: duration,
        }),
      });
      const data = (await res.json().catch(() => null)) as { clips?: AiClip[]; error?: string } | null;
      if (!res.ok) {
        setError(data?.error ?? "Failed to start AI motion generation.");
        return;
      }
      setSelection(new Set());
      await loadClips();
    } catch {
      setError("Failed to start AI motion generation.");
    } finally {
      setIsGenerating(false);
    }
  }

  async function handleToggleAccept(clip: AiClip) {
    const res = await fetch(`/api/projects/${projectId}/ai-clips/${clip.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ accepted: !clip.accepted }),
    });
    if (res.ok) {
      setClips((prev) =>
        prev.map((c) => (c.id === clip.id ? { ...c, accepted: !clip.accepted } : c))
      );
    }
  }

  async function handleDelete(clip: AiClip) {
    const res = await fetch(`/api/projects/${projectId}/ai-clips/${clip.id}`, {
      method: "DELETE",
    });
    if (res.ok) {
      setClips((prev) => prev.filter((c) => c.id !== clip.id));
      if (previewClip?.id === clip.id) setPreviewClip(null);
    }
  }

  const thumbFor = (assetId: string) =>
    items.find((i) => i.assetId === assetId)?.thumbnailUrl ?? null;

  const selectedModel = MODELS[provider].find((m) => m.id === model) ?? MODELS[provider][0];
  const estCost = selection.size * selectedModel.costPer5s * (duration / 5);

  return (
    <div className="mt-6 rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)] p-4">
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <Sparkles size={16} className="text-[var(--color-accent)]" />
          <h3 className="text-sm font-semibold text-[var(--color-text)]">AI motion</h3>
          <span className="text-xs text-[var(--color-text-muted)]">
            Animate up to {MAX_SELECTION} hero images (fal.ai / Kling) — the rest keep cinematic pan &amp; zoom
          </span>
        </div>
        <button
          type="button"
          onClick={() => setExpanded((v) => !v)}
          className="rounded-lg bg-[var(--color-surface-soft)] px-3 py-1.5 text-xs font-medium text-[var(--color-text-muted)] transition hover:text-[var(--color-text)]"
        >
          {expanded ? "Hide" : clips.length > 0 ? `Open (${clips.length})` : "Open"}
        </button>
      </div>

      {expanded && (
        <div className="mt-4 space-y-4">
          {/* Image selection */}
          <div>
            <p className="mb-2 text-xs font-medium text-[var(--color-text-muted)]">
              Select images ({selection.size}/{MAX_SELECTION})
            </p>
            <ul className="grid grid-cols-6 gap-2 sm:grid-cols-8 md:grid-cols-10">
              {items.map((item) => {
                const active = selection.has(item.assetId);
                const hasClip = clips.some(
                  (c) => c.assetId === item.assetId && c.status === "succeeded" && c.accepted
                );
                return (
                  <li key={item.albumItemId}>
                    <button
                      type="button"
                      onClick={() => toggleSelect(item.assetId)}
                      className={`relative block w-full overflow-hidden rounded-lg border transition ${
                        active
                          ? "border-[var(--color-accent)] ring-2 ring-[var(--color-accent)]/50"
                          : "border-[var(--color-border)] opacity-80 hover:opacity-100"
                      }`}
                      title={active ? "Deselect" : "Select for AI motion"}
                    >
                      {item.thumbnailUrl ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img src={item.thumbnailUrl} alt="" className="aspect-square w-full object-cover" />
                      ) : (
                        <span className="block aspect-square w-full bg-[var(--color-surface-soft)]" />
                      )}
                      {hasClip && (
                        <span className="absolute bottom-0.5 right-0.5 rounded bg-emerald-500/90 px-1 text-[8px] font-bold text-white">
                          AI
                        </span>
                      )}
                    </button>
                  </li>
                );
              })}
            </ul>
          </div>

          {/* Prompt + settings */}
          <div className="space-y-2">
            <textarea
              value={prompt}
              onChange={(e) => setPrompt(e.target.value)}
              rows={2}
              className="w-full rounded-lg border border-[var(--color-border)] bg-[var(--color-surface-soft)] p-2 text-xs text-[var(--color-text)] focus:border-[var(--color-accent)] focus:outline-none"
              placeholder="Describe the motion…"
            />
            <div className="flex flex-wrap items-center gap-2">
              <select
                value={provider}
                onChange={(e) => {
                  const next = e.target.value as ProviderId;
                  setProvider(next);
                  setModel(MODELS[next][0].id);
                }}
                className="rounded-lg border border-[var(--color-border)] bg-[var(--color-surface-soft)] px-2 py-1.5 text-xs text-[var(--color-text)]"
                title="Provider"
              >
                {(Object.keys(MODELS) as ProviderId[]).map((p) => (
                  <option key={p} value={p}>{PROVIDER_LABELS[p]}</option>
                ))}
              </select>
              <select
                value={model}
                onChange={(e) => setModel(e.target.value)}
                className="rounded-lg border border-[var(--color-border)] bg-[var(--color-surface-soft)] px-2 py-1.5 text-xs text-[var(--color-text)]"
                title="Model"
              >
                {MODELS[provider].map((m) => (
                  <option key={m.id} value={m.id}>{m.label}</option>
                ))}
              </select>
              <select
                value={duration}
                onChange={(e) => setDuration(Number(e.target.value) === 10 ? 10 : 5)}
                className="rounded-lg border border-[var(--color-border)] bg-[var(--color-surface-soft)] px-2 py-1.5 text-xs text-[var(--color-text)]"
              >
                <option value={5}>5 seconds</option>
                <option value={10}>10 seconds</option>
              </select>
              {selectedModel?.usesMode && (
                <select
                  value={mode}
                  onChange={(e) => setMode(e.target.value === "pro" ? "pro" : "std")}
                  className="rounded-lg border border-[var(--color-border)] bg-[var(--color-surface-soft)] px-2 py-1.5 text-xs text-[var(--color-text)]"
                >
                  <option value="std">Standard quality</option>
                  <option value="pro">Pro quality</option>
                </select>
              )}
              <span className="text-[11px] text-[var(--color-text-subtle)]">
                {selection.size > 0
                  ? `~$${estCost.toFixed(2)} — ${selection.size} clip${selection.size > 1 ? "s" : ""} × ${duration}s via ${PROVIDER_LABELS[provider]}`
                  : "Select at least one image"}
              </span>
              <button
                type="button"
                onClick={handleGenerate}
                disabled={selection.size === 0 || isGenerating || prompt.trim().length === 0}
                className="ml-auto inline-flex items-center gap-1.5 rounded-lg bg-[var(--color-accent)] px-3 py-1.5 text-xs font-semibold text-white transition disabled:cursor-not-allowed disabled:opacity-40"
              >
                {isGenerating ? <Loader2 size={13} className="animate-spin" /> : <Sparkles size={13} />}
                Generate AI motion
              </button>
            </div>
            {error && <p className="text-xs text-red-400">{error}</p>}
          </div>

          {/* Clip list */}
          {clips.length > 0 && (
            <ul className="space-y-2">
              {clips.map((clip) => (
                <li
                  key={clip.id}
                  className="flex items-center gap-3 rounded-lg border border-[var(--color-border)] bg-[var(--color-surface-soft)] p-2"
                >
                  {thumbFor(clip.assetId) ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      src={thumbFor(clip.assetId)!}
                      alt=""
                      className="h-10 w-10 shrink-0 rounded-md object-cover"
                    />
                  ) : (
                    <span className="h-10 w-10 shrink-0 rounded-md bg-[var(--color-surface)]" />
                  )}
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <span
                        className={`inline-flex items-center gap-1 rounded px-1.5 py-0.5 text-[10px] font-semibold ${STATUS_CLASSES[clip.status]}`}
                      >
                        {(clip.status === "processing" || clip.status === "submitted") && (
                          <Loader2 size={9} className="animate-spin" />
                        )}
                        {STATUS_LABELS[clip.status]}
                      </span>
                      <span className="text-[10px] text-[var(--color-text-subtle)]">
                        {clip.model} · {clip.mode} · {clip.durationSeconds}s
                      </span>
                    </div>
                    <p className="truncate text-[11px] text-[var(--color-text-muted)]" title={clip.prompt}>
                      {clip.status === "failed" && clip.errorMessage ? clip.errorMessage : clip.prompt}
                    </p>
                  </div>
                  {clip.status === "succeeded" && (
                    <>
                      <button
                        type="button"
                        onClick={() => setPreviewClip(previewClip?.id === clip.id ? null : clip)}
                        className="inline-flex items-center gap-1 rounded-lg bg-[var(--color-surface)] px-2 py-1 text-[11px] text-[var(--color-text-muted)] transition hover:text-[var(--color-text)]"
                      >
                        <Play size={11} /> Preview
                      </button>
                      <label className="inline-flex cursor-pointer items-center gap-1.5 text-[11px] text-[var(--color-text-muted)]">
                        <input
                          type="checkbox"
                          checked={clip.accepted}
                          onChange={() => void handleToggleAccept(clip)}
                          className="accent-[var(--color-accent)]"
                        />
                        Use in video
                      </label>
                    </>
                  )}
                  <button
                    type="button"
                    onClick={() => void handleDelete(clip)}
                    className="rounded-md p-1 text-[var(--color-text-subtle)] transition hover:bg-red-500/15 hover:text-red-400"
                    aria-label="Delete clip"
                    title="Delete clip"
                  >
                    <Trash2 size={13} />
                  </button>
                </li>
              ))}
            </ul>
          )}

          {/* Inline preview */}
          {previewClip?.previewUrl && (
            <div className="relative overflow-hidden rounded-lg border border-[var(--color-border)]">
              <button
                type="button"
                onClick={() => setPreviewClip(null)}
                className="absolute right-2 top-2 z-10 rounded-full bg-black/60 p-1 text-white"
                aria-label="Close preview"
              >
                <X size={13} />
              </button>
              {/* eslint-disable-next-line jsx-a11y/media-has-caption */}
              <video src={previewClip.previewUrl} controls autoPlay className="max-h-72 w-full bg-black" />
            </div>
          )}
        </div>
      )}
    </div>
  );
}
