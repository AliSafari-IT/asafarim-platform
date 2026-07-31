import { and, desc, eq, ne } from "drizzle-orm";
import type { Db } from "../db/client";
import { conversationReferences } from "../db/schema";
import type { Actor } from "../auth/actor";
import { assertCapability } from "./authz";
import { ensureConversation } from "./conversationThread";
import { generateId } from "../db/ids";
import { NotFoundError } from "../errors";
import {
  ReferenceUrlNotAllowedError,
  referenceFailureCodeOf,
  safeReferenceFailureMessage,
  type ReferenceFailureCode,
} from "../references/errors";
import { REFERENCE_LIMITS, type ReferenceAdapter, type ReferenceFact } from "../references/limits";
import { importReferencePayload } from "../references/importer";
import type { ReferenceFetchDeps } from "../references/fetchReference";
import {
  cacheExpiryFor,
  freshnessOfRow,
  isCacheUsable,
  type ReportedReferenceFreshness,
  type StoredReferenceFreshness,
} from "../references/provenance";
import { normalizeReferenceUrl } from "../references/urlPolicy";
import { withQuota } from "../quotas/enforce";
import { countReferenceFetchesTodayForApp, countReferencesForApp } from "../quotas/usage";
import { recordUsageEvent } from "../quotas/recordUsage";
import { recordOperationalEvent, withQuotaRejectionLogging } from "../observability/events";
import { isUrlImportsEnabled } from "../features/flags";
import { FeatureDisabledError } from "../features/errors";

/**
 * M13 slice F — the imported-public-reference lifecycle: authorization,
 * caching, quotas, provenance, and honest failure states. The network itself
 * lives in lib/references/* (URL policy, bounded fetch, adapters); this
 * module is what decides whether a fetch happens at all and what a caller is
 * told about the result.
 *
 * Three invariants:
 *
 * **A blocked URL is a security event, not just a 4xx.** Every rejected URL
 * (private address, internal name, non-HTTPS, bad port) records a
 * `reference.blocked` operational event with the coarse reason and host —
 * never the resolved address and never the full URL path. An operator needs
 * to see somebody probing 169.254.169.254; the response body must not tell
 * the prober which addresses exist.
 *
 * **One row per (app, URL), refreshed in place.** That is what makes this
 * the cache as well as the reference. A re-import inside the TTL performs no
 * outbound request at all and consumes no fetch quota.
 *
 * **A failed refresh never upgrades what the caller is told.** When a fetch
 * fails but an older copy exists, the old content is kept and returned
 * labelled `stale` (see lib/references/provenance.ts) together with the
 * failure — never silently as though the refresh had succeeded, and never
 * discarded so the user is left with nothing.
 */
export type ConversationReferenceRow = typeof conversationReferences.$inferSelect;

/** The public-safe projection of a reference row, with freshness derived at read time. */
export interface SafeReference {
  id: string;
  appId: string;
  conversationId: string;
  importedByPrincipalId: string;
  sourceUrl: string;
  finalUrl: string | null;
  host: string;
  adapter: ReferenceAdapter;
  adapterVersion: string;
  status: ConversationReferenceRow["status"];
  title: string | null;
  contentType: string | null;
  facts: ReferenceFact[];
  contentHash: string | null;
  originalChars: number | null;
  truncated: boolean;
  /** How much text is stored — the text itself is never returned to a client (it is model context, and it is remote content). */
  extractedChars: number;
  fetchedAt: Date | null;
  cacheExpiresAt: Date | null;
  cacheTtlSeconds: number;
  refreshCount: number;
  /** Derived, never stored — see lib/references/provenance.ts. */
  freshness: StoredReferenceFreshness;
  failureCode: ReferenceFailureCode | null;
  failureMessage: string | null;
  createdAt: Date;
  updatedAt: Date;
}

function toFreshnessInput(row: ConversationReferenceRow) {
  return {
    fetchedAt: row.fetchedAt,
    cacheExpiresAt: row.cacheExpiresAt,
    failureCode: row.failureCode,
    hasContent: (row.extractedText?.length ?? 0) > 0 || (row.facts?.length ?? 0) > 0,
  };
}

