import "server-only";
import { createHash } from "node:crypto";
import { getJobmatchDb } from "../db/client";
import { log, logError } from "../observability/logger";
import { authorizeSource } from "./authorization";
import { chooseRepresentative, findDuplicate } from "./dedupe";
import { type FeedMapping, feedMappingSchema, parseFeed } from "./feedConnector";
import { assessFreshness, statusForFreshness } from "./freshness";
import { backoffMs, fetchFeed, isRetryable } from "./http";
import { NORMALIZER_VERSION } from "./normalize";

/**
 * One sync of one source, end to end (JM-026, JM-027, JM-031).
 *
 * The order is the point, and it is the same order the milestone's issues
 * are written in:
 *
 *   authorize → fetch → snapshot → normalize → deduplicate → age out → record
 *
 * Authorization comes first and no request is made if it refuses. The
 * snapshot is stored before anything is parsed, so a normalization bug can
 * be replayed against the exact bytes rather than needing a re-fetch the
 * agreement may not permit. Every run leaves an `IngestionRun` row whether it
 * succeeded, failed, or was refused, because a source that silently stops
 * syncing is the failure mode nobody notices.
 */

export const MAX_FETCH_ATTEMPTS = 3;

export interface SyncResult {
  runId: string;
  outcome: "SUCCEEDED" | "PARTIAL" | "FAILED" | "REFUSED";
  reasonCode: string | null;
  recordsFetched: number;
  recordsAdded: number;
  recordsUpdated: number;
  recordsExpired: number;
  duplicatesFound: number;
  parseFailures: number;
  notModified: boolean;
}

