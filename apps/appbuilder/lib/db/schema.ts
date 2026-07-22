import {
  pgTable,
  text,
  jsonb,
  timestamp,
  integer,
  boolean,
  pgEnum,
  uniqueIndex,
  index,
  type AnyPgColumn,
} from "drizzle-orm/pg-core";
import { relations } from "drizzle-orm";

// AppBuilder owns this database exclusively (APPBUILDER_DATABASE_URL). SSO
// user identities are never foreign-keyed here — every "*PrincipalId" column
// is an opaque external reference to a platform (packages/db) user id, kept
// as plain text so this database has zero cross-database dependency.

export const appStatusEnum = pgEnum("app_status", ["active", "archived"]);

export const collaboratorRoleEnum = pgEnum("collaborator_role", [
  "owner",
  "editor",
  "viewer",
]);

export const collaboratorStatusEnum = pgEnum("collaborator_status", [
  "active",
  "revoked",
]);

export const specificationStatusEnum = pgEnum("specification_status", [
  "draft",
  "published",
  "archived",
]);

export const operationStatusEnum = pgEnum("operation_status", [
  "applied",
  "rejected",
]);

export const previewBuildStatusEnum = pgEnum("preview_build_status", [
  "queued",
  "running",
  "succeeded",
  "failed",
]);

export const releaseStatusEnum = pgEnum("release_status", [
  "draft",
  "published",
  "archived",
]);

export const deploymentEnvironmentEnum = pgEnum("deployment_environment", [
  "preview",
  "production",
]);

export const deploymentStatusEnum = pgEnum("deployment_status", [
  "pending",
  "succeeded",
  "failed",
]);

export const idempotencyStatusEnum = pgEnum("idempotency_status", [
  "in_progress",
  "completed",
  "failed",
]);

// M05: the constrained set of starting points a prompt-first creation flow
// may choose from. Intentionally small — M07 (AI interpretation) and M06
// (registered templates) expand what a starter family actually produces;
// M05 only records the user's choice.
export const starterFamilyEnum = pgEnum("starter_family", [
  "blank",
  "task_management",
  "crm",
  "inventory",
  "booking",
]);

// M05: the visibility the owner picks at creation time. This only records
// intent — it does not yet drive any enforcement beyond the existing
// owner/collaborator capability model (M03). "team" apps still require
// collaborators to be added explicitly; there is no org-wide discovery.
export const appVisibilityEnum = pgEnum("app_visibility", ["private", "team"]);

// M07: the AI generation job's own lifecycle. `needs_clarification` and
// `queued`/`analyzing`/`planning`/`applying`/`validating`/`preparing_preview`
// are all non-terminal; `ready`/`failed`/`cancelled` are terminal. Legal
// transitions between these are enforced centrally in
// lib/generation/stateMachine.ts, never by ad-hoc status writes — this enum
// only constrains *which strings* are possible, not which transitions are.
export const generationJobStatusEnum = pgEnum("generation_job_status", [
  "queued",
  "analyzing",
  "needs_clarification",
  "planning",
  "applying",
  "validating",
  "preparing_preview",
  "ready",
  "failed",
  "cancelled",
]);

// Safe, stable failure classification — surfaced to users via
// lib/generation/errors.ts#safeFailureMessage, never a raw stack trace or
// provider error string. "clarification required" is intentionally absent
// here: it is a normal status (`needs_clarification`), not a failure.
export const generationJobFailureCodeEnum = pgEnum("generation_job_failure_code", [
  "invalid_request",
  "provider_configuration_error",
  "provider_rate_limit",
  "provider_unavailable",
  "malformed_provider_response",
  "forbidden_operation",
  "specification_validation_failed",
  "stale_base_version",
  "authorization_lost",
  "preview_failed",
  "worker_infrastructure_error",
  "cancelled",
]);

export const generationBatchStatusEnum = pgEnum("generation_batch_status", ["applied", "rejected"]);

// M08: a conversation message's author role — mirrors the shape a chat UI
// needs (user/assistant/system) without conflating it with `messageType`
// below, which is *what kind of content* the message carries regardless of
// who "spoke" it (e.g. the assistant role produces both `ai_proposal` and
// `failure` messageTypes).
export const conversationRoleEnum = pgEnum("conversation_role", [
  "user",
  "assistant",
  "system",
]);

// M08: what a persisted conversation message actually represents, so the
// workspace UI can render each kind distinctly (issue requirement: "clearly
// distinguish user request, AI proposal, system status, validation result,
// applied change, and failure"). Intermediate per-tick job status is
// deliberately NOT persisted as a message on every poll — only these
// meaningful milestones are, so the conversation log stays a readable
// history rather than a spam of transient status ticks.
export const conversationMessageTypeEnum = pgEnum("conversation_message_type", [
  "user_request",
  "ai_proposal",
  "system_status",
  "validation_result",
  "applied_change",
  "failure",
]);

export const conversationConfirmationStateEnum = pgEnum("conversation_confirmation_state", [
  "not_required",
  "pending",
  "confirmed",
  "expired",
]);

// M08: the conversational modification job's own lifecycle — deliberately a
// SEPARATE enum/state machine from generation_job_status (see
// lib/modification/stateMachine.ts), even though both are AI-driven and
// both apply through M04. A modification job interprets a single bounded
// follow-up request against an EXISTING app (no template selection, no
// multi-iteration operation budget loop) and may pause partway through for
// human destructive-change confirmation, which generation jobs never do
// (they always apply with confirmDestructive:false and simply reject/skip
// destructive proposals instead of pausing for a human).
export const modificationJobStatusEnum = pgEnum("modification_job_status", [
  "queued",
  "interpreting",
  "proposing",
  "awaiting_confirmation",
  "applying",
  "validating",
  "preparing_preview",
  "ready",
  "failed",
  "cancelled",
]);

