import "server-only";
import { createHash } from "node:crypto";
import type { ToolRunEnvelope } from "../envelope";

/**
 * Duplicate-submission guard for one logical run.
 *
 * The browser mints an idempotency key once per run and reuses it for any
 * retry. Within `windowMs`:
 * - same key + same input while the first attempt is in flight → the
 *   duplicate awaits the same promise (one provider call, one spend);
 * - same key + same input after it finished → the finished envelope is
 *   returned again, no new call;
 * - same key + different input → `idempotency_conflict`.
 *
 * Stored per entry: a SHA-256 of the input (never the input itself) and the
 * envelope. The envelope does hold the result, in process memory only, for
 * at most `windowMs` — the price of letting a browser that lost the response
 * get it back without paying twice. It is never written to disk, logs, or a
 * shared cache. Single-instance by design (the web container runs one
 * replica); a multi-instance deployment needs a shared store (#680).
 */
export interface IdempotencyStore {
  run(
    key: string,
    inputHash: string,
    execute: () => Promise<ToolRunEnvelope>,
  ): Promise<{ kind: "fresh" | "replayed"; envelope: ToolRunEnvelope } | { kind: "conflict" }>;
}

interface Entry {
  inputHash: string;
  expiresAt: number;
  promise: Promise<ToolRunEnvelope>;
}

export function hashInput(slug: string, input: unknown): string {
  return createHash("sha256").update(slug).update("\0").update(stableStringify(input)).digest("hex");
}

export function createMemoryIdempotencyStore(
  options: { windowMs?: number; maxEntries?: number; now?: () => number } = {},
): IdempotencyStore {
  const windowMs = options.windowMs ?? 2 * 60_000;
  const maxEntries = options.maxEntries ?? 5_000;
  const now = options.now ?? Date.now;
  const entries = new Map<string, Entry>();

  function sweep() {
    const t = now();
    for (const [key, entry] of entries) if (entry.expiresAt <= t) entries.delete(key);
    // Oldest-first eviction keeps memory bounded under a flood of unique keys.
    while (entries.size >= maxEntries) entries.delete(entries.keys().next().value as string);
  }

  return {
    async run(key, inputHash, execute) {
      const existing = entries.get(key);
      if (existing && existing.expiresAt > now()) {
        if (existing.inputHash !== inputHash) return { kind: "conflict" };
        return { kind: "replayed", envelope: await existing.promise };
      }
      sweep();
      const promise = execute();
      entries.set(key, { inputHash, expiresAt: now() + windowMs, promise });
      const envelope = await promise.catch((error: unknown) => {
        entries.delete(key);
        throw error;
      });
      // Only successful and final outcomes are replayable; a retryable
      // failure (timeout, provider hiccup, in-progress) frees the key so the
      // user's retry actually retries.
      if (!envelope.ok && envelope.error.retryable) entries.delete(key);
      return { kind: "fresh", envelope };
    },
  };
}

/** Deterministic JSON (sorted keys) so equal inputs hash equally. */
function stableStringify(value: unknown): string {
  if (value === null || typeof value !== "object") return JSON.stringify(value) ?? "null";
  if (Array.isArray(value)) return `[${value.map(stableStringify).join(",")}]`;
  const record = value as Record<string, unknown>;
  return `{${Object.keys(record)
    .sort()
    .map((k) => `${JSON.stringify(k)}:${stableStringify(record[k])}`)
    .join(",")}}`;
}