export async function runSync(sourceId: string, mappingInput?: unknown): Promise<SyncResult> {
  const db = getJobmatchDb();
  const startedAt = Date.now();

  const source = await db.jobSource.findUnique({ where: { id: sourceId } });
  if (!source) throw new Error("Unknown source");

  const run = await db.ingestionRun.create({
    data: { sourceId: source.id },
    select: { id: true },
  });

  const finish = async (result: Omit<SyncResult, "runId">): Promise<SyncResult> => {
    await db.ingestionRun.update({
      where: { id: run.id },
      data: {
        finishedAt: new Date(),
        durationMs: Date.now() - startedAt,
        outcome: result.outcome,
        reasonCode: result.reasonCode,
        recordsFetched: result.recordsFetched,
        recordsAdded: result.recordsAdded,
        recordsUpdated: result.recordsUpdated,
        recordsExpired: result.recordsExpired,
        duplicatesFound: result.duplicatesFound,
        parseFailures: result.parseFailures,
        notModified: result.notModified,
      },
    });
    log.info("ingestion.run.finished", {
      sourceKey: source.key,
      outcome: result.outcome,
      reasonCode: result.reasonCode ?? undefined,
      count: result.recordsFetched,
      durationMs: Date.now() - startedAt,
    });
    return { runId: run.id, ...result };
  };

  const empty = {
    recordsFetched: 0,
    recordsAdded: 0,
    recordsUpdated: 0,
    recordsExpired: 0,
    duplicatesFound: 0,
    parseFailures: 0,
    notModified: false,
  };

  // 1. Authorization, before any network access at all.
  const authorization = authorizeSource(source);
  if (!authorization.allowed) {
    return finish({ ...empty, outcome: "REFUSED", reasonCode: authorization.reasonCode });
  }

  // The mapping belongs to the source, not to the request. One mapping
  // handed to several sources reads fields from the wrong paths in every
  // feed but the one it was written for; a caller-supplied mapping is only
  // an override for a single named source.
  const mapping = parseMapping(mappingInput ?? source.fieldMapping);
  if (!mapping) {
    return finish({ ...empty, outcome: "FAILED", reasonCode: "INVALID_MAPPING" });
  }

  await db.jobSource.update({
    where: { id: source.id },
    data: { lastSyncStartedAt: new Date() },
  });

  // 2. Fetch, conditionally, with bounded retries.
  let body: string | null = null;
  let etag: string | null = null;
  let lastModified: string | null = null;
  let rateLimitedCount = 0;

  for (let attempt = 1; attempt <= MAX_FETCH_ATTEMPTS; attempt += 1) {
    const outcome = await fetchFeed(source.endpoint, {
      etag: source.lastEtag,
      lastModified: source.lastModified,
    });

    if (outcome.ok && "notModified" in outcome) {
      // 304 means the source confirmed nothing changed — which is a
      // confirmation that every posting is still there, so lastSeenAt must
      // advance. Without this, a well-behaved feed answering 304 for three
      // days had all of its jobs marked DISAPPEARED and expired: conditional
      // requests, the politeness agreements ask for, would have destroyed
      // the very data they were saving bandwidth on.
      await db.jobPosting.updateMany({
        where: { sourceId: source.id, status: { in: ["ACTIVE", "DUPLICATE"] } },
        data: { lastSeenAt: new Date() },
      });
      await db.jobSource.update({
        where: { id: source.id },
        data: { lastSyncFinishedAt: new Date() },
      });
      return finish({ ...empty, outcome: "SUCCEEDED", reasonCode: null, notModified: true });
    }

    if (outcome.ok) {
      body = outcome.body;
      etag = outcome.etag;
      lastModified = outcome.lastModified;
      break;
    }

    if (outcome.reasonCode === "RATE_LIMITED") rateLimitedCount += 1;
    if (!isRetryable(outcome.reasonCode) || attempt === MAX_FETCH_ATTEMPTS) {
      await db.ingestionRun.update({
        where: { id: run.id },
        data: { rateLimitedCount },
      });
      return finish({ ...empty, outcome: "FAILED", reasonCode: outcome.reasonCode });
    }
    await sleep(backoffMs(attempt, outcome.retryAfterSeconds));
  }

  if (body === null) {
    return finish({ ...empty, outcome: "FAILED", reasonCode: "NETWORK_ERROR" });
  }

  // 3. Snapshot the raw bytes BEFORE parsing them. If normalization is
  //    wrong, this is what makes a fix replayable.
  const contentHash = createHash("sha256").update(body).digest("hex");
  const retainUntil = new Date(Date.now() + source.snapshotRetentionDays * 24 * 60 * 60 * 1000);

  const snapshot = await db.jobSnapshot.upsert({
    where: { sourceId_contentHash: { sourceId: source.id, contentHash } },
    create: {
      sourceId: source.id,
      contentHash,
      payload: body,
      byteSize: Buffer.byteLength(body),
      retainUntil,
      normalizerVersion: NORMALIZER_VERSION,
    },
    // The payload is restored, not merely left alone. If this snapshot was
    // pruned and the identical bytes arrive again, extending retention
    // without putting the content back would leave new postings pointing at
    // a snapshot that cannot be replayed — which is the whole reason
    // snapshots exist.
    update: { payload: body, retainUntil, normalizerVersion: NORMALIZER_VERSION },
    select: { id: true },
  });

  // 4. Normalize.
  const parsed = parseFeed(body, mapping);
  if (!parsed.ok) {
    return finish({ ...empty, outcome: "FAILED", reasonCode: parsed.reasonCode });
  }

  const parseFailures = parsed.feed.failures.reduce((total, entry) => total + entry.count, 0);
  let recordsAdded = 0;
  let recordsUpdated = 0;
  let duplicatesFound = 0;
  const seenExternalIds: string[] = [];

  // 5. Store, deduplicating as we go.
  for (const posting of parsed.feed.postings) {
    seenExternalIds.push(posting.externalId);
    try {
      const existing = await db.jobPosting.findMany({
        where: {
          OR: [
            { sourceId: source.id, externalId: posting.externalId },
            { canonicalUrl: posting.canonicalUrl },
            { canonicalKey: posting.canonicalKey },
          ],
        },
        select: {
          id: true,
          sourceId: true,
          externalId: true,
          canonicalUrl: true,
          canonicalKey: true,
          publishedAt: true,
          firstSeenAt: true,
          contentHash: true,
          duplicateOfId: true,
          source: { select: { commercialUse: true, kind: true } },
        },
      });

      const verdict = findDuplicate(
        {
          sourceId: source.id,
          externalId: posting.externalId,
          canonicalUrl: posting.canonicalUrl,
          canonicalKey: posting.canonicalKey,
          publishedAt: posting.publishedAt,
          firstSeenAt: new Date(),
          commercialUse: source.commercialUse,
          isDirectEmployer: source.kind === "JSON_FEED",
        },
        existing.map((row) => ({
          id: row.id,
          sourceId: row.sourceId,
          externalId: row.externalId,
          canonicalUrl: row.canonicalUrl,
          canonicalKey: row.canonicalKey,
          publishedAt: row.publishedAt,
          firstSeenAt: row.firstSeenAt,
          commercialUse: row.source.commercialUse,
          isDirectEmployer: row.source.kind === "JSON_FEED",
        })),
      );

      if (verdict.reason === "SAME_SOURCE_ID") {
        const row = existing.find((entry) => entry.id === verdict.representativeId);
        // An unchanged re-fetch only advances lastSeenAt. Rewriting the row
        // would churn updatedAt and make "what changed" unanswerable.
        const changed = row?.contentHash !== posting.contentHash;
        await db.jobPosting.update({
          where: { id: verdict.representativeId },
          data: changed
            ? {
                ...toRow(posting),
                snapshotId: snapshot.id,
                lastSeenAt: new Date(),
                // A duplicate whose content changed is still a duplicate.
                // Resetting it to ACTIVE promoted the copy and put the same
                // job in front of a candidate twice — the exact thing
                // deduplication exists to stop.
                status: row?.duplicateOfId ? "DUPLICATE" : "ACTIVE",
              }
            : { lastSeenAt: new Date() },
        });
        if (changed) recordsUpdated += 1;
        continue;
      }

      // When an incoming copy outranks the one already stored, it takes over
      // as the representative. Without this, the first copy to arrive wins
      // permanently — so an employer's own posting stays hidden behind an
      // aggregator's simply because the aggregator synced first, and the
      // rights-based preference the whole ranking exists for never applies.
      const stored = existing.find((entry) => entry.id === verdict.representativeId);
      const incomingWins =
        verdict.isDuplicate &&
        stored !== undefined &&
        chooseRepresentative([
          {
            id: "__incoming__",
            sourceId: source.id,
            externalId: posting.externalId,
            canonicalUrl: posting.canonicalUrl,
            canonicalKey: posting.canonicalKey,
            publishedAt: posting.publishedAt,
            firstSeenAt: new Date(),
            commercialUse: source.commercialUse,
            isDirectEmployer: source.kind === "JSON_FEED",
          },
          {
            id: stored.id,
            sourceId: stored.sourceId,
            externalId: stored.externalId,
            canonicalUrl: stored.canonicalUrl,
            canonicalKey: stored.canonicalKey,
            publishedAt: stored.publishedAt,
            firstSeenAt: stored.firstSeenAt,
            commercialUse: stored.source.commercialUse,
            isDirectEmployer: stored.source.kind === "JSON_FEED",
          },
        ]).id === "__incoming__";

      const created = await db.jobPosting.create({
        data: {
          ...toRow(posting),
          sourceId: source.id,
          snapshotId: snapshot.id,
          externalId: posting.externalId,
          // A duplicate is stored and linked rather than dropped: the copy is
          // provenance, and only the representative is ever displayed.
          duplicateOfId:
            verdict.isDuplicate && !incomingWins ? (verdict.representativeId ?? null) : null,
          status: verdict.isDuplicate && !incomingWins ? "DUPLICATE" : "ACTIVE",
        },
        select: { id: true },
      });

      if (incomingWins && stored) {
        // Demote the previous representative and move its own duplicates
        // across, so the group keeps exactly one displayed member.
        await db.jobPosting.updateMany({
          where: { duplicateOfId: stored.id },
          data: { duplicateOfId: created.id },
        });
        await db.jobPosting.update({
          where: { id: stored.id },
          data: { status: "DUPLICATE", duplicateOfId: created.id },
        });
      }

      if (verdict.isDuplicate) duplicatesFound += 1;
      else recordsAdded += 1;
    } catch (error) {
      logError("ingestion.posting.failed", error, { sourceKey: source.key });
    }
  }

  // 6. Age out what the feed stopped listing.
  const recordsExpired = await expireMissing(source.id, seenExternalIds);

  await db.jobSource.update({
    where: { id: source.id },
    data: { lastSyncFinishedAt: new Date(), lastEtag: etag, lastModified },
  });

  return finish({
    outcome: parseFailures > 0 ? "PARTIAL" : "SUCCEEDED",
    reasonCode: null,
    recordsFetched: parsed.feed.recordsFetched,
    recordsAdded,
    recordsUpdated,
    recordsExpired,
    duplicatesFound,
    parseFailures,
    notModified: false,
  });
}

