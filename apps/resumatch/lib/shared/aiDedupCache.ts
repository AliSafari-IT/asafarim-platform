import { log } from "../observability/logger";

/**
 * Short-TTL dedup cache for AI calls whose output is a pure function of
 * their input (issue #513): CV extraction and AI job-fetch only.
 *
 * It absorbs the "same thing submitted twice in a row" case — a CV
 * re-uploaded because the UI never confirmed the first save, a job-fetch
 * retried after a transient error — so that the second submission does not
 * pay for a second provider round-trip or write a second AiUsageLedger row.
 * The TTL is deliberately short: a request re-run minutes or hours later is
 * a real request and gets a fresh call.
 *
 * Tailoring, cover letters and rewrite must NEVER use this module: each of
 * those calls is a candidate deliberately asking for a fresh version (see
 * lib/tailoring/ai/generate.ts). aiDedupCache.scope.test.ts guards that.
 *
 * In-process on purpose: no new infrastructure, and a miss on another
 * instance only costs what every call cost before this cache existed.
 * Only successful, non-degraded results are stored, and values are cloned
 * in and out so no caller can mutate what the next caller receives.
 */

export type DedupKind = "extract" | "fetch_job";

export const AI_DEDUP_TTL_MS = 5 * 60 * 1000;
export const AI_DEDUP_MAX_ENTRIES = 500;

interface Entry {
  expiresAt: number;
  value: unknown;
}

const entries = new Map<string, Entry>();

export interface DedupKeyParts {
  workspaceId: string;
  kind: DedupKind;
  provider: string;
  model: string;
  /** The prompt's own content hash (`RenderedXPrompt.cacheKey`): it already
   *  covers the prompt version, the system prompt and the full user input. */
  promptCacheKey: string;
}

function keyOf(parts: DedupKeyParts): string {
  return [
    parts.workspaceId,
    parts.kind,
    parts.provider,
    parts.model,
    parts.promptCacheKey,
  ].join("::");
}

/**
 * Return a copy of a stored result for this exact input, or `undefined`.
 * A hit is logged as `ai.dedup_cache.hit` — never as a provider call or a
 * degrade — so cost and degrade-rate reporting stay accurate.
 */
export function getDedupedResult<T>(
  parts: DedupKeyParts,
  now: number = Date.now()
): T | undefined {
  const key = keyOf(parts);
  const entry = entries.get(key);
  if (!entry) return undefined;
  if (entry.expiresAt <= now) {
    entries.delete(key);
    return undefined;
  }
  log.info("ai.dedup_cache.hit", {
    workspaceId: parts.workspaceId,
    kind: parts.kind,
    provider: parts.provider,
    ttlMs: AI_DEDUP_TTL_MS,
    ageMs: AI_DEDUP_TTL_MS - (entry.expiresAt - now),
  });
  return structuredClone(entry.value) as T;
}

/** Store a successful, non-degraded result for `AI_DEDUP_TTL_MS`. */
export function storeDedupedResult<T>(
  parts: DedupKeyParts,
  value: T,
  now: number = Date.now()
): void {
  const key = keyOf(parts);
  entries.delete(key); // re-insert so Map order stays oldest-first
  entries.set(key, {
    expiresAt: now + AI_DEDUP_TTL_MS,
    value: structuredClone(value),
  });

  if (entries.size <= AI_DEDUP_MAX_ENTRIES) return;
  for (const [k, e] of entries) {
    if (e.expiresAt <= now) entries.delete(k);
  }
  while (entries.size > AI_DEDUP_MAX_ENTRIES) {
    const oldest = entries.keys().next().value;
    if (oldest === undefined) break;
    entries.delete(oldest);
  }
}

/** Test-only: forget every stored result. */
export function clearDedupCacheForTests(): void {
  entries.clear();
}

/** Test-only: number of stored results. */
export function dedupCacheSizeForTests(): number {
  return entries.size;
}
