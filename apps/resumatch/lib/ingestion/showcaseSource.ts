import "server-only";
import { getJobmatchDb } from "../db/client";
import { log } from "../observability/logger";
import { recordAuditEvent } from "../workspace";
import { runSync, type SyncResult } from "./run";
import {
  SHOWCASE_AGREEMENT_EXPIRES_AT,
  SHOWCASE_AGREEMENT_REFERENCE,
  SHOWCASE_ATTRIBUTION,
  SHOWCASE_FIELD_MAPPING,
  SHOWCASE_SOURCE_ENDPOINT,
  SHOWCASE_SOURCE_KEY,
  SHOWCASE_SOURCE_NAME,
  showcaseFeedBody,
} from "./showcaseFixture";

/**
 * Loading the synthetic showcase source (JM-004, issue #208).
 *
 * JobMatch does not scrape, and no rights-cleared external source is agreed
 * yet — so the public showcase would otherwise have no postings to exercise
 * the candidate journey against. This is Option C from #208: a
 * clearly-labelled, committed, deterministic fixture (see
 * `showcaseFixture.ts`) loaded through the *real* ingestion contract
 * (`runSync` → snapshot → normalize → deduplicate → age-out → record), not
 * a shortcut around it.
 *
 * Selecting or agreeing a real external source stays a separate,
 * non-engineering decision (JM-003 / JM-004).
 */

export {
  SHOWCASE_ATTRIBUTION,
  SHOWCASE_SOURCE_ENDPOINT,
  SHOWCASE_SOURCE_KEY,
  SHOWCASE_SOURCE_NAME,
  SHOWCASE_RECORD_COUNT,
  SHOWCASE_ACTIVE_COUNT,
  showcaseFeedBody,
} from "./showcaseFixture";

export interface ShowcaseStatus {
  /** The source row exists. */
  configured: boolean;
  /** A sync has finished at least once. */
  synced: boolean;
  /** Displayable (ACTIVE) postings from the source. */
  activePostings: number;
}

/** What the profile next-step panel and the empty states read to decide
 *  which of "not configured / not synced / no active postings" to show. */
export async function getShowcaseStatus(): Promise<ShowcaseStatus> {
  const db = getJobmatchDb();
  const source = await db.jobSource.findUnique({
    where: { key: SHOWCASE_SOURCE_KEY },
    select: { id: true, lastSyncFinishedAt: true },
  });
  if (!source) return { configured: false, synced: false, activePostings: 0 };

  const activePostings = await db.jobPosting.count({
    where: { sourceId: source.id, status: "ACTIVE" },
  });
  return {
    configured: true,
    synced: source.lastSyncFinishedAt !== null,
    activePostings,
  };
}

export interface LoadShowcaseOptions {
  /** Remove the source's postings, snapshots and runs before syncing, for a
   *  clean reload. The source row (and its agreement metadata) is kept. */
  reset?: boolean;
}

/**
 * Create-or-update the showcase source row and run one sync of the fixture
 * through the real ingestion pipeline. Idempotent: a second call re-syncs
 * the identical bytes, so every record matches on `externalId` and nothing
 * is added or changed.
 */
export async function loadShowcaseSource(options: LoadShowcaseOptions = {}): Promise<SyncResult> {
  const db = getJobmatchDb();

  const config = {
    name: SHOWCASE_SOURCE_NAME,
    kind: "JSON_FEED" as const,
    endpoint: SHOWCASE_SOURCE_ENDPOINT,
    status: "ACTIVE" as const,
    syncEnabled: true,
    agreementReference: SHOWCASE_AGREEMENT_REFERENCE,
    agreementExpiresAt: SHOWCASE_AGREEMENT_EXPIRES_AT,
    // Shown on every card and stated on the Sources page. Fabricated data
    // carries no commercial-reuse grant, and nothing about the demo should
    // imply otherwise.
    attributionText: SHOWCASE_ATTRIBUTION,
    commercialUse: false,
    fieldMapping: SHOWCASE_FIELD_MAPPING,
  };

  const source = await db.jobSource.upsert({
    where: { key: SHOWCASE_SOURCE_KEY },
    create: { key: SHOWCASE_SOURCE_KEY, snapshotRetentionDays: 30, ...config },
    update: config,
    select: { id: true },
  });

  if (options.reset) {
    await db.jobPosting.deleteMany({ where: { sourceId: source.id } });
    await db.jobSnapshot.deleteMany({ where: { sourceId: source.id } });
    await db.ingestionRun.deleteMany({ where: { sourceId: source.id } });
    await db.jobSource.update({
      where: { id: source.id },
      data: { lastSyncStartedAt: null, lastSyncFinishedAt: null, lastEtag: null, lastModified: null },
    });
  }

  const result = await runSync(source.id, undefined, showcaseFeedBody());

  log.info("ingestion.showcase.loaded", {
    outcome: result.outcome,
    reasonCode: result.reasonCode ?? undefined,
    count: result.recordsAdded,
  });
  await recordAuditEvent(null, "ingestion.showcase.loaded", {
    outcome: result.outcome,
    count: result.recordsAdded,
  });

  return result;
}
