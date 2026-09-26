/**
 * Merges several independently paginated, newest-first streams into one
 * page, and works out each stream's cursor for the next page.
 *
 * Used by app/api/internal/user-activity/browse. Each stream is fetched
 * with `limit + 1` rows from its own cursor; this merges them, keeps the
 * newest `limit`, and advances each stream's cursor only past the rows that
 * were actually *returned*:
 * - a stream that returned rows resumes after its last returned row, so rows
 *   it fetched but that lost out to newer rows from other streams come back
 *   on the next page instead of being skipped;
 * - a stream that returned every row it has is marked done, so the next page
 *   doesn't start it again from the top (the duplicate this replaces);
 * - a stream that returned nothing keeps the cursor it came in with.
 *
 * Cursors are createdAt ISO strings compared with `lt`, so rows sharing one
 * exact millisecond across a page boundary can still be skipped, the same
 * trade-off as before.
 */

export const STREAM_DONE = "done";

export interface FeedStream<T extends { createdAt: Date }> {
  key: string;
  /** The rows fetched this page, newest first, at most `limit` (the `+1` already trimmed). */
  rows: T[];
  /** Whether the fetch found a row beyond `rows`. */
  hasMore: boolean;
  /** The cursor this stream came in with (absent: from the top). */
  cursor?: string;
}

export interface MergedPage<T> {
  entries: T[];
  cursors: Record<string, string>;
  hasMore: boolean;
}

export function mergeFeedPage<T extends { createdAt: Date }>(streams: FeedStream<T>[], limit: number): MergedPage<T> {
  const tagged = streams.flatMap((stream) => stream.rows.map((row) => ({ key: stream.key, row })));
  tagged.sort((a, b) => b.row.createdAt.getTime() - a.row.createdAt.getTime());
  const kept = tagged.slice(0, limit);

  const cursors: Record<string, string> = {};
  for (const stream of streams) {
    const returned = kept.filter((item) => item.key === stream.key);
    if (stream.cursor === STREAM_DONE || (returned.length === stream.rows.length && !stream.hasMore)) {
      cursors[stream.key] = STREAM_DONE;
    } else if (returned.length > 0) {
      cursors[stream.key] = returned[returned.length - 1]!.row.createdAt.toISOString();
    } else if (stream.cursor) {
      cursors[stream.key] = stream.cursor;
    }
  }

  const hasMore = streams.some((stream) => cursors[stream.key] !== STREAM_DONE);
  return { entries: kept.map((item) => item.row), cursors, hasMore };
}
