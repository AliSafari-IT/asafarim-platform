import { getJobmatchDb } from "../../db/client";
import type { Prisma } from "../../db/generated";
import { parseMatchResult, type MatchResult } from "../contract";

/**
 * MatchRun cache (JM-047).
 *
 * Keyed by `(workspaceId, profileVersionId, postingId, promptVersion,
 * evaluationModelVersion)` -- the exact tuple the issue specifies, and the
 * unique constraint on the `MatchRun` Prisma model, so a cache hit is a
 * single indexed lookup rather than a scan. A re-view of the same job on the
 * same *confirmed* profile version costs nothing: `profileVersionId` is part
 * of the key precisely because a version is immutable (lib/profile/versions
 * .ts) -- a new correction gets a new version id and therefore a fresh cache
 * miss, which is correct: the content actually changed.
 *
 * `recordMatchRun` is the write path JM-043 (the real LLM evaluation step,
 * not built yet) will call once it exists. Nothing calls it with real
 * evaluation data in this PR -- see matchRunCache.test.ts, which proves the
 * round-trip directly against a stub MatchResult.
 */

export interface MatchRunKey {
  workspaceId: string;
  profileVersionId: string;
  postingId: string;
  promptVersion: string;
  evaluationModelVersion: string;
}

/** Look up a cached MatchRun. Returns `null` on a miss -- the caller (JM-043)
 *  is responsible for then running a real evaluation and calling
 *  `recordMatchRun`. Zero provider calls happen in this function itself. */
export async function getCachedMatchRun(key: MatchRunKey): Promise<MatchResult | null> {
  const db = getJobmatchDb();
  const row = await db.matchRun.findUnique({
    where: {
      workspaceId_profileVersionId_postingId_promptVersion_evaluationModelVersion: key,
    },
    select: { result: true },
  });
  if (!row) return null;
  // Re-parsed rather than trusted as-is, same discipline as
  // dataRights.ts's export re-parsing CandidateProfileVersion.content: a
  // stored row can never be assumed to still match the current contract.
  return parseMatchResult(row.result);
}

/** Persist a MatchRun so a later `getCachedMatchRun` call with the same key
 *  is a cache hit. Upserts on the same unique key the lookup uses, so a
 *  re-evaluation (e.g. after a prompt-version bump) replaces the row rather
 *  than erroring on the constraint. */
export async function recordMatchRun(key: MatchRunKey, result: MatchResult, costUsd = 0): Promise<void> {
  const db = getJobmatchDb();
  const data = {
    workspaceId: key.workspaceId,
    profileVersionId: key.profileVersionId,
    postingId: key.postingId,
    promptVersion: key.promptVersion,
    evaluationModelVersion: key.evaluationModelVersion,
    costUsd,
    degraded: result.degraded,
    // Cast through unknown: Prisma's generated JsonValue type does not know
    // about matchResultSchema's shape, but `result` was already validated
    // by the caller (parseMatchResult / buildDegradedMatchResult both
    // return a schema-checked MatchResult).
    result: result as unknown as Prisma.InputJsonValue,
  };

  await db.matchRun.upsert({
    where: {
      workspaceId_profileVersionId_postingId_promptVersion_evaluationModelVersion: key,
    },
    create: data,
    update: { costUsd, degraded: result.degraded, result: data.result },
  });
}
