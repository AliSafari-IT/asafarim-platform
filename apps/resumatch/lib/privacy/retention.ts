import "server-only";
import { getJobmatchDb } from "../db/client";
import { log, logError } from "../observability/logger";
import { recordAuditEvent } from "../workspace";
import { DRAFT_RETENTION_DAYS } from "../tailoring/drafts/contract";

/**
 * Retention for personalization records (#933).
 *
 * Two kinds of row hold copies of personal content that nobody needs
 * forever:
 *
 * - **Previews** (`tailor_previews`): the request context (a copy of the job
 *   text, the candidate's note, the resolved style notes) and the AI's
 *   suggestions as generated. A preview only backs one confirm. Once it is
 *   used, its suggestions live on in the CV's review feedback; when it is
 *   never used, it is an abandoned draft. Either way it is deleted
 *   `PREVIEW_RETENTION_DAYS` after it was made. A confirm against a deleted
 *   preview gets the same 409 as an expired one.
 * - **Review feedback** (`tailoring_feedback`): the original suggestions and
 *   what the candidate did with each. Deleted `FEEDBACK_RETENTION_DAYS`
 *   after it was recorded. The CV itself, its own text and its request
 *   context stay: they are the candidate's document, removed only by the
 *   candidate (delete or erasure).
 *
 * - **Tailor drafts** (`tailor_drafts`): an unfinished Tailor run, with the
 *   candidate's note and, on the review step, a copy of the suggestions
 *   with their edits. Deleted `DRAFT_RETENTION_DAYS` after its last change
 *   (saving the CV or "Discard" deletes it sooner). The job row stays.
 *
 * What survives is metadata without content: the audit events
 * (`tailoring.feedback.recorded` holds counts only) and the AI cost and
 * outcome rows (provider, model, tokens, cost, error code).
 *
 * The sweep is bounded per call and idempotent: rows already deleted (by
 * erasure, a CV delete or an earlier sweep) are simply not found again.
 */

export const PREVIEW_RETENTION_DAYS = 30;
export const FEEDBACK_RETENTION_DAYS = 180;

const DAY_MS = 24 * 60 * 60 * 1000;
/** Rows per batch, and batches per sweep, so one call stays short. */
const SWEEP_BATCH = 500;
const MAX_BATCHES = 10;

export interface PersonalizationSweepResult {
  previewsDeleted: number;
  feedbackDeleted: number;
  draftsDeleted: number;
}

export function previewCutoff(now: Date): Date {
  return new Date(now.getTime() - PREVIEW_RETENTION_DAYS * DAY_MS);
}

export function feedbackCutoff(now: Date): Date {
  return new Date(now.getTime() - FEEDBACK_RETENTION_DAYS * DAY_MS);
}

export function draftCutoff(now: Date): Date {
  return new Date(now.getTime() - DRAFT_RETENTION_DAYS * DAY_MS);
}

type Table = "preview" | "feedback" | "draft";

async function sweepTable(table: Table, cutoff: Date, perWorkspace: Map<string, PersonalizationSweepResult>): Promise<number> {
  const db = getJobmatchDb();
  let deleted = 0;
  for (let batch = 0; batch < MAX_BATCHES; batch += 1) {
    const where = { createdAt: { lt: cutoff } };
    const select = { id: true, workspaceId: true };
    const rows =
      table === "preview"
        ? await db.tailorPreview.findMany({ where, select, orderBy: { createdAt: "asc" }, take: SWEEP_BATCH })
        : table === "feedback"
          ? await db.tailoringFeedback.findMany({ where, select, orderBy: { createdAt: "asc" }, take: SWEEP_BATCH })
          : // A draft ages from its last change, not from when it opened.
            await db.tailorDraft.findMany({ where: { updatedAt: { lt: cutoff } }, select, orderBy: { updatedAt: "asc" }, take: SWEEP_BATCH });
    if (rows.length === 0) break;
    const ids = rows.map((r) => r.id);
    // The age condition is repeated so a row can never be deleted early,
    // whatever happened between the read and the delete.
    // A draft saved again meanwhile is newer than the cutoff and stays.
    const result =
      table === "preview"
        ? await db.tailorPreview.deleteMany({ where: { id: { in: ids }, createdAt: { lt: cutoff } } })
        : table === "feedback"
          ? await db.tailoringFeedback.deleteMany({ where: { id: { in: ids }, createdAt: { lt: cutoff } } })
          : await db.tailorDraft.deleteMany({ where: { id: { in: ids }, updatedAt: { lt: cutoff } } });
    deleted += result.count;
    for (const row of rows) {
      const counts = perWorkspace.get(row.workspaceId) ?? { previewsDeleted: 0, feedbackDeleted: 0, draftsDeleted: 0 };
      if (table === "preview") counts.previewsDeleted += 1;
      else if (table === "feedback") counts.feedbackDeleted += 1;
      else counts.draftsDeleted += 1;
      perWorkspace.set(row.workspaceId, counts);
    }
    if (rows.length < SWEEP_BATCH) break;
  }
  return deleted;
}

/** Deletes previews, review feedback and Tailor drafts past their
 *  retention window. */
export async function sweepExpiredPersonalization(now: Date = new Date()): Promise<PersonalizationSweepResult> {
  const perWorkspace = new Map<string, PersonalizationSweepResult>();
  const previewsDeleted = await sweepTable("preview", previewCutoff(now), perWorkspace);
  const feedbackDeleted = await sweepTable("feedback", feedbackCutoff(now), perWorkspace);
  const draftsDeleted = await sweepTable("draft", draftCutoff(now), perWorkspace);

  // One audit event per workspace touched: counts only, never content.
  for (const [workspaceId, counts] of perWorkspace) {
    await recordAuditEvent(workspaceId, "personalization.retention.expired", {
      count: counts.previewsDeleted + counts.feedbackDeleted + counts.draftsDeleted,
      outcome: `previews:${counts.previewsDeleted},feedback:${counts.feedbackDeleted},drafts:${counts.draftsDeleted}`,
    });
  }
  const total = previewsDeleted + feedbackDeleted + draftsDeleted;
  if (total > 0) {
    log.info("retention.personalization", { count: total, outcome: `${previewsDeleted}/${feedbackDeleted}/${draftsDeleted}` });
  }
  return { previewsDeleted, feedbackDeleted, draftsDeleted };
}

/** How often the opportunistic sweep may run in one server process. */
export const OPPORTUNISTIC_SWEEP_INTERVAL_MS = 60 * 60 * 1000;
let lastSweepAt = 0;
let running: Promise<unknown> | null = null;

/**
 * Runs the sweep at most once an hour per process, from ordinary candidate
 * requests. Production has no scheduler calling POST /api/retention yet, so
 * without this the windows above would be a promise no code keeps. Never
 * throws: a failed sweep is logged (ids and counts only) and tried again
 * on the next interval.
 */
export function maybeSweepPersonalization(now: number = Date.now()): Promise<unknown> | null {
  if (running || now - lastSweepAt < OPPORTUNISTIC_SWEEP_INTERVAL_MS) return null;
  lastSweepAt = now;
  running = sweepExpiredPersonalization(new Date(now))
    .catch((error) => logError("retention.personalization.failed", error))
    .finally(() => {
      running = null;
    });
  return running;
}

/** Test-only: allow the next opportunistic sweep to run. */
export function resetOpportunisticSweepForTests(): void {
  lastSweepAt = 0;
  running = null;
}
