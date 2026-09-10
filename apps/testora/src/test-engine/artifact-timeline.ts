import type { TimelineStep } from "@asafarim/testora-tasksai-contract";

/**
 * Pure helpers for failure-artifact capture (issue #259). No object-storage or
 * DB import, so they can be unit-tested in isolation.
 */

export const ARTIFACT_RETENTION_DAYS = 30;

export type ArtifactKind = "screenshot" | "domSnapshot" | "video";

export const ARTIFACT_EXTENSION: Record<ArtifactKind, string> = {
  screenshot: "png",
  domSnapshot: "html",
  video: "mp4",
};

export const ARTIFACT_CONTENT_TYPE: Record<ArtifactKind, string> = {
  screenshot: "image/png",
  domSnapshot: "text/html; charset=utf-8",
  video: "video/mp4",
};

/** Upper bounds (bytes) — a bigger capture is dropped, not stored. */
export const ARTIFACT_MAX_BYTES: Record<ArtifactKind, number> = {
  screenshot: 8_000_000,
  domSnapshot: 3_000_000,
  video: 80_000_000,
};

/** Deterministic object key, so an artifact is easy to serve and to prune. */
export function artifactStorageKey(resultId: string, kind: ArtifactKind): string {
  return `testora/results/${resultId}/${kind}.${ARTIFACT_EXTENSION[kind]}`;
}

/** A stored artifact pointer, persisted small in `test_results.details.artifactRefs`. */
export interface StoredArtifactRef {
  key: string;
  bytes: number;
  contentType: string;
  capturedAt: string;
  expiresAt: string;
}

export type StoredArtifactRefs = Partial<Record<ArtifactKind, StoredArtifactRef>>;

export function artifactExpiry(from: Date = new Date()): {
  capturedAt: string;
  expiresAt: string;
} {
  const expires = new Date(from.getTime() + ARTIFACT_RETENTION_DAYS * 86_400_000);
  return { capturedAt: from.toISOString(), expiresAt: expires.toISOString() };
}

// eslint-disable-next-line no-control-regex
const ANSI = /\x1b\[[0-9;]*m/g;

/** Metadata pulled off a TestCafe error adapter by the capture reporter. */
export interface StepErrorMeta {
  apiFnChain?: unknown;
  apiFnIndex?: unknown;
}

/**
 * Builds a structured step/assertion timeline for a failed test from the
 * TestCafe error's `apiFnChain` (the ordered list of chained API calls) and
 * `apiFnIndex` (the one that threw). Steps before the failure are `passed`,
 * the failing one `failed`, any after it `skipped`. TestCafe gives no
 * per-step timing, so `startedAtMs` / `durationMs` are 0.
 *
 * Returns `[]` when there is no usable chain — a passing test carries no
 * timeline.
 */
export function buildStepTimeline(errMeta: StepErrorMeta | null | undefined): TimelineStep[] {
  const chain = Array.isArray(errMeta?.apiFnChain) ? (errMeta.apiFnChain as unknown[]) : [];
  if (chain.length === 0) return [];

  const rawIndex = typeof errMeta?.apiFnIndex === "number" ? errMeta.apiFnIndex : chain.length - 1;
  const failIndex = Math.min(Math.max(rawIndex, 0), chain.length - 1);

  return chain.slice(0, 2000).map((entry, index) => {
    const label = String(entry).replace(ANSI, "").trim().slice(0, 500) || `step ${index}`;
    const status: TimelineStep["status"] =
      index < failIndex ? "passed" : index === failIndex ? "failed" : "skipped";
    return { index, label, status, startedAtMs: 0, durationMs: 0 };
  });
}
