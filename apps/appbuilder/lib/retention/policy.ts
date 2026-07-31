/**
 * The retention/privacy policy catalogue — the durable, documented answer
 * to "what is retained, for how long, and how is it cleaned up" for every
 * category the issue calls out. `automatedCleanup: true` means
 * lib/retention/sweep.ts actually deletes eligible rows/objects (dry-run by
 * default; see runSweep.ts); `false` means eligibility is COMPUTED and
 * reported (see lib/retention/eligibility.ts) but deletion remains
 * operator-assisted — an explicit, documented scope decision, not an
 * oversight: several of these categories (conversation history, AI
 * diagnostics) are still actively useful to an app owner well past an
 * arbitrary TTL, and irreversibly auto-deleting them needs a product
 * decision this milestone does not make unilaterally.
 *
 * M13 slice G added `ownerErasable`. `automatedCleanup: false` used to be
 * the end of the story for a category, which left an owner with no way to
 * get rid of their own conversation content short of asking an operator.
 * A category marked `ownerErasable: true` is destroyed by
 * lib/retention/appData.ts#eraseAppData on the owner's explicit request,
 * independently of any TTL — the two mechanisms answer different questions
 * ("when does this expire" versus "how do I delete this now").
 *
 * See docs/appbuilder-m12-privacy-retention.md for the full policy document.
 */
export interface RetentionPolicy {
  category: string;
  /** null = retained indefinitely by design (not a gap). */
  retentionDays: number | null;
  description: string;
  automatedCleanup: boolean;
  /** M13 slice G — destroyed by an owner-initiated erasure request, regardless of TTL. */
  ownerErasable: boolean;
  accessibleTo: string;
}

