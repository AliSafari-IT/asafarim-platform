/**
 * M12 retention/privacy policy catalogue — the durable, documented answer
 * to "what is retained, for how long, and how is it cleaned up" for every
 * category the issue calls out. `automatedCleanup: true` means
 * lib/retention/sweep.ts actually deletes eligible rows/objects (dry-run by
 * default; see runSweep.ts); `false` means eligibility is COMPUTED and
 * reported (see lib/retention/eligibility.ts) but deletion remains
 * operator-assisted for M12 — an explicit, documented scope decision, not
 * an oversight: several of these categories (conversation history, AI
 * diagnostics) are still actively useful to an app owner well past an
 * arbitrary TTL, and irreversibly auto-deleting them needs a product
 * decision this milestone does not make unilaterally. See
 * docs/appbuilder-m12-privacy-retention.md for the full policy document.
 */
export interface RetentionPolicy {
  category: string;
  /** null = retained indefinitely by design (not a gap). */
  retentionDays: number | null;
  description: string;
  automatedCleanup: boolean;
  accessibleTo: string;
}

export const RETENTION_POLICIES: readonly RetentionPolicy[] = [
  {
    category: "prompts",
    retentionDays: null,
    description:
      "The M05 creation-request prompt is product state (what the user asked for), not a log — retained for the app's lifetime and deleted only alongside the app via an explicit deletion request.",
    automatedCleanup: false,
    accessibleTo:
      "App owner/editors (workspace); operators via data-subject-request fulfillment.",
  },
  {
    category: "conversation_messages",
    retentionDays: 180,
    description:
      "M08 conversation history remains useful context for an app's editors well past a short window. Eligibility (messages older than 180 days on an ARCHIVED app only) is computed and reported by the sweep; deletion is operator-assisted for M12, not automatic.",
    automatedCleanup: false,
    accessibleTo:
      "App owner/editors/viewers (workspace, read-only for viewers); operators.",
  },
  {
    category: "ai_job_diagnostics",
    retentionDays: 90,
    description:
      "Generation/modification/repair job `usage`/diagnostic JSON fields — useful for support/debugging, not indefinitely. Eligibility (terminal jobs older than 90 days) is computed and reported; deletion is operator-assisted for M12.",
    automatedCleanup: false,
    accessibleTo: "App owner/editors (workspace); operators.",
  },
  {
    category: "validation_artifacts",
    retentionDays: 30,
    description:
      "Screenshots/traces from validation runs already carry a `retentionExpiresAt` set at creation (lib/validation's artifact writer). The sweep DELETES the underlying storage object and row past that date — the one category with real automated cleanup in M12.",
    automatedCleanup: true,
    accessibleTo: "App owner/editors (workspace, until swept); operators.",
  },
  {
    category: "test_traces_and_screenshots",
    retentionDays: 30,
    description:
      "Playwright/e2e-style traces are a subset of validation_artifacts (kind: screenshot/trace) — same policy and same automated sweep as above.",
    automatedCleanup: true,
    accessibleTo: "App owner/editors (workspace, until swept); operators.",
  },
  {
    category: "generated_data",
    retentionDays: null,
    description:
      "A generated app's own records/files/activity follow that app's lifecycle (active or archived), not an independent TTL — removed only via the app's own delete/reset paths or a deletion request.",
    automatedCleanup: false,
    accessibleTo:
      "Generated-app members (runtime, per row-access rules); app owner/editors (builder); operators.",
  },
  {
    category: "archived_apps",
    retentionDays: null,
    description:
      "Archiving (app.archive) is reversible by design and does not delete anything — retained indefinitely until an explicit deletion request is fulfilled by an operator.",
    automatedCleanup: false,
    accessibleTo: "App owner; operators via data-subject-request fulfillment.",
  },
  {
    category: "audit_records",
    retentionDays: null,
    description:
      "`audit_events` is an append-only compliance/forensic record — retained indefinitely, never a sweep target.",
    automatedCleanup: false,
    accessibleTo: "App owner (workspace, read-only); operators.",
  },
  {
    category: "file_metadata_and_objects",
    retentionDays: null,
    description:
      "`generated_files` metadata + the underlying storage object follow the owning record/app's lifecycle — removed only via `archiveFile` or an app/deletion-request, never a background TTL sweep (a still-referenced file must never silently disappear).",
    automatedCleanup: false,
    accessibleTo:
      "Generated-app members with read access to the owning record; app owner/editors; operators.",
  },
  {
    category: "usage_events",
    retentionDays: null,
    description:
      "The M12 billing-readiness ledger — retained indefinitely by design (see lib/quotas/recordUsage.ts).",
    automatedCleanup: false,
    accessibleTo:
      "Operators only (not exposed in the workspace UI beyond the aggregated quota snapshot).",
  },
  {
    category: "operational_events",
    retentionDays: 365,
    description:
      "Observability/quota-rejection/backup-lifecycle events — kept for a year for trend analysis, then eligible for cleanup (not yet automated in M12).",
    automatedCleanup: false,
    accessibleTo:
      "App owner/editors (readiness UI, most recent 10); operators (full history).",
  },
] as const;
