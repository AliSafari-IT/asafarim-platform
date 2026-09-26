import { describe, expect, it } from "vitest";
import { STREAM_DONE, mergeFeedPage, type FeedStream } from "./mergeFeed";

interface Row {
  id: string;
  createdAt: Date;
}

const at = (id: string, minute: number): Row => ({ id, createdAt: new Date(Date.UTC(2026, 8, 26, 12, minute)) });

/** Simulates the route: each stream fetches `limit + 1` rows older than its cursor. */
function fetchPage(all: Record<string, Row[]>, cursors: Record<string, string>, limit: number) {
  const streams: FeedStream<Row>[] = Object.entries(all).map(([key, rows]) => {
    const cursor = cursors[key];
    if (cursor === STREAM_DONE) return { key, rows: [], hasMore: false, cursor };
    const older = rows.filter((row) => !cursor || row.createdAt < new Date(cursor));
    return { key, rows: older.slice(0, limit), hasMore: older.length > limit, cursor };
  });
  return mergeFeedPage(streams, limit);
}

function walk(all: Record<string, Row[]>, limit: number): string[] {
  const seen: string[] = [];
  let cursors: Record<string, string> = {};
  for (let guard = 0; guard < 50; guard++) {
    const page = fetchPage(all, cursors, limit);
    seen.push(...page.entries.map((row) => row.id));
    if (!page.hasMore) return seen;
    cursors = page.cursors;
  }
  throw new Error("pagination did not terminate");
}

describe("mergeFeedPage", () => {
  const streams = {
    resume: [at("r3", 50), at("r2", 30), at("r1", 10)],
    letter: [at("l1", 55)],
    application: [at("a2", 40), at("a1", 20)],
    status: [at("s1", 45)],
  };
  const newestFirst = ["l1", "r3", "s1", "a2", "r2", "a1", "r1"];

  it.each([1, 2, 3, 7, 25])("walks every row exactly once, newest first, at limit %i", (limit) => {
    expect(walk(streams, limit)).toEqual(newestFirst);
  });

  it("marks a stream done once everything it has was returned", () => {
    const page = fetchPage(streams, {}, 2);
    expect(page.entries.map((row) => row.id)).toEqual(["l1", "r3"]);
    expect(page.cursors.letter).toBe(STREAM_DONE);
    // r2 was fetched but lost out to l1: the resume cursor stops at r3, not r2.
    expect(page.cursors.resume).toBe(at("r3", 50).createdAt.toISOString());
    // Nothing shown from these yet, so they start from the top again.
    expect(page.cursors.application).toBeUndefined();
    expect(page.hasMore).toBe(true);
  });

  it("has no more once every stream is done", () => {
    const page = fetchPage(streams, {}, 25);
    expect(page.hasMore).toBe(false);
    expect(Object.values(page.cursors).every((cursor) => cursor === STREAM_DONE)).toBe(true);
  });

  it("handles every stream being empty", () => {
    expect(walk({ resume: [], letter: [] }, 5)).toEqual([]);
  });
});