export const RETENTION_POLICIES: readonly RetentionPolicy[] = [
  {
    category: "prompts",
    retentionDays: null,
    description:
      "The M05 creation-request prompt is product state (what the user asked for), not a log — retained for the app's lifetime and deleted only alongside the app via an explicit deletion request.",
    automatedCleanup: false,
    ownerErasable: false,
    accessibleTo:
      "App owner/editors (workspace); operators via data-subject-request fulfillment.",
  },
  {
    category: "conversation_messages",
    retentionDays: 180,
    description:
      "M08 conversation history remains useful context for an app's editors well past a short window. Eligibility (messages older than 180 days on an ARCHIVED app only) is computed and reported by the sweep; TTL-driven deletion stays operator-assisted. M13 slice G: an owner may erase message CONTENT at any time — the row survives as a tombstone (id, type, timestamps, version numbers) so the workspace still renders a coherent history.",
    automatedCleanup: false,
    ownerErasable: true,
    accessibleTo:
      "App owner/editors/viewers (workspace, read-only for viewers); operators.",
  },
  {
    category: "ai_job_diagnostics",
    retentionDays: 90,
    description:
      "Generation/modification/repair job `usage`/diagnostic JSON fields — useful for support/debugging, not indefinitely. Eligibility (terminal jobs older than 90 days) is computed and reported; TTL-driven deletion stays operator-assisted. M13 slice G: an owner erasure clears each modification job's stored request text and normalized request; the job's own bookkeeping (status, timings, token usage, safe context manifest) is retained, since none of it contains user content.",
    automatedCleanup: false,
    ownerErasable: true,
    accessibleTo: "App owner/editors (workspace); operators.",
  },
  {
    category: "validation_artifacts",
    retentionDays: 30,
    description:
      "Screenshots/traces from validation runs already carry a `retentionExpiresAt` set at creation (lib/validation's artifact writer). The sweep DELETES the underlying storage object and row past that date — the one category with real automated cleanup in M12.",
    automatedCleanup: true,
    ownerErasable: false,
    accessibleTo: "App owner/editors (workspace, until swept); operators.",
  },
  {
    category: "test_traces_and_screenshots",
    retentionDays: 30,
    description:
      "Playwright/e2e-style traces are a subset of validation_artifacts (kind: screenshot/trace) — same policy and same automated sweep as above.",
    automatedCleanup: true,
    ownerErasable: false,
    accessibleTo: "App owner/editors (workspace, until swept); operators.",
  },
  {
    category: "generated_data",
    retentionDays: null,
    description:
      "A generated app's own records/files/activity follow that app's lifecycle (active or archived), not an independent TTL — removed only via the app's own delete/reset paths or a deletion request.",
    automatedCleanup: false,
    ownerErasable: false,
    accessibleTo:
      "Generated-app members (runtime, per row-access rules); app owner/editors (builder); operators.",
  },
  {
    category: "archived_apps",
    retentionDays: null,
    description:
      "Archiving (app.archive) is reversible by design and does not delete anything — retained indefinitely until an explicit deletion request is fulfilled by an operator.",
    automatedCleanup: false,
    ownerErasable: false,
    accessibleTo: "App owner; operators via data-subject-request fulfillment.",
  },
  {
    category: "audit_records",
    retentionDays: null,
    description:
      "`audit_events` is an append-only compliance/forensic record — retained indefinitely, never a sweep target.",
    automatedCleanup: false,
    ownerErasable: false,
    accessibleTo: "App owner (workspace, read-only); operators.",
  },
  {
    category: "file_metadata_and_objects",
    retentionDays: null,
    description:
      "`generated_files` metadata + the underlying storage object follow the owning record/app's lifecycle — removed only via `archiveFile` or an app/deletion-request, never a background TTL sweep (a still-referenced file must never silently disappear).",
    automatedCleanup: false,
    ownerErasable: false,
    accessibleTo:
      "Generated-app members with read access to the owning record; app owner/editors; operators.",
  },
  {
    category: "usage_events",
    retentionDays: null,
    description:
      "The M12 billing-readiness ledger — retained indefinitely by design (see lib/quotas/recordUsage.ts).",
    automatedCleanup: false,
    ownerErasable: false,
    accessibleTo:
      "Operators only (not exposed in the workspace UI beyond the aggregated quota snapshot).",
  },
  {
    category: "public_reference_cache",
    retentionDays: null,
    description:
      "M13 slice F imported public references (conversation_references): provenance (source URL, final URL, adapter/version, fetch time) plus bounded extracted third-party text, retained with the conversation because the reference is what a past turn was grounded in. The CACHE window is separate and much shorter — 6 hours (REFERENCE_LIMITS.CACHE_TTL_SECONDS), after which the stored copy is reported as `stale` and reused only if a re-fetch fails. Removing a reference clears the stored remote text immediately and leaves a provenance tombstone; included in app deletion/export.",
    automatedCleanup: false,
    ownerErasable: true,
    accessibleTo:
      "App owner/editors (import/refresh/remove); viewers (provenance only, never the stored text); operators.",
  },
  {
    category: "conversation_attachments",
    retentionDays: null,
    description:
      "M13 slice B conversation attachments. Two very different windows apply. An UNCLAIMED upload (no message ever referenced it) is hard-deleted — row and storage object — 24 hours after it was initiated, by lib/retention/sweep.ts#sweepUnclaimedAttachments; that sweep is wired into the retention runner as of slice G, and its lag is reported by the `cleanupLag` readiness section. A CLAIMED attachment is retained with the conversation it grounds, because it is the evidence a past turn was interpreted against. Explicit deletion (by the uploader or the app owner) removes the storage object AND clears the extracted text, leaving a tombstone with filename, type, size, hash, and who deleted it. Included in app export as metadata plus extracted text; bytes are downloaded per-attachment.",
    automatedCleanup: true,
    ownerErasable: true,
    accessibleTo:
      "App owner/editors (upload/delete); viewers (metadata and content of claimed attachments); operators.",
  },
  {
    category: "conversation_memory",
    retentionDays: null,
    description:
      "M13 slice D structured conversation memory (`conversation_memories`) — bounded, evidence-linked facts, one row per conversation, rewritten in place rather than appended. Retained with the conversation. Facts whose source messages have ALL been deleted are removed automatically by lib/retention/sweep.ts#sweepOrphanedMemoryFacts (slice G): a fact is a derived copy of deleted content, so it must not outlive its evidence. A fact with any surviving source is kept, since it is still evidenced. An owner erasure clears every fact.",
    automatedCleanup: true,
    ownerErasable: true,
    accessibleTo:
      "Not directly exposed in the workspace — read only by the context assembler; visible to the app owner via data export; operators.",
  },
  {
    category: "operational_events",
    retentionDays: 365,
    description:
      "Observability/quota-rejection/backup-lifecycle events — kept for a year for trend analysis, then eligible for cleanup (not yet automated in M12).",
    automatedCleanup: false,
    ownerErasable: false,
    accessibleTo:
      "App owner/editors (readiness UI, most recent 10); operators (full history).",
  },
] as const;