export function toSafeReference(row: ConversationReferenceRow, now: Date = new Date()): SafeReference {
  return {
    id: row.id,
    appId: row.appId,
    conversationId: row.conversationId,
    importedByPrincipalId: row.importedByPrincipalId,
    sourceUrl: row.sourceUrl,
    finalUrl: row.finalUrl,
    host: row.host,
    adapter: row.adapter,
    adapterVersion: row.adapterVersion,
    status: row.status,
    title: row.title,
    contentType: row.contentType,
    facts: (row.facts ?? []) as unknown as ReferenceFact[],
    contentHash: row.contentHash,
    originalChars: row.originalChars,
    truncated: row.truncated,
    extractedChars: row.extractedText?.length ?? 0,
    fetchedAt: row.fetchedAt,
    cacheExpiresAt: row.cacheExpiresAt,
    cacheTtlSeconds: REFERENCE_LIMITS.CACHE_TTL_SECONDS,
    refreshCount: row.refreshCount,
    freshness: freshnessOfRow(toFreshnessInput(row), now),
    failureCode: row.failureCode,
    failureMessage: row.failureMessage,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

export interface ImportReferenceInput {
  url: string;
  /** Forces an outbound fetch even when the cached copy is still inside its TTL. */
  refresh?: boolean;
  /** M13 slice G — trace label of the importing request, stamped on every event this import emits. */
  correlationId?: string | null;
}

export interface ImportReferenceResult {
  reference: SafeReference;
  /** True only when an outbound request actually happened in THIS call. */
  fetched: boolean;
  /**
   * `live` only for a fetch that just succeeded here. A cache hit is
   * `cached`; a failed refresh over older content is `stale`. Nothing else
   * may produce `live` — see lib/references/provenance.ts.
   */
  freshness: ReportedReferenceFreshness;
  /** Present when the fetch failed but an older copy was returned instead of an error. */
  failure: { code: ReferenceFailureCode; message: string } | null;
  /** True when a refresh produced byte-identical content (same content hash). */
  unchanged: boolean;
}

async function loadReferenceRow(db: Db, appId: string, referenceId: string): Promise<ConversationReferenceRow> {
  const [row] = await db
    .select()
    .from(conversationReferences)
    .where(and(eq(conversationReferences.id, referenceId), eq(conversationReferences.appId, appId)))
    .limit(1);
  if (!row) throw new NotFoundError("Reference", referenceId);
  return row;
}

async function loadReferenceByUrl(db: Db, appId: string, sourceUrl: string): Promise<ConversationReferenceRow | null> {
  const [row] = await db
    .select()
    .from(conversationReferences)
    .where(and(eq(conversationReferences.appId, appId), eq(conversationReferences.sourceUrl, sourceUrl)))
    .limit(1);
  return row ?? null;
}

/**
 * Imports (or refreshes) one public HTTPS reference for an app's
 * conversation.
 *
 * `deps` exists so tests can drive the whole path — cache hit, forced
 * refresh, blocked redirect, rebinding answer, oversize body, unsupported
 * type, rate limit, upstream failure — with an injected fetch/resolver
 * instead of real network access. Production callers pass nothing.
 */
export async function importConversationReference(
  db: Db,
  actor: Actor,
  appId: string,
  input: ImportReferenceInput,
  deps: ReferenceFetchDeps = {},
  now: Date = new Date(),
): Promise<ImportReferenceResult> {
  const { app } = await assertCapability(db, actor, appId, "app.importReference");

  // M13 slice G: the flag boundary for URL import. Placed here, before URL
  // normalization, because with the flag off there is no outbound request to
  // make and therefore nothing to validate — refusing the whole operation is
  // both simpler and stricter than refusing only the fetch. Everything below
  // this function (listing, provenance, context assembly) is untouched by the
  // flag, so references imported before it was switched off keep grounding
  // conversations and keep reporting their real freshness.
  if (!isUrlImportsEnabled()) {
    await recordOperationalEvent(db, {
      appId,
      correlationId: input.correlationId ?? null,
      category: "modification",
      kind: "reference.disabled_by_flag",
      severity: "info",
      actorPrincipalId: actor.principalId,
      detail: { host: safeHostOf(input.url), refresh: Boolean(input.refresh) },
    });
    throw new FeatureDisabledError("urlImports", "Importing a public URL is not available right now.");
  }

  let url: URL;
  try {
    url = normalizeReferenceUrl(input.url);
  } catch (err) {
    if (err instanceof ReferenceUrlNotAllowedError) {
      // Recorded on the plain `db` handle so the event survives regardless
      // of what the caller does with the throw — a blocked SSRF attempt is
      // exactly the kind of signal that must not vanish with a rollback.
      await recordOperationalEvent(db, {
        appId,
        correlationId: input.correlationId ?? null,
        category: "security",
        kind: "reference.blocked",
        severity: "warning",
        actorPrincipalId: actor.principalId,
        // Coarse reason + host only. Never the resolved address, and never
        // the path (see this module's docstring).
        detail: { reason: err.reason, host: safeHostOf(input.url) },
      });
    }
    throw err;
  }

  const sourceUrl = url.toString();
  const existing = await loadReferenceByUrl(db, appId, sourceUrl);

  if (existing && existing.status !== "deleted" && !input.refresh && isCacheUsable(toFreshnessInput(existing), now)) {
    return {
      reference: toSafeReference(existing, now),
      fetched: false,
      freshness: "cached",
      failure: null,
      unchanged: true,
    };
  }

  // Bound the outbound request BEFORE making it, and record the fetch in the
  // same transaction as the check that permitted it — so "fetches today" is
  // always re-derived from rows that only exist for requests that really
  // happened.
  await withQuotaRejectionLogging(db, { category: "quota", appId, actorPrincipalId: actor.principalId }, () =>
    db.transaction((tx) =>
      withQuota(
        tx,
        appId,
        "reference_fetches_per_day_per_app",
        () => countReferenceFetchesTodayForApp(tx, appId),
        () =>
          recordUsageEvent(tx, {
            appId,
            ownerPrincipalId: app.ownerPrincipalId,
            kind: "public_reference_fetch",
            metadata: { host: url.hostname, refresh: Boolean(input.refresh) },
          }),
      ),
    ),
  );

  let payload: Awaited<ReturnType<typeof importReferencePayload>>;
  try {
    payload = await importReferencePayload(sourceUrl, deps, now);
  } catch (err) {
    const code = referenceFailureCodeOf(err);
    const message = safeReferenceFailureMessage(err);

    await recordOperationalEvent(db, {
      appId,
      correlationId: input.correlationId ?? null,
      category: code === "url_not_allowed" ? "security" : "modification",
      kind: code === "rate_limited" ? "reference.rate_limited" : "reference.fetch_failed",
      severity: "warning",
      actorPrincipalId: actor.principalId,
      detail: { host: url.hostname, failureCode: code },
    });

    if (!existing || existing.status === "deleted") throw err;

    // An older copy exists: keep it, mark the failed attempt, and let the
    // caller present it as stale. Never re-label it as fresh, never drop it.
    const [updated] = await db
      .update(conversationReferences)
      .set({ failureCode: code, failureMessage: message, updatedAt: now })
      .where(eq(conversationReferences.id, existing.id))
      .returning();
    return {
      reference: toSafeReference(updated, now),
      fetched: false,
      freshness: freshnessOfRow(toFreshnessInput(updated), now),
      failure: { code, message },
      unchanged: true,
    };
  }

  const cacheExpiresAt = cacheExpiryFor(payload.fetchedAt);
  const content = {
    finalUrl: payload.finalUrl,
    host: payload.host,
    adapter: payload.adapter,
    adapterVersion: payload.adapterVersion,
    status: "ready" as const,
    title: payload.title,
    contentType: payload.contentType,
    extractedText: payload.text,
    facts: payload.facts as unknown as Record<string, unknown>[],
    contentHash: payload.contentHash,
    originalChars: payload.originalChars,
    truncated: payload.truncated,
    fetchedAt: payload.fetchedAt,
    cacheExpiresAt,
    // A successful fetch clears the previous failure — this is the only
    // place that may do so.
    failureCode: null,
    failureMessage: null,
    updatedAt: now,
  };

  if (existing) {
    const unchanged = existing.contentHash === payload.contentHash;
    const [updated] = await db
      .update(conversationReferences)
      .set({
        ...content,
        // A previously soft-deleted reference that is imported again comes
        // back as a fresh import rather than resurrecting its old counters.
        deletedAt: null,
        refreshCount: existing.status === "deleted" ? 0 : existing.refreshCount + 1,
      })
      .where(eq(conversationReferences.id, existing.id))
      .returning();
    await recordReferenceImported(db, actor, appId, updated, { refreshed: true, unchanged }, input.correlationId ?? null);
    return { reference: toSafeReference(updated, now), fetched: true, freshness: "live", failure: null, unchanged };
  }

  const inserted = await withQuotaRejectionLogging(
    db,
    { category: "quota", appId, actorPrincipalId: actor.principalId },
    () =>
      db.transaction(async (tx) => {
        const conversation = await ensureConversation(tx, appId, actor);
        return withQuota(
          tx,
          appId,
          "references_per_app",
          () => countReferencesForApp(tx, appId),
          async () => {
            const [row] = await tx
              .insert(conversationReferences)
              .values({
                id: generateId(),
                appId,
                conversationId: conversation.id,
                importedByPrincipalId: actor.principalId,
                sourceUrl,
                ...content,
              })
              .returning();
            return row;
          },
        );
      }),
  );

  await recordReferenceImported(db, actor, appId, inserted, { refreshed: false, unchanged: false }, input.correlationId ?? null);
  return { reference: toSafeReference(inserted, now), fetched: true, freshness: "live", failure: null, unchanged: false };
}

async function recordReferenceImported(
  db: Db,
  actor: Actor,
  appId: string,
  row: ConversationReferenceRow,
  flags: { refreshed: boolean; unchanged: boolean },
  correlationId: string | null,
): Promise<void> {
  await recordOperationalEvent(db, {
    appId,
    correlationId,
    category: "modification",
    kind: "reference.imported",
    actorPrincipalId: actor.principalId,
    // Host/adapter/size only — never the extracted content, which is remote
    // text and must not end up in an operational log.
    detail: {
      referenceId: row.id,
      host: row.host,
      adapter: `${row.adapter}@${row.adapterVersion}`,
      extractedChars: row.extractedText?.length ?? 0,
      refreshed: flags.refreshed,
      unchanged: flags.unchanged,
    },
  });
}

/** The host of a URL that failed validation, for the operational event — never throws, never returns a path or query. */
function safeHostOf(rawUrl: string): string {
  try {
    return new URL(rawUrl.trim()).hostname || "unknown";
  } catch {
    return "unparseable";
  }
}

/** Every non-deleted reference this app has imported, newest first. Viewer-readable: an imported reference is conversation context, like the messages that cite it. */
export async function listConversationReferencesForActor(
  db: Db,
  actor: Actor,
  appId: string,
  now: Date = new Date(),
): Promise<SafeReference[]> {
  await assertCapability(db, actor, appId, "app.viewReference");
  const rows = await db
    .select()
    .from(conversationReferences)
    .where(and(eq(conversationReferences.appId, appId), ne(conversationReferences.status, "deleted")))
    .orderBy(desc(conversationReferences.updatedAt));
  return rows.map((row) => toSafeReference(row, now));
}

export async function getReferenceForActor(
  db: Db,
  actor: Actor,
  appId: string,
  referenceId: string,
  now: Date = new Date(),
): Promise<SafeReference> {
  await assertCapability(db, actor, appId, "app.viewReference");
  return toSafeReference(await loadReferenceRow(db, appId, referenceId), now);
}

/**
 * Soft-deletes a reference (tombstone, same convention as attachments) and
 * clears its stored content, so removing a reference actually removes the
 * third-party text from this database rather than merely hiding it. Any
 * message that already cited it keeps its own text; the provenance row
 * survives for audit. Idempotent.
 */
export async function deleteConversationReference(
  db: Db,
  actor: Actor,
  appId: string,
  referenceId: string,
  now: Date = new Date(),
): Promise<SafeReference> {
  const access = await assertCapability(db, actor, appId, "app.importReference");
  const row = await loadReferenceRow(db, appId, referenceId);
  if (row.status === "deleted") return toSafeReference(row, now);
  if (row.importedByPrincipalId !== actor.principalId && access.role !== "owner") {
    throw new NotFoundError("Reference", referenceId);
  }

  const [deleted] = await db
    .update(conversationReferences)
    .set({
      status: "deleted",
      extractedText: null,
      facts: [],
      deletedAt: now,
      updatedAt: now,
    })
    .where(eq(conversationReferences.id, referenceId))
    .returning();
  return toSafeReference(deleted, now);
}

export interface ReferenceImportHealth {
  /** References with usable content still inside their cache TTL. */
  cached: number;
  /** References with usable content that is past its TTL or whose last refresh failed. */
  stale: number;
  /** References with no usable content at all. */
  unavailable: number;
  lastFetchedAt: Date | null;
  /** The failure code of the most recently attempted import, when it failed. */
  lastFailureCode: ReferenceFailureCode | null;
}

/**
 * Aggregates reference-import health for the M12 readiness snapshot. Reports
 * from rows only — it deliberately does NOT probe github.com or any other
 * host to decide whether importing "works": a readiness endpoint that makes
 * outbound requests is a readiness endpoint that can be used to make outbound
 * requests. If nothing has been imported, the caller reports `unknown` rather
 * than assuming healthy (M13: "Unconfigured dependencies must not report
 * healthy").
 */
export async function getReferenceImportHealth(db: Db, appId: string, now: Date = new Date()): Promise<ReferenceImportHealth> {
  const rows = await db
    .select()
    .from(conversationReferences)
    .where(and(eq(conversationReferences.appId, appId), ne(conversationReferences.status, "deleted")))
    .orderBy(desc(conversationReferences.updatedAt));

  const health: ReferenceImportHealth = {
    cached: 0,
    stale: 0,
    unavailable: 0,
    lastFetchedAt: null,
    lastFailureCode: rows[0]?.failureCode ?? null,
  };
  for (const row of rows) {
    const freshness = freshnessOfRow(toFreshnessInput(row), now);
    if (freshness === "cached") health.cached += 1;
    else if (freshness === "stale") health.stale += 1;
    else health.unavailable += 1;
    if (row.fetchedAt && (!health.lastFetchedAt || row.fetchedAt > health.lastFetchedAt)) {
      health.lastFetchedAt = row.fetchedAt;
    }
  }
  return health;
}

/**
 * M13 slice F — reference evidence for the modification pipeline's context
 * assembler, WITH the stored remote text.
 *
 * Deliberately separate from `listConversationReferencesForActor` (which
 * never returns text) and, like `listAttachmentEvidenceForMessages`, takes no
 * `Actor`: its only caller is the worker running as the job's own trusted
 * initiating actor, which already proved app access at enqueue time. Nothing
 * here may be wired to a route without adding a capability check.
 *
 * Rows whose last fetch failed are returned too, so the assembler can
 * DISCLOSE a stale or unavailable reference instead of quietly pretending
 * the user never imported it.
 */
export async function listReferenceEvidenceForConversation(
  db: Db,
  appId: string,
  conversationId: string,
  limit: number = REFERENCE_LIMITS.MAX_CONTEXT_REFERENCES,
): Promise<ConversationReferenceRow[]> {
  return db
    .select()
    .from(conversationReferences)
    .where(
      and(
        eq(conversationReferences.appId, appId),
        eq(conversationReferences.conversationId, conversationId),
        ne(conversationReferences.status, "deleted"),
      ),
    )
    .orderBy(desc(conversationReferences.updatedAt))
    .limit(limit);
}
