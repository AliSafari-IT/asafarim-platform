import "server-only";
import { getJobmatchDb } from "../db/client";
import { authorizeSource, explainRefusal, type IngestionRefusal } from "./authorization";

/**
 * Ingestion health, as a query rather than a guess (JM-031).
 *
 * A source that silently stops syncing is the failure nobody notices until a
 * candidate asks why nothing is new, so every number an operator needs to
 * spot that is here: whether a source is even permitted to run, when it last
 * did, what its recent runs cost, and how close its agreement is to expiry.
 */

/** An agreement inside this window is reported as expiring, not merely valid. */
export const AGREEMENT_WARNING_DAYS = 30;

export interface SourceHealth {
  key: string;
  name: string;
  status: string;
  syncEnabled: boolean;
  /** Whether a sync would be permitted right now, and why not. */
  canSync: boolean;
  refusal: string | null;
  agreementExpiresAt: string | null;
  agreementExpiringSoon: boolean;
  lastSyncFinishedAt: string | null;
  activePostings: number;
  duplicatePostings: number;
  recentRuns: {
    startedAt: string;
    outcome: string | null;
    reasonCode: string | null;
    recordsFetched: number;
    recordsAdded: number;
    recordsExpired: number;
    parseFailures: number;
    notModified: boolean;
    durationMs: number | null;
  }[];
}

export async function getIngestionHealth(now: Date = new Date()): Promise<SourceHealth[]> {
  const db = getJobmatchDb();

  const sources = await db.jobSource.findMany({
    orderBy: { key: "asc" },
    include: {
      runs: { orderBy: { startedAt: "desc" }, take: 5 },
    },
  });

  return Promise.all(
    sources.map(async (source) => {
      const [activePostings, duplicatePostings] = await Promise.all([
        db.jobPosting.count({ where: { sourceId: source.id, status: "ACTIVE" } }),
        db.jobPosting.count({ where: { sourceId: source.id, status: "DUPLICATE" } }),
      ]);

      const authorization = authorizeSource(source, now);
      const warningAt = source.agreementExpiresAt
        ? source.agreementExpiresAt.getTime() - AGREEMENT_WARNING_DAYS * 24 * 60 * 60 * 1000
        : null;

      return {
        key: source.key,
        name: source.name,
        status: source.status,
        syncEnabled: source.syncEnabled,
        canSync: authorization.allowed,
        refusal: authorization.allowed
          ? null
          : explainRefusal(authorization.reasonCode as IngestionRefusal),
        agreementExpiresAt: source.agreementExpiresAt?.toISOString() ?? null,
        agreementExpiringSoon: warningAt !== null && now.getTime() >= warningAt,
        lastSyncFinishedAt: source.lastSyncFinishedAt?.toISOString() ?? null,
        activePostings,
        duplicatePostings,
        recentRuns: source.runs.map((run) => ({
          startedAt: run.startedAt.toISOString(),
          outcome: run.outcome,
          reasonCode: run.reasonCode,
          recordsFetched: run.recordsFetched,
          recordsAdded: run.recordsAdded,
          recordsExpired: run.recordsExpired,
          parseFailures: run.parseFailures,
          notModified: run.notModified,
          durationMs: run.durationMs,
        })),
      };
    }),
  );
}
