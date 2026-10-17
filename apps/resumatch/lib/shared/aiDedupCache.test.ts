import { beforeEach, describe, expect, it } from "vitest";
import {
  AI_DEDUP_MAX_ENTRIES,
  AI_DEDUP_TTL_MS,
  clearDedupCacheForTests,
  dedupCacheSizeForTests,
  getDedupedResult,
  storeDedupedResult,
  type DedupKeyParts,
} from "./aiDedupCache";

const key = (overrides: Partial<DedupKeyParts> = {}): DedupKeyParts => ({
  workspaceId: "ws_1",
  kind: "extract",
  provider: "openai",
  model: "gpt-4o-mini",
  promptCacheKey: "abc",
  ...overrides,
});

describe("aiDedupCache (issue #513)", () => {
  beforeEach(() => clearDedupCacheForTests());

  it("returns a stored value until the TTL ends, then forgets it", () => {
    storeDedupedResult(key(), { n: 1 }, 1_000);
    expect(getDedupedResult(key(), 1_000 + AI_DEDUP_TTL_MS - 1)).toEqual({
      n: 1,
    });
    expect(getDedupedResult(key(), 1_000 + AI_DEDUP_TTL_MS)).toBeUndefined();
    expect(dedupCacheSizeForTests()).toBe(0);
  });

  it("keys on every part: workspace, kind, provider, model and prompt hash", () => {
    storeDedupedResult(key(), { n: 1 }, 0);
    for (const other of [
      key({ workspaceId: "ws_2" }),
      key({ kind: "fetch_job" }),
      key({ provider: "anthropic" }),
      key({ model: "other" }),
      key({ promptCacheKey: "def" }),
    ]) {
      expect(getDedupedResult(other, 1)).toBeUndefined();
    }
    expect(getDedupedResult(key(), 1)).toEqual({ n: 1 });
  });

  it("copies values in and out", () => {
    const value = { list: [1] };
    storeDedupedResult(key(), value, 0);
    value.list.push(2);
    const out = getDedupedResult<{ list: number[] }>(key(), 1);
    expect(out).toEqual({ list: [1] });
    out?.list.push(3);
    expect(getDedupedResult(key(), 1)).toEqual({ list: [1] });
  });

  it("stays bounded, dropping the oldest entries first", () => {
    for (let i = 0; i <= AI_DEDUP_MAX_ENTRIES; i++) {
      storeDedupedResult(key({ promptCacheKey: `k${i}` }), i, 0);
    }
    expect(dedupCacheSizeForTests()).toBe(AI_DEDUP_MAX_ENTRIES);
    expect(getDedupedResult(key({ promptCacheKey: "k0" }), 1)).toBeUndefined();
    expect(
      getDedupedResult(key({ promptCacheKey: `k${AI_DEDUP_MAX_ENTRIES}` }), 1)
    ).toBe(AI_DEDUP_MAX_ENTRIES);
  });
});
