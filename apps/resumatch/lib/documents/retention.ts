import "server-only";
import { getJobmatchDb } from "../db/client";
import { logError, log } from "../observability/logger";
import { recordAuditEvent } from "../workspace";
import { deleteDocumentBytes } from "./storage";

/**
 * Retention enforcement (JM-017).
 *
 * `retainUntil` on its own is a promise nobody keeps: a date column that no
 * code reads is decoration, and a privacy notice that cites it would be
 * false. This is the code that makes it true.
 *
 * The sweep is deliberately conservative. It deletes the *original upload*
 * once its window closes, and leaves the confirmed profile version in
 * place — the candidate's working profile does not evaporate at 90 days,
 * only the source document does. Erasure (JM-023) is what removes both.
 *
 * Bytes are removed before rows, and only a verified removal drops the row,
 * so a failure leaves the record pointing at the object rather than
 * orphaning it.
 */

export interface SweepResult {
  examined: number;
  deleted: number;
  failed: number;
}

/** Bounded so one sweep cannot hold a connection for an unbounded time. */
const SWEEP_BATCH = 200;

export async function sweepExpiredDocuments(now: Date = new Date()): Promise<SweepResult> {
  const db = getJobmatchDb();

  const expired = await db.candidateDocument.findMany({
    where: { retainUntil: { lte: now } },
    select: { id: true, workspaceId: true, storageKey: true },
    orderBy: { retainUntil: "asc" },
    take: SWEEP_BATCH,
  });

  let deleted = 0;
  let failed = 0;

  for (const document of expired) {
    try {
      if (!(await deleteDocumentBytes(document.storageKey))) {
        failed += 1;
        continue;
      }
      await db.candidateDocument.delete({ where: { id: document.id } });
      await recordAuditEvent(document.workspaceId, "document.retention.expired", {
        jobId: document.id,
      });
      deleted += 1;
    } catch (error) {
      failed += 1;
      logError("retention.sweep.failed", error, { jobId: document.id });
    }
  }

  if (expired.length > 0) {
    log.info("retention.sweep", { count: expired.length, outcome: `${deleted}/${failed}` });
  }

  return { examined: expired.length, deleted, failed };
}