/**
 * Mark postings the feed no longer lists.
 *
 * Deliberately a status change rather than a delete: a candidate who saved a
 * job needs to see that it closed, not find it vanished. The record also
 * stays available to explain a past match.
 */
async function expireMissing(sourceId: string, seenExternalIds: string[]): Promise<number> {
  const db = getJobmatchDb();
  const result = await db.jobPosting.updateMany({
    where: {
      sourceId,
      status: "ACTIVE",
      externalId: { notIn: seenExternalIds.length > 0 ? seenExternalIds : ["__none__"] },
    },
    data: { status: "EXPIRED" },
  });
  return result.count;
}

/**
 * Re-assess freshness for every active posting.
 *
 * Runs independently of a sync, because the states that matter most —
 * expired by its own date, or silently gone from the feed — become true
 * with the passage of time rather than because a sync happened.
 */
export async function refreshPostingStates(now: Date = new Date()): Promise<number> {
  const db = getJobmatchDb();
  const postings = await db.jobPosting.findMany({
    where: { status: { in: ["ACTIVE", "EXPIRED"] } },
    select: {
      id: true,
      status: true,
      publishedAt: true,
      expiresAt: true,
      lastSeenAt: true,
      source: { select: { status: true, agreementExpiresAt: true } },
    },
    take: 5000,
  });

  let changed = 0;
  for (const posting of postings) {
    const next = statusForFreshness(
      assessFreshness(
        {
          publishedAt: posting.publishedAt,
          expiresAt: posting.expiresAt,
          lastSeenAt: posting.lastSeenAt,
          // An expired agreement ends display rights just as surely as a
          // terminated source does, and nothing flips the status when a date
          // passes — so checking the status alone left postings visible for
          // days after the right to show them lapsed.
          sourceTerminated:
            posting.source.status === "TERMINATED" ||
            (posting.source.agreementExpiresAt !== null &&
              posting.source.agreementExpiresAt.getTime() <= now.getTime()),
        },
        now,
      ),
    );
    if (next === posting.status) continue;
    await db.jobPosting.update({ where: { id: posting.id }, data: { status: next } });
    changed += 1;
  }
  return changed;
}