export const modificationJobFailureCodeEnum = pgEnum("modification_job_failure_code", [
  "invalid_request",
  "provider_configuration_error",
  "provider_rate_limit",
  "provider_unavailable",
  "malformed_provider_response",
  "forbidden_operation",
  "specification_validation_failed",
  "stale_base_version",
  "authorization_lost",
  "preview_failed",
  "confirmation_expired",
  "confirmation_invalid",
  "worker_infrastructure_error",
  "cancelled",
]);

export const modificationBatchStatusEnum = pgEnum("modification_batch_status", [
  "proposed",
  "awaiting_confirmation",
  "applied",
  "rejected",
]);

// The generated-application registry. Every other app-owned table hangs off
// `appId` (directly or, for specificationVersions, denormalized) so a
// repository can never answer a query without an app-scoping predicate.
export const apps = pgTable(
  "apps",
  {
    id: text("id").primaryKey(),
    // External ASafarIM SSO user id of the app's owner. Opaque reference —
    // no FK to the platform's Prisma `users` table.
    ownerPrincipalId: text("owner_principal_id").notNull(),
    name: text("name").notNull(),
    slug: text("slug").notNull(),
    // Short, denormalized catalog description — distinct from the initial
    // creation prompt (see creationRequests below), which is the raw intent
    // persisted for M07. This is a display-only summary, bounded and
    // sanitized at the application layer, never raw HTML.
    description: text("description"),
    status: appStatusEnum("status").notNull().default("active"),
    visibility: appVisibilityEnum("visibility").notNull().default("private"),
    // Archival over destructive deletion — an archived app's history stays
    // intact for audit purposes.
    archivedAt: timestamp("archived_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    uniqueIndex("apps_slug_unique").on(table.slug),
    index("apps_owner_principal_id_idx").on(table.ownerPrincipalId),
    // Catalog listing filters by status and sorts by updatedAt/createdAt/name
    // for every request (M05) — index each to keep pagination cheap as the
    // registry grows.
    index("apps_status_idx").on(table.status),
    index("apps_updated_at_idx").on(table.updatedAt),
    index("apps_created_at_idx").on(table.createdAt),
    index("apps_name_idx").on(table.name),
  ],
);

// Collaborators grant additional principals access to an app beyond its
// owner. The owner itself is not required to have a row here — ownership is
// authoritative on `apps.ownerPrincipalId`.
export const collaborators = pgTable(
  "collaborators",
  {
    id: text("id").primaryKey(),
    appId: text("app_id")
      .notNull()
      .references(() => apps.id, { onDelete: "cascade" }),
    principalId: text("principal_id").notNull(),
    role: collaboratorRoleEnum("role").notNull().default("viewer"),
    status: collaboratorStatusEnum("status").notNull().default("active"),
    invitedByPrincipalId: text("invited_by_principal_id").notNull(),
    revokedAt: timestamp("revoked_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    uniqueIndex("collaborators_app_principal_unique").on(table.appId, table.principalId),
    index("collaborators_app_id_idx").on(table.appId),
    index("collaborators_principal_id_idx").on(table.principalId),
  ],
);

// The mutable "current specification" container for an app. Exactly one row
// per app; the actual versioned contract lives in `specificationVersions`.
// Kept schema-conservative here — M04 formalizes the specification format
// inside the `payload` JSONB of each version.
export const specifications = pgTable(
  "specifications",
  {
    id: text("id").primaryKey(),
    appId: text("app_id")
      .notNull()
      .references(() => apps.id, { onDelete: "cascade" }),
    status: specificationStatusEnum("status").notNull().default("draft"),
    // Denormalized pointer to the latest immutable version, kept in sync by
    // the repository layer inside the same transaction that inserts it.
    currentVersionNumber: integer("current_version_number").notNull().default(0),
    // M06: the app's pinned, authoritative preview — set only after a
    // preview build *succeeds* (lib/repositories/previewService.ts), never
    // pointed at a queued/running/failed build. A failed rebuild attempt
    // never moves or clears this, so the last successful preview always
    // keeps rendering at /apps/{appId}/preview until a *new* build succeeds.
    // The browser can never supply this directly — it is resolved
    // server-side from this column alone.
    pinnedPreviewBuildId: text("pinned_preview_build_id").references(
      (): AnyPgColumn => previewBuilds.id,
      { onDelete: "set null" },
    ),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    uniqueIndex("specifications_app_id_unique").on(table.appId),
  ],
);

// Immutable specification versions. Never updated or deleted once inserted —
// "editing a spec" appends a new version (see appliedOperations).
export const specificationVersions = pgTable(
  "specification_versions",
  {
    id: text("id").primaryKey(),
    specificationId: text("specification_id")
      .notNull()
      .references(() => specifications.id, { onDelete: "cascade" }),
    // Denormalized so repositories can scope directly by appId without a
    // join through specifications.
    appId: text("app_id")
      .notNull()
      .references(() => apps.id, { onDelete: "cascade" }),
    versionNumber: integer("version_number").notNull(),
    // Self-reference to the version this one was built from — null only
    // for the very first version of a specification. Never a join
    // requirement (versionNumber - 1 also identifies it), but explicit
    // provenance is cheaper to read than to reconstruct.
    parentVersionId: text("parent_version_id"),
    // The @asafarim/appbuilder-schema SPEC_SCHEMA_VERSION the payload was
    // written against, and the ENGINE_VERSION that produced it — both
    // needed to reproduce this row's checksum exactly (see
    // docs/appbuilder-schema.md#checksums).
    schemaVersion: text("schema_version").notNull(),
    engineVersion: text("engine_version").notNull(),
    // Human-readable one-line provenance, e.g. "Applied CREATE_ENTITY: Task"
    // or "Restored version 3". Detailed provenance (which operation, by
    // whom) lives on the linked appliedOperations row.
    summary: text("summary").notNull().default(""),
    // The full ApplicationSpecification payload (@asafarim/appbuilder-schema).
    payload: jsonb("payload").$type<Record<string, unknown>>().notNull(),
    checksum: text("checksum").notNull(),
    createdByPrincipalId: text("created_by_principal_id").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    uniqueIndex("specification_versions_spec_version_unique").on(
      table.specificationId,
      table.versionNumber,
    ),
    index("specification_versions_app_id_idx").on(table.appId),
  ],
);

// A record of every operation proposed against a specification and its
// outcome. `idempotencyKey` is required so retried client requests (network
// retry, double submit) never double-apply an operation.
export const appliedOperations = pgTable(
  "applied_operations",
  {
    id: text("id").primaryKey(),
    appId: text("app_id")
      .notNull()
      .references(() => apps.id, { onDelete: "cascade" }),
    specificationId: text("specification_id")
      .notNull()
      .references(() => specifications.id, { onDelete: "cascade" }),
    // Null when the operation was rejected before producing a new version.
    resultingVersionId: text("resulting_version_id").references(
      () => specificationVersions.id,
      { onDelete: "set null" },
    ),
    operationType: text("operation_type").notNull(),
    payload: jsonb("payload").$type<Record<string, unknown>>().notNull(),
    status: operationStatusEnum("status").notNull(),
    rejectionReason: text("rejection_reason"),
    appliedByPrincipalId: text("applied_by_principal_id").notNull(),
    idempotencyKey: text("idempotency_key").notNull(),
    // sha256 of the operation payload actually submitted — lets a retried
    // request with the SAME idempotencyKey but a DIFFERENT payload be
    // rejected as a conflict instead of silently replaying a stale result.
    requestHash: text("request_hash").notNull(),
    // The base version the operation was applied against — the optimistic-
    // concurrency contract's audit trail (see lib/repositories/operations.ts).
    baseVersionNumber: integer("base_version_number").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    uniqueIndex("applied_operations_app_idempotency_unique").on(
      table.appId,
      table.idempotencyKey,
    ),
    index("applied_operations_app_id_idx").on(table.appId),
  ],
);

// Preview builds triggered from a specific specification version, rendered
// by @asafarim/appbuilder-runtime's metadata-driven renderer (M06). Pinned
// to an immutable (specificationVersionId, checksum, registryVersion)
// triple so a build is always reproducible against the exact inputs that
// produced it — never re-derived from the app's *current* state.
export const previewBuilds = pgTable(
  "preview_builds",
  {
    id: text("id").primaryKey(),
    appId: text("app_id")
      .notNull()
      .references(() => apps.id, { onDelete: "cascade" }),
    specificationVersionId: text("specification_version_id")
      .notNull()
      .references(() => specificationVersions.id, { onDelete: "cascade" }),
    // The specification version's own checksum (@asafarim/appbuilder-schema
    // checksumOf), copied at build time — lets a build be verified against
    // its source version without a join, and lets a future re-check detect
    // if a version row was somehow altered (it never legitimately is).
    checksum: text("checksum"),
    // @asafarim/appbuilder-runtime's REGISTRY_VERSION at build time. A
    // registry upgrade that changes rendering behavior gets a new build
    // rather than silently reinterpreting an old one under a new registry.
    registryVersion: text("registry_version"),
    status: previewBuildStatusEnum("status").notNull().default("queued"),
    requestedByPrincipalId: text("requested_by_principal_id").notNull(),
    startedAt: timestamp("started_at", { withTimezone: true }),
    completedAt: timestamp("completed_at", { withTimezone: true }),
    errorMessage: text("error_message"),
    // Structured RenderError[]/ValidationIssue[] — never a raw stack trace
    // or database detail. Rendered as an actionable, builder-facing
    // diagnostic; never shown to a generated-app viewer.
    diagnostics: jsonb("diagnostics").$type<Record<string, unknown>[]>(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index("preview_builds_app_id_idx").on(table.appId),
    // Idempotent preview creation: the same specification version rendered
    // against the same registry version is a pure, deterministic
    // computation — a repeated request reuses this row instead of
    // inserting a duplicate.
    uniqueIndex("preview_builds_version_registry_unique").on(
      table.specificationVersionId,
      table.registryVersion,
    ),
  ],
);

// An immutable, publishable snapshot of a specification version. Publishing
// never mutates the underlying specificationVersion.
export const releases = pgTable(
  "releases",
  {
    id: text("id").primaryKey(),
    appId: text("app_id")
      .notNull()
      .references(() => apps.id, { onDelete: "cascade" }),
    specificationVersionId: text("specification_version_id")
      .notNull()
      .references(() => specificationVersions.id, { onDelete: "restrict" }),
    versionLabel: text("version_label").notNull(),
    status: releaseStatusEnum("status").notNull().default("draft"),
    publishedByPrincipalId: text("published_by_principal_id"),
    publishedAt: timestamp("published_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    uniqueIndex("releases_app_version_label_unique").on(table.appId, table.versionLabel),
    index("releases_app_id_idx").on(table.appId),
  ],
);

// Deployment of a release to an environment. Production generated-app
// deployment (running the release for end users) is out of scope for M02;
// this table only records the deployment lifecycle.
export const deployments = pgTable(
  "deployments",
  {
    id: text("id").primaryKey(),
    appId: text("app_id")
      .notNull()
      .references(() => apps.id, { onDelete: "cascade" }),
    releaseId: text("release_id")
      .notNull()
      .references(() => releases.id, { onDelete: "cascade" }),
    environment: deploymentEnvironmentEnum("environment").notNull(),
    status: deploymentStatusEnum("status").notNull().default("pending"),
    deployedByPrincipalId: text("deployed_by_principal_id").notNull(),
    deployedAt: timestamp("deployed_at", { withTimezone: true }),
    errorMessage: text("error_message"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [index("deployments_app_id_idx").on(table.appId)],
);

// Append-only audit trail. Never updated or deleted; archival, not erasure,
// is the only lifecycle transition for the rows this references.
export const auditEvents = pgTable(
  "audit_events",
  {
    id: text("id").primaryKey(),
    appId: text("app_id")
      .notNull()
      .references(() => apps.id, { onDelete: "cascade" }),
    actorPrincipalId: text("actor_principal_id").notNull(),
    action: text("action").notNull(),
    targetType: text("target_type").notNull(),
    targetId: text("target_id").notNull(),
    metadata: jsonb("metadata").$type<Record<string, unknown>>().default({}),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [index("audit_events_app_id_idx").on(table.appId)],
);

// Generic idempotency ledger for retryable creation/mutation endpoints that
// don't already have a domain-specific idempotency column (unlike
// appliedOperations, which embeds its own). `scope` namespaces the key per
// operation kind (e.g. "create-app", "invite-collaborator").
export const idempotencyKeys = pgTable(
  "idempotency_keys",
  {
    id: text("id").primaryKey(),
    // Nullable: app-creation itself happens before an appId exists.
    appId: text("app_id").references(() => apps.id, { onDelete: "cascade" }),
    ownerPrincipalId: text("owner_principal_id").notNull(),
    scope: text("scope").notNull(),
    key: text("key").notNull(),
    requestHash: text("request_hash").notNull(),
    status: idempotencyStatusEnum("status").notNull().default("in_progress"),
    responseSnapshot: jsonb("response_snapshot").$type<Record<string, unknown>>(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    uniqueIndex("idempotency_keys_owner_scope_key_unique").on(
      table.ownerPrincipalId,
      table.scope,
      table.key,
    ),
    index("idempotency_keys_app_id_idx").on(table.appId),
  ],
);

// M05: the persisted record of what the user asked for at creation time —
// their free-text prompt and chosen starter family. This is product state
// (an input M07's AI interpretation will read later), not an audit log
// entry, so it gets its own table rather than being folded into
// auditEvents metadata. One row per app, written once, in the same
// transaction as the app itself; never mutated afterward.
export const creationRequests = pgTable(
  "creation_requests",
  {
    id: text("id").primaryKey(),
    appId: text("app_id")
      .notNull()
      .references(() => apps.id, { onDelete: "cascade" }),
    requestedByPrincipalId: text("requested_by_principal_id").notNull(),
    prompt: text("prompt").notNull(),
    starterFamily: starterFamilyEnum("starter_family").notNull(),
    visibility: appVisibilityEnum("visibility").notNull().default("private"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [uniqueIndex("creation_requests_app_id_unique").on(table.appId)],
);

// M07: one durable row per AI generation attempt. `initiatedByPrincipalId`
// is the trusted platform actor captured at enqueue time (from the
// authenticated session — never from a job payload field) and is replayed
// by the worker for every assertCapability/applyOperation call for the
// life of the job, rather than the worker inventing a "system" actor (see
// docs/appbuilder-m07-ai-generation.md#trusted-actor-model). A job never
// mutates `initiatedByPrincipalId` after creation, so `initiatedBy` and any
// later "trusted system executor" bookkeeping stay distinguishable in the
// audit trail (auditEvents.metadata) even though the worker process itself
// has no session of its own.
//
// Retrying the *enqueue* call (same appId + idempotencyKey) always returns
// this same row rather than creating a second job — enforced by the unique
// index below, mirroring appliedOperations' own idempotency contract.
export const generationJobs = pgTable(
  "generation_jobs",
  {
    id: text("id").primaryKey(),
    appId: text("app_id")
      .notNull()
      .references(() => apps.id, { onDelete: "cascade" }),
    creationRequestId: text("creation_request_id")
      .notNull()
      .references(() => creationRequests.id, { onDelete: "cascade" }),

    initiatedByPrincipalId: text("initiated_by_principal_id").notNull(),

    status: generationJobStatusEnum("status").notNull().default("queued"),
    // Free-text sub-phase within `status` for UI/observability (e.g.
    // "analyzing:iteration-2") — status alone drives the state machine and
    // authorization; phase is descriptive only, never branched on.
    phase: text("phase").notNull().default("queued"),
    attemptCount: integer("attempt_count").notNull().default(0),

    idempotencyKey: text("idempotency_key").notNull(),
    requestHash: text("request_hash").notNull(),

    // The specification version this job's operations are/were based on —
    // re-checked against `specifications.currentVersionNumber` immediately
    // before applying (see lib/generation/pipeline.ts), so a spec edited by
    // a human mid-generation fails the job safely (stale_base_version)
    // rather than silently overwriting the human's edit.
    baseVersionNumber: integer("base_version_number").notNull(),

    requestedTemplateId: text("requested_template_id").notNull(),
    selectedTemplateId: text("selected_template_id"),
    // TemplateSelectionRecord (@asafarim/appbuilder-ai) — requested vs.
    // recommended template, reasoning, confidence; never template code.
    templateSelection: jsonb("template_selection").$type<Record<string, unknown>>(),

    // RequirementsAnalysisType (@asafarim/appbuilder-ai) — the model's
    // structured read of the prompt, re-validated on every write.
    normalizedRequirements: jsonb("normalized_requirements").$type<Record<string, unknown>>(),
    // ClarificationStateType (@asafarim/appbuilder-ai) — full question/
    // answer history across every round, never overwritten, only appended.
    clarificationState: jsonb("clarification_state").$type<Record<string, unknown>>(),

    totalOperationsApplied: integer("total_operations_applied").notNull().default(0),

    resultingVersionNumber: integer("resulting_version_number"),
    resultingVersionId: text("resulting_version_id").references(
      (): AnyPgColumn => specificationVersions.id,
      { onDelete: "set null" },
    ),
    resultingPreviewBuildId: text("resulting_preview_build_id").references(
      (): AnyPgColumn => previewBuilds.id,
      { onDelete: "set null" },
    ),

    providerName: text("provider_name"),
    providerModel: text("provider_model"),
    // Cumulative UsageMetadata-shaped totals (@asafarim/appbuilder-ai) —
    // token/latency counts only, never provider request/response bodies.
    usage: jsonb("usage").$type<Record<string, unknown>>().default({}),

    failureCode: generationJobFailureCodeEnum("failure_code"),
    // Always the safe, user-facing message (see lib/generation/errors.ts) —
    // detailed operator diagnostics are logged, redacted, separately, never
    // persisted verbatim on this row.
    failureMessage: text("failure_message"),

    cancelRequestedAt: timestamp("cancel_requested_at", { withTimezone: true }),
    cancelledByPrincipalId: text("cancelled_by_principal_id"),

    // Worker crash-recovery lease. A worker claiming this job stamps its own
    // instance id + a future expiry and refreshes `heartbeatAt`/
    // `leaseExpiresAt` periodically; a claim query only considers jobs whose
    // `leaseExpiresAt` is null or already in the past (see
    // lib/repositories/generationJobs.ts#claimNextJob).
    leaseOwner: text("lease_owner"),
    leaseExpiresAt: timestamp("lease_expires_at", { withTimezone: true }),
    heartbeatAt: timestamp("heartbeat_at", { withTimezone: true }),

    startedAt: timestamp("started_at", { withTimezone: true }),
    completedAt: timestamp("completed_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    uniqueIndex("generation_jobs_app_idempotency_unique").on(table.appId, table.idempotencyKey),
    index("generation_jobs_app_id_idx").on(table.appId),
    index("generation_jobs_status_idx").on(table.status),
    index("generation_jobs_status_lease_idx").on(table.status, table.leaseExpiresAt),
  ],
);

// One row per accepted-or-rejected operation-proposal iteration within a
// job. Exists mainly so the pipeline's operation-proposal step is itself
// idempotent per (jobId, iteration): a worker crash/restart mid-iteration
// re-checks this table before calling the provider or applyOperation again
// for that iteration, rather than re-proposing/re-applying and risking a
// duplicate specification version.
export const generationOperationBatches = pgTable(
  "generation_operation_batches",
  {
    id: text("id").primaryKey(),
    jobId: text("job_id")
      .notNull()
      .references(() => generationJobs.id, { onDelete: "cascade" }),
    appId: text("app_id")
      .notNull()
      .references(() => apps.id, { onDelete: "cascade" }),
    iteration: integer("iteration").notNull(),
    reasoningSummary: text("reasoning_summary").notNull().default(""),
    isFinalBatch: boolean("is_final_batch").notNull().default(false),
    proposedOperationCount: integer("proposed_operation_count").notNull().default(0),
    // Ordered ids into appliedOperations for every operation in this batch
    // that was actually applied — the durable link from "what the model
    // proposed" to "what M04 actually persisted".
    appliedOperationIds: jsonb("applied_operation_ids").$type<string[]>().notNull().default([]),
    status: generationBatchStatusEnum("status").notNull(),
    rejectionReason: text("rejection_reason"),
    idempotencyKey: text("idempotency_key").notNull(),
    requestHash: text("request_hash").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    uniqueIndex("generation_operation_batches_job_iteration_unique").on(table.jobId, table.iteration),
    index("generation_operation_batches_app_id_idx").on(table.appId),
  ],
);

// M08: the single conversation thread for an app's builder workspace. One
// row per app (unique index below) rather than a full multi-thread model —
// the workspace's right panel is a single ongoing conversation about the
// app, matching the issue's "the AI conversation/change workflow" (singular
// panel, not a thread picker). Auto-created on first message.
export const conversations = pgTable(
  "conversations",
  {
    id: text("id").primaryKey(),
    appId: text("app_id")
      .notNull()
      .references(() => apps.id, { onDelete: "cascade" }),
    createdByPrincipalId: text("created_by_principal_id").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [uniqueIndex("conversations_app_id_unique").on(table.appId)],
);

// M08: every persisted message in an app's conversation — the durable
// record that survives refresh/sign-out/device-change/worker-restart (never
// browser-only state). `content` is always rendered through a strict, safe
// Markdown subset on the client — never `dangerouslySetInnerHTML` — so this
// column may contain arbitrary user/model text without being a stored-XSS
// vector; safety is enforced at render time, not by pre-sanitizing storage.
export const conversationMessages = pgTable(
  "conversation_messages",
  {
    id: text("id").primaryKey(),
    conversationId: text("conversation_id")
      .notNull()
      .references(() => conversations.id, { onDelete: "cascade" }),
    // Denormalized so scoped reads never need a join through conversations.
    appId: text("app_id")
      .notNull()
      .references(() => apps.id, { onDelete: "cascade" }),
    role: conversationRoleEnum("role").notNull(),
    messageType: conversationMessageTypeEnum("message_type").notNull(),
    content: text("content").notNull(),
    // The trusted, session-derived actor who authored a `user_request`
    // message. Null for assistant/system-authored messages — those are
    // attributed to the triggering modification job, not a principal.
    authorPrincipalId: text("author_principal_id"),
    // Bounded selection-context the user attached to a request (see
    // lib/modification/selectionContext.ts) — stable spec identifiers only
    // (appId, specification version, pageId, componentId, kind, label),
    // never raw DOM/HTML/cookies/tokens. Null when no preview element was
    // selected.
    selectedContext: jsonb("selected_context").$type<Record<string, unknown>>(),
    // The specification version this message's request/response corresponds
    // to — lets the UI detect "this proposal was about an older version"
    // without a join.
    baseVersionNumber: integer("base_version_number"),
    modificationJobId: text("modification_job_id").references(
      (): AnyPgColumn => modificationJobs.id,
      { onDelete: "set null" },
    ),
    // SpecificationDiff (@asafarim/appbuilder-schema) for ai_proposal/
    // applied_change messages — structured, never a raw text diff.
    diffSummary: jsonb("diff_summary").$type<Record<string, unknown>>(),
    // DestructiveImpact["classification"] (@asafarim/appbuilder-schema) when
    // the proposal contains a destructive change, else null.
    impactClassification: text("impact_classification"),
    confirmationState: conversationConfirmationStateEnum("confirmation_state")
      .notNull()
      .default("not_required"),
    resultingVersionNumber: integer("resulting_version_number"),
    resultingPreviewBuildId: text("resulting_preview_build_id").references(
      (): AnyPgColumn => previewBuilds.id,
      { onDelete: "set null" },
    ),
    failureCode: text("failure_code"),
    // Always the safe, user-facing message — never a raw stack trace,
    // provider error string, or SQL detail (mirrors
    // lib/generation/errors.ts#safeFailureMessage's contract).
    failureMessage: text("failure_message"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index("conversation_messages_conversation_id_idx").on(table.conversationId),
    index("conversation_messages_app_id_idx").on(table.appId),
    index("conversation_messages_created_at_idx").on(table.createdAt),
  ],
);

// M08: one durable row per conversational modification attempt — the
// sibling of generation_jobs (M07), NOT a repurposing of it. A modification
// job interprets ONE bounded follow-up request against an already-generated
// app (optionally scoped to a selected page/component), proposes a SINGLE
// operation batch (see modification_operation_batches; no multi-iteration
// budget loop like generation), and may pause at `awaiting_confirmation` for
// a human to explicitly confirm a destructive change — generation jobs never
// pause for human confirmation, they simply skip/reject destructive
// proposals. Kept as a distinct table + status enum rather than a
// `jobType` discriminator on generation_jobs specifically because: (a) the
// FK shape differs (no creationRequestId/requestedTemplateId — those are
// M05/M07 creation-specific and meaningless here), and (b) overloading one
// status enum with two different phase vocabularies would break the
// invariant that `status` alone drives the state machine (see
// lib/generation/stateMachine.ts's "phase is descriptive only, never
// branched on" comment) — a modification job's `awaiting_confirmation`
// status has no generation-job equivalent. The claim/lease/heartbeat SQL
// mechanics are still copied verbatim from generationJobs.ts (see
// lib/repositories/modificationJobs.ts) since those are genuinely
// job-shape-agnostic.
export const modificationJobs = pgTable(
  "modification_jobs",
  {
    id: text("id").primaryKey(),
    appId: text("app_id")
      .notNull()
      .references(() => apps.id, { onDelete: "cascade" }),
    conversationId: text("conversation_id")
      .notNull()
      .references(() => conversations.id, { onDelete: "cascade" }),
    // The `user_request` message that triggered this job — set once, never
    // changed.
    triggeringMessageId: text("triggering_message_id")
      .notNull()
      .references((): AnyPgColumn => conversationMessages.id, { onDelete: "cascade" }),

    // Trusted platform actor captured at enqueue time — never client-
    // supplied at any later step. Replayed by the worker for every
    // assertCapability/applyOperation call (see
    // lib/modification/pipeline.ts#actingAsInitiator), same trusted-actor
    // pattern as M07.
    initiatedByPrincipalId: text("initiated_by_principal_id").notNull(),

    status: modificationJobStatusEnum("status").notNull().default("queued"),
    phase: text("phase").notNull().default("queued"),
    attemptCount: integer("attempt_count").notNull().default(0),

    idempotencyKey: text("idempotency_key").notNull(),
    requestHash: text("request_hash").notNull(),

    // Re-checked against specifications.currentVersionNumber immediately
    // before applying — a spec edited elsewhere mid-job fails safely
    // (stale_base_version) rather than silently overwriting it.
    baseVersionNumber: integer("base_version_number").notNull(),

    // Bounded preview-selection context (see
    // lib/modification/selectionContext.ts) — stable spec identifiers only.
    selectionContext: jsonb("selection_context").$type<Record<string, unknown>>(),

    // Truncated copy of the user's free-text request, bounded at the API
    // layer (see lib/validation/conversations.ts) before being persisted —
    // this is what the provider is actually asked about.
    userRequestText: text("user_request_text").notNull(),

    // ModificationAnalysisType (@asafarim/appbuilder-ai) — the model's
    // structured read of the request, re-validated on every write.
    normalizedRequest: jsonb("normalized_request").$type<Record<string, unknown>>(),

    totalOperationsApplied: integer("total_operations_applied").notNull().default(0),

    // Confirmation binding (issue requirement: "bind to actor, app, base
    // version, exact proposal checksum; expire; single-use; fail if base
    // version changed; never come from the model"). Folded directly onto
    // this row rather than a separate table since a modification job has
    // exactly one confirmation cycle for its one operation batch.
    confirmationRequired: boolean("confirmation_required").notNull().default(false),
    confirmationChecksum: text("confirmation_checksum"),
    confirmationBaseVersionNumber: integer("confirmation_base_version_number"),
    confirmationExpiresAt: timestamp("confirmation_expires_at", { withTimezone: true }),
    confirmationConfirmedAt: timestamp("confirmation_confirmed_at", { withTimezone: true }),
    confirmationConfirmedByPrincipalId: text("confirmation_confirmed_by_principal_id"),

    resultingVersionNumber: integer("resulting_version_number"),
    resultingVersionId: text("resulting_version_id").references(
      (): AnyPgColumn => specificationVersions.id,
      { onDelete: "set null" },
    ),
    resultingPreviewBuildId: text("resulting_preview_build_id").references(
      (): AnyPgColumn => previewBuilds.id,
      { onDelete: "set null" },
    ),

    providerName: text("provider_name"),
    providerModel: text("provider_model"),
    usage: jsonb("usage").$type<Record<string, unknown>>().default({}),

    failureCode: modificationJobFailureCodeEnum("failure_code"),
    failureMessage: text("failure_message"),

    cancelRequestedAt: timestamp("cancel_requested_at", { withTimezone: true }),
    cancelledByPrincipalId: text("cancelled_by_principal_id"),

    // Worker crash-recovery lease — identical mechanics to
    // generation_jobs (see lib/repositories/modificationJobs.ts#claimInternal).
    leaseOwner: text("lease_owner"),
    leaseExpiresAt: timestamp("lease_expires_at", { withTimezone: true }),
    heartbeatAt: timestamp("heartbeat_at", { withTimezone: true }),

    startedAt: timestamp("started_at", { withTimezone: true }),
    completedAt: timestamp("completed_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    uniqueIndex("modification_jobs_app_idempotency_unique").on(table.appId, table.idempotencyKey),
    index("modification_jobs_app_id_idx").on(table.appId),
    index("modification_jobs_conversation_id_idx").on(table.conversationId),
    index("modification_jobs_status_idx").on(table.status),
    index("modification_jobs_status_lease_idx").on(table.status, table.leaseExpiresAt),
  ],
);

// M08: exactly one row per modification job — unlike generation's
// multi-iteration generationOperationBatches, a modification job proposes a
// single bounded operation batch (see schema comment on modificationJobs).
// Still its own table (not folded onto modificationJobs) to mirror M07's
// audit-trail convention of keeping "what was proposed" as its own
// append-only record, distinct from the job's own bookkeeping columns.
export const modificationOperationBatches = pgTable(
  "modification_operation_batches",
  {
    id: text("id").primaryKey(),
    jobId: text("job_id")
      .notNull()
      .references(() => modificationJobs.id, { onDelete: "cascade" }),
    appId: text("app_id")
      .notNull()
      .references(() => apps.id, { onDelete: "cascade" }),
    reasoningSummary: text("reasoning_summary").notNull().default(""),
    proposedOperationCount: integer("proposed_operation_count").notNull().default(0),
    // Ordered ids into appliedOperations for every operation actually
    // applied (before any confirmation-gated ones) — same durable link
    // convention as generationOperationBatches.appliedOperationIds.
    appliedOperationIds: jsonb("applied_operation_ids").$type<string[]>().notNull().default([]),
    // { operation: unknown; reason: string }[] — proposed operations that
    // failed structural/semantic validation and were never applied.
    rejectedOperations: jsonb("rejected_operations").$type<Record<string, unknown>[]>().notNull().default([]),
    // { operation: unknown; classification: string; details: string[] }[] —
    // proposed operations M04 classified as destructive, held pending
    // confirmation. Cleared (moved into appliedOperationIds or dropped) once
    // the confirmation cycle resolves.
    destructiveOperations: jsonb("destructive_operations").$type<Record<string, unknown>[]>().notNull().default([]),
    status: modificationBatchStatusEnum("status").notNull().default("proposed"),
    idempotencyKey: text("idempotency_key").notNull(),
    requestHash: text("request_hash").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    uniqueIndex("modification_operation_batches_job_unique").on(table.jobId),
    index("modification_operation_batches_app_id_idx").on(table.appId),
  ],
);

export const appsRelations = relations(apps, ({ many }) => ({
  collaborators: many(collaborators),
  specifications: many(specifications),
  operations: many(appliedOperations),
  previewBuilds: many(previewBuilds),
  releases: many(releases),
  deployments: many(deployments),
  auditEvents: many(auditEvents),
  creationRequest: many(creationRequests),
  generationJobs: many(generationJobs),
  conversations: many(conversations),
  modificationJobs: many(modificationJobs),
}));

export const creationRequestsRelations = relations(creationRequests, ({ one }) => ({
  app: one(apps, { fields: [creationRequests.appId], references: [apps.id] }),
}));

export const collaboratorsRelations = relations(collaborators, ({ one }) => ({
  app: one(apps, { fields: [collaborators.appId], references: [apps.id] }),
}));

export const specificationsRelations = relations(specifications, ({ one, many }) => ({
  app: one(apps, { fields: [specifications.appId], references: [apps.id] }),
  versions: many(specificationVersions),
  operations: many(appliedOperations),
}));

export const specificationVersionsRelations = relations(
  specificationVersions,
  ({ one, many }) => ({
    specification: one(specifications, {
      fields: [specificationVersions.specificationId],
      references: [specifications.id],
    }),
    app: one(apps, { fields: [specificationVersions.appId], references: [apps.id] }),
    previewBuilds: many(previewBuilds),
    releases: many(releases),
  }),
);

export const appliedOperationsRelations = relations(appliedOperations, ({ one }) => ({
  app: one(apps, { fields: [appliedOperations.appId], references: [apps.id] }),
  specification: one(specifications, {
    fields: [appliedOperations.specificationId],
    references: [specifications.id],
  }),
  resultingVersion: one(specificationVersions, {
    fields: [appliedOperations.resultingVersionId],
    references: [specificationVersions.id],
  }),
}));

export const previewBuildsRelations = relations(previewBuilds, ({ one }) => ({
  app: one(apps, { fields: [previewBuilds.appId], references: [apps.id] }),
  specificationVersion: one(specificationVersions, {
    fields: [previewBuilds.specificationVersionId],
    references: [specificationVersions.id],
  }),
}));

export const releasesRelations = relations(releases, ({ one, many }) => ({
  app: one(apps, { fields: [releases.appId], references: [apps.id] }),
  specificationVersion: one(specificationVersions, {
    fields: [releases.specificationVersionId],
    references: [specificationVersions.id],
  }),
  deployments: many(deployments),
}));

export const deploymentsRelations = relations(deployments, ({ one }) => ({
  app: one(apps, { fields: [deployments.appId], references: [apps.id] }),
  release: one(releases, { fields: [deployments.releaseId], references: [releases.id] }),
}));

export const auditEventsRelations = relations(auditEvents, ({ one }) => ({
  app: one(apps, { fields: [auditEvents.appId], references: [apps.id] }),
}));

export const idempotencyKeysRelations = relations(idempotencyKeys, ({ one }) => ({
  app: one(apps, { fields: [idempotencyKeys.appId], references: [apps.id] }),
}));

export const generationJobsRelations = relations(generationJobs, ({ one, many }) => ({
  app: one(apps, { fields: [generationJobs.appId], references: [apps.id] }),
  creationRequest: one(creationRequests, {
    fields: [generationJobs.creationRequestId],
    references: [creationRequests.id],
  }),
  resultingVersion: one(specificationVersions, {
    fields: [generationJobs.resultingVersionId],
    references: [specificationVersions.id],
  }),
  resultingPreviewBuild: one(previewBuilds, {
    fields: [generationJobs.resultingPreviewBuildId],
    references: [previewBuilds.id],
  }),
  batches: many(generationOperationBatches),
}));

export const generationOperationBatchesRelations = relations(generationOperationBatches, ({ one }) => ({
  job: one(generationJobs, { fields: [generationOperationBatches.jobId], references: [generationJobs.id] }),
  app: one(apps, { fields: [generationOperationBatches.appId], references: [apps.id] }),
}));

export const conversationsRelations = relations(conversations, ({ one, many }) => ({
  app: one(apps, { fields: [conversations.appId], references: [apps.id] }),
  messages: many(conversationMessages),
  modificationJobs: many(modificationJobs),
}));

export const conversationMessagesRelations = relations(conversationMessages, ({ one }) => ({
  conversation: one(conversations, {
    fields: [conversationMessages.conversationId],
    references: [conversations.id],
  }),
  app: one(apps, { fields: [conversationMessages.appId], references: [apps.id] }),
  modificationJob: one(modificationJobs, {
    fields: [conversationMessages.modificationJobId],
    references: [modificationJobs.id],
  }),
  resultingPreviewBuild: one(previewBuilds, {
    fields: [conversationMessages.resultingPreviewBuildId],
    references: [previewBuilds.id],
  }),
}));

export const modificationJobsRelations = relations(modificationJobs, ({ one, many }) => ({
  app: one(apps, { fields: [modificationJobs.appId], references: [apps.id] }),
  conversation: one(conversations, {
    fields: [modificationJobs.conversationId],
    references: [conversations.id],
  }),
  triggeringMessage: one(conversationMessages, {
    fields: [modificationJobs.triggeringMessageId],
    references: [conversationMessages.id],
  }),
  resultingVersion: one(specificationVersions, {
    fields: [modificationJobs.resultingVersionId],
    references: [specificationVersions.id],
  }),
  resultingPreviewBuild: one(previewBuilds, {
    fields: [modificationJobs.resultingPreviewBuildId],
    references: [previewBuilds.id],
  }),
  batch: many(modificationOperationBatches),
}));

export const modificationOperationBatchesRelations = relations(modificationOperationBatches, ({ one }) => ({
  job: one(modificationJobs, { fields: [modificationOperationBatches.jobId], references: [modificationJobs.id] }),
  app: one(apps, { fields: [modificationOperationBatches.appId], references: [apps.id] }),
}));