/**
 * Delete raw payloads past their retention window.
 *
 * The snapshot row survives with its hash and size, so provenance and the
 * "have we seen these exact bytes" check keep working; only the payload,
 * which is the source's copyrighted content, is dropped.
 */
export async function pruneSnapshots(now: Date = new Date()): Promise<number> {
  const db = getJobmatchDb();
  const result = await db.jobSnapshot.updateMany({
    where: { retainUntil: { lte: now }, payload: { not: null } },
    data: { payload: null },
  });
  return result.count;
}

function toRow(posting: {
  canonicalUrl: string;
  title: string;
  employer: string;
  employerKey: string;
  description: string;
  language: string | null;
  locationRaw: string | null;
  isRemote: boolean | null;
  contractType: string | null;
  salaryMin: number | null;
  salaryMax: number | null;
  salaryCurrency: string | null;
  salaryPeriod: string | null;
  skillsRaw: string[];
  requiresSponsorship: boolean | null;
  languageRequired: string[];
  requiredCertifications: string[];
  publishedAt: Date | null;
  expiresAt: Date | null;
  sourceUpdatedAt: Date | null;
  contentHash: string;
  canonicalKey: string;
  normalizerVersion: string;
}) {
  return {
    canonicalUrl: posting.canonicalUrl,
    title: posting.title,
    employer: posting.employer,
    employerKey: posting.employerKey,
    description: posting.description,
    language: posting.language,
    locationRaw: posting.locationRaw,
    isRemote: posting.isRemote,
    contractType: posting.contractType,
    salaryMin: posting.salaryMin,
    salaryMax: posting.salaryMax,
    salaryCurrency: posting.salaryCurrency,
    salaryPeriod: posting.salaryPeriod,
    skillsRaw: posting.skillsRaw,
    requiresSponsorship: posting.requiresSponsorship,
    languageRequired: posting.languageRequired,
    requiredCertifications: posting.requiredCertifications,
    publishedAt: posting.publishedAt,
    expiresAt: posting.expiresAt,
    sourceUpdatedAt: posting.sourceUpdatedAt,
    contentHash: posting.contentHash,
    canonicalKey: posting.canonicalKey,
    normalizerVersion: posting.normalizerVersion,
  };
}

function parseMapping(input: unknown): FeedMapping | null {
  const parsed = feedMappingSchema.safeParse(input);
  return parsed.success ? parsed.data : null;
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
