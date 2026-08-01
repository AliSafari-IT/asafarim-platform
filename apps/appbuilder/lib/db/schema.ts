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
import { relations, sql } from "drizzle-orm";

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

// M11: a release's own lifecycle, distinct from a DEPLOYMENT's lifecycle
// (below). `draft` = prepared and manifest-frozen but not yet approved;
// `approved` = a human with app.approve bound their approval to this exact
// specification version + checksum; `published` = this release has been
// successfully activated as production at least once; `superseded` = a
// later release replaced it as the active production pointer (it remains
// immutable and rollback-eligible); `archived` = explicitly retired, no
// longer rollback-eligible. `draft`/`published`/`archived` predate M11
// (M02 scaffolding) and are retained so existing rows stay valid.
export const releaseStatusEnum = pgEnum("release_status", [
  "draft",
  "approved",
  "published",
  "superseded",
  "archived",
]);

export const deploymentEnvironmentEnum = pgEnum("deployment_environment", [
  "preview",
  "production",
]);

// M11: `pending`/`succeeded`/`failed` predate this milestone; `running`,
// `cancelled`, and `rolled_back` are added for the durable deployment
// worker. Legal transitions are enforced centrally in
// lib/deployment/stateMachine.ts, never by ad-hoc status writes.
export const deploymentStatusEnum = pgEnum("deployment_status", [
  "pending",
  "running",
  "succeeded",
  "failed",
  "cancelled",
  "rolled_back",
]);

// M11: what a deployment is doing right now. Ordered exactly as
// lib/deployment/pipeline.ts executes them. Everything up to and including
// `smoke_testing` is pre-activation and MUST leave the previous production
// pointer untouched on failure; `activating` is the single atomic pointer
// switch; `verifying` runs after activation and, on failure, triggers an
// automatic restore of the previous healthy pointer.
export const deploymentPhaseEnum = pgEnum("deployment_phase", [
  "queued",
  "checking_eligibility",
  "freezing_manifest",
  "reserving_slug",
  "checking_data_compatibility",
  "preparing_artifact",
  "publishing",
  "health_checking",
  "smoke_testing",
  "activating",
  "verifying",
  "completed",
  "rolling_back",
]);

// M11: why a deployment failed — a closed, safe-to-display classification
// (never a raw stack trace, provider body, or connection string). See
// lib/deployment/errors.ts.
export const deploymentFailureCodeEnum = pgEnum("deployment_failure_code", [
  "not_eligible",
  "stale_approval",
  "slug_unavailable",
  "slug_reserved",
  "data_incompatible",
  "artifact_preparation_failed",
  "health_check_failed",
  "smoke_test_failed",
  "activation_failed",
  "post_activation_verification_failed",
  "authorization_lost",
  "app_archived",
  "worker_infrastructure_error",
  "cancelled",
]);

// M11: how a domain mapping came to exist. `auto_slug` is the default
// managed convention ({app-slug}.apps.asafarim.com); `custom` is reserved
// for M12's customer-domain work and is NOT reachable in M11.
export const appDomainKindEnum = pgEnum("app_domain_kind", [
  "auto_slug",
  "custom",
]);

export const appDomainStatusEnum = pgEnum("app_domain_status", [
  "reserved",
  "active",
  "released",
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
export const generationJobFailureCodeEnum = pgEnum(
  "generation_job_failure_code",
  [
    "invalid_request",
    "provider_configuration_error",
    "provider_rate_limit",
    "provider_unavailable",
    // Distinct from `provider_unavailable` on purpose. "The provider is
    // down" and "we gave up waiting" are opposite operational signals: the
    // first says wait, the second says raise
    // APPBUILDER_AI_REQUEST_TIMEOUT_MS or pick a faster model. Collapsing
    // them (as every pipeline did until #64) sent whoever read the failure
    // in exactly the wrong direction.
    "provider_timeout",
    "malformed_provider_response",
    // Distinct from `malformed_provider_response` on purpose, same reasoning
    // as `provider_timeout` above: a schema-mismatched-but-complete answer
    // is often a one-off model slip, worth a blind retry. A response cut off
    // by the output token limit (finish_reason: "length") is usually a
    // request/config-shaped problem instead — for a reasoning-capable model
    // the same budget also covers hidden reasoning tokens, so a request
    // whose expected output is large can reliably hit the exact same wall on
    // every retry until the limit (APPBUILDER_AI_MAX_OUTPUT_TOKENS /
    // OPENAI_MAX_OUTPUT_TOKENS) is raised.
    "provider_response_truncated",
    "forbidden_operation",
    "specification_validation_failed",
    "stale_base_version",
    "authorization_lost",
    "preview_failed",
    "worker_infrastructure_error",
    "cancelled",
  ]
);

export const generationBatchStatusEnum = pgEnum("generation_batch_status", [
  "applied",
  "rejected",
]);

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
  // M13 slice E: the three new card kinds the M13 doc's "Conversation
  // cards" section requires — persisted as ordinary messages (not a
  // parallel record type) so history/audit/deletion/export all keep
  // working unchanged.
  "clarification_question",
  "clarification_answer",
  "plan",
  "capability_notice",
]);

export const conversationConfirmationStateEnum = pgEnum(
  "conversation_confirmation_state",
  ["not_required", "pending", "confirmed", "expired"]
);

// M13 slice B: an attachment's own lifecycle, independent of the message it
// eventually gets claimed by (a message may not exist yet — init happens
// before send). `pending` = initiated, no bytes yet; `uploaded` = bytes
// persisted and byte-verified, not yet processed; `processing` = extraction/
// scan in flight; `ready` = safe to reference from a message/model context;
// `quarantined` = the scan adapter flagged it; `failed` = processing could
// not complete (see conversationAttachmentFailureCodeEnum); `deleted` = a
// soft tombstone (owner/uploader deletion or retention sweep), storage
// object already removed. See lib/repositories/attachments.ts.
export const conversationAttachmentStatusEnum = pgEnum(
  "conversation_attachment_status",
  ["pending", "uploaded", "processing", "ready", "quarantined", "failed", "deleted"]
);

// Safe, stable failure classification surfaced to the user — never a raw
// exception message, storage error, or scanner detail.
export const conversationAttachmentFailureCodeEnum = pgEnum(
  "conversation_attachment_failure_code",
  [
    "size_mismatch",
    "oversized",
    "mime_mismatch",
    "unsupported_format",
    "malware_detected",
    "scanner_unavailable",
    "extraction_failed",
    "worker_infrastructure_error",
  ]
);

// M13 slice F: which adapter produced an imported public reference. Stored
// (with a version, see conversation_references.adapter_version) so a cached
// row can always be attributed — M13 requires provenance to carry
// "adapter/version".
export const conversationReferenceAdapterEnum = pgEnum(
  "conversation_reference_adapter",
  ["generic_https", "github_profile", "github_repository"]
);

// M13 slice F: an imported reference's usability. Deliberately NOT a
// freshness enum — freshness is DERIVED at read time from `fetched_at`,
// `cache_expires_at`, and `failure_code` (lib/references/provenance.ts), so
// a row can never sit in the database asserting it is "live" while the clock
// moves on. `ready` = usable content is stored (possibly past its TTL, and
// possibly after a failed refresh — both report as stale, never live);
// `unavailable` = no usable content was ever stored; `deleted` = soft
// tombstone, same convention as conversation_attachments.
export const conversationReferenceStatusEnum = pgEnum(
  "conversation_reference_status",
  ["ready", "unavailable", "deleted"]
);

// M13 slice F: safe, stable failure classification for a reference import —
// mirrors lib/references/errors.ts#ReferenceFailureCode. Never a raw
// exception, remote response body, resolved IP address, or redirect chain
// (telling a caller which internal address their URL resolved to would turn
// a blocked SSRF attempt into a working port scanner — see that module's
// docstring).
export const conversationReferenceFailureCodeEnum = pgEnum(
  "conversation_reference_failure_code",
  [
    "url_not_allowed",
    "too_many_redirects",
    "timeout",
    "too_large",
    "unsupported_content_type",
    "fetch_failed",
    "rate_limited",
    "no_content",
  ]
);

// M08: the conversational modification job's own lifecycle — deliberately a
// SEPARATE enum/state machine from generation_job_status (see
// lib/modification/stateMachine.ts), even though both are AI-driven and
// both apply through M04. A modification job interprets a single bounded
// follow-up request against an EXISTING app (no template selection, no
// multi-iteration operation budget loop) and may pause partway through for
// human destructive-change confirmation, which generation jobs never do
// (they always apply with confirmDestructive:false and simply reject/skip
// destructive proposals instead of pausing for a human).
// M13 slice E: `needs_clarification` is a PAUSE, not a failure — the job
// stays addressable, a question is persisted (modificationJobs.
// clarificationState), and submitting an answer resumes it back through
// `interpreting` (see lib/repositories/modificationJobs.ts#
// submitClarificationAnswer and lib/modification/stateMachine.ts). Mirrors
// generationJobStatusEnum's own `needs_clarification` status, which this
// was explicitly modeled on (docs/appbuilder-m13-multimodal-contextual-
// assistant.md: "Existing modification jobs reference steps or are
// migrated into the model; M13 must not create a second mutation
// executor").
export const modificationJobStatusEnum = pgEnum("modification_job_status", [
  "queued",
  "interpreting",
  "needs_clarification",
  "proposing",
  "awaiting_confirmation",
  "applying",
  "validating",
  "preparing_preview",
  "ready",
  "failed",
  "cancelled",
]);

export const modificationJobFailureCodeEnum = pgEnum(
  "modification_job_failure_code",
  [
    "invalid_request",
    "provider_configuration_error",
    "provider_rate_limit",
    "provider_unavailable",
    /** See generationJobFailureCodeEnum's note — same distinction, same reason. */
    "provider_timeout",
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
    // M13 slice E: the request named nothing this platform's schema/
    // component/integration set can represent — a truthful capability
    // gap (see ModificationDecision's "unsupported" outcome), never the
    // generic invalid_request the pre-slice-E pipeline used for this case.
    "unsupported_request",
    // The clarification round expired (MODIFICATION_LIMITS.
    // CLARIFICATION_TTL_MS) before an answer was submitted.
    "clarification_expired",
  ]
);

export const modificationBatchStatusEnum = pgEnum("modification_batch_status", [
  "proposed",
  "awaiting_confirmation",
  "applied",
  "rejected",
]);

// M13 slice E: a triggering message's capability-aware, multi-step
// modification plan — "draft" while being assembled/proposed (before its
// first step's job has run), "running" while any step is in progress,
// "completed" once every step reached `applied`, "failed" when a step
// failed and left a recoverable partial result (earlier applied steps'
// versions are never rolled back), "cancelled" on explicit user
// cancellation.
export const modificationPlanStatusEnum = pgEnum("modification_plan_status", [
  "draft",
  "running",
  "completed",
  "failed",
  "cancelled",
]);

// One step's lifecycle within a plan — deliberately mirrors the shape of
// modificationJobStatusEnum's own terminal states (ready~applied,
// failed~failed) without reusing the enum itself, since a step is a plan-
// level bookkeeping row, never itself worker-claimed or leased (the
// modificationJob it points at is what a worker actually drives).
export const modificationPlanStepStatusEnum = pgEnum("modification_plan_step_status", [
  "pending",
  "running",
  "awaiting_confirmation",
  "applied",
  "failed",
  "skipped",
]);

// M11: the hard data boundary between a generated app's PREVIEW data (demo
// rows a builder seeds/resets freely while designing) and its PRODUCTION
// data (real records belonging to real end users of a deployed release).
//
// This is deliberately a SEPARATE enum from `deployment_environment` (which
// labels a deployment record, not a data row) so the two can never be
// conflated: this one is an immutable property of every generated-data row,
// stamped at insert and never updated afterward (see the
// `generated_*_environment_immutable` triggers in the M11 migration).
//
// Every M09 generated-data table carries this column, every uniqueness/
// idempotency index includes it, and every repository predicate filters on
// it — without that, a preview record's unique email would permanently
// block the same value in production, a preview workflow execution would
// suppress the production run via a colliding idempotency key, and
// `resetGeneratedData` would delete real production rows. See
// docs/appbuilder-m11-releases-deployment.md#data-environment-separation.
export const generatedEnvironmentEnum = pgEnum("generated_environment", [
  "preview",
  "production",
]);

// M09: a generated app's OWN membership status — entirely separate from
// M03's collaborator_status (which governs the AppBuilder *development*
// workspace). A generated-app member is a person using the FINISHED app
// (e.g. an employee logging in to manage their tasks), never automatically
// an AppBuilder owner/editor/viewer. See lib/generated-data/membership.ts.
export const generatedMemberStatusEnum = pgEnum("generated_member_status", [
  "active",
  "revoked",
]);

// How a generated-app membership row came to exist — audit provenance, not
// a permission itself.
export const generatedMemberProvenanceEnum = pgEnum(
  "generated_member_provenance",
  ["owner_bootstrap", "invited"]
);

export const generatedRecordStatusEnum = pgEnum("generated_record_status", [
  "active",
  "archived",
]);

export const generatedFileStatusEnum = pgEnum("generated_file_status", [
  "pending",
  "committed",
  "archived",
]);

// The workflow *execution job's* own lifecycle — deliberately tiny (M09
// workflows run synchronously, in-request, immediately after the record
// mutation that triggered them; see lib/generated-data/workflows.ts) rather
// than the multi-phase async state machines M07/M08 use for AI jobs. Still
// a durable row for idempotency/audit/retry-safety, just not
// worker-dispatched.
export const generatedWorkflowExecutionStatusEnum = pgEnum(
  "generated_workflow_execution_status",
  ["succeeded", "failed"]
);

export const generatedWorkflowStepStatusEnum = pgEnum(
  "generated_workflow_step_status",
  ["applied", "skipped", "failed"]
);

// Bounded, allowlisted row-access rule vocabulary — never eval'd, never a
// generated SQL fragment. See lib/generated-data/runtimeAuth.ts.
export const generatedRowAccessRuleKindEnum = pgEnum(
  "generated_row_access_rule_kind",
  ["all", "own", "assigned", "relatedToParent"]
);

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
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
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
  ]
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
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    uniqueIndex("collaborators_app_principal_unique").on(
      table.appId,
      table.principalId
    ),
    index("collaborators_app_id_idx").on(table.appId),
    index("collaborators_principal_id_idx").on(table.principalId),
  ]
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
    currentVersionNumber: integer("current_version_number")
      .notNull()
      .default(0),
    // M06: the app's pinned, authoritative preview — set only after a
    // preview build *succeeds* (lib/repositories/previewService.ts), never
    // pointed at a queued/running/failed build. A failed rebuild attempt
    // never moves or clears this, so the last successful preview always
    // keeps rendering at /apps/{appId}/preview until a *new* build succeeds.
    // The browser can never supply this directly — it is resolved
    // server-side from this column alone.
    pinnedPreviewBuildId: text("pinned_preview_build_id").references(
      (): AnyPgColumn => previewBuilds.id,
      { onDelete: "set null" }
    ),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [uniqueIndex("specifications_app_id_unique").on(table.appId)]
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
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    uniqueIndex("specification_versions_spec_version_unique").on(
      table.specificationId,
      table.versionNumber
    ),
    index("specification_versions_app_id_idx").on(table.appId),
  ]
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
      { onDelete: "set null" }
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
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    uniqueIndex("applied_operations_app_idempotency_unique").on(
      table.appId,
      table.idempotencyKey
    ),
    index("applied_operations_app_id_idx").on(table.appId),
  ]
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
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    index("preview_builds_app_id_idx").on(table.appId),
    // Idempotent preview creation: the same specification version rendered
    // against the same registry version is a pure, deterministic
    // computation — a repeated request reuses this row instead of
    // inserting a duplicate.
    uniqueIndex("preview_builds_version_registry_unique").on(
      table.specificationVersionId,
      table.registryVersion
    ),
  ]
);

// M11: an IMMUTABLE, approvable, deployable snapshot of a specification
// version. Every column below other than `status` and the approval/publish
// bookkeeping is frozen at creation and never updated — "editing a release"
// is not a concept; you prepare a NEW release from a newer version.
//
// Crucially, every field is DERIVED SERVER-SIDE from persisted records
// (specificationVersions, previewBuilds, validationRuns) at preparation
// time — none of it is ever accepted from the browser. See
// lib/repositories/releases.ts#prepareRelease.
//
// The `manifest` JSONB is the frozen, self-contained provenance record
// (see lib/deployment/manifest.ts#ReleaseManifest) written once when the
// release is prepared; the individual columns beside it exist so the same
// facts stay queryable/indexable without parsing JSON.
export const releases = pgTable(
  "releases",
  {
    id: text("id").primaryKey(),
    appId: text("app_id")
      .notNull()
      .references(() => apps.id, { onDelete: "cascade" }),

    // ── Pinned specification identity (immutable) ──────────────────────
    specificationVersionId: text("specification_version_id")
      .notNull()
      .references(() => specificationVersions.id, { onDelete: "restrict" }),
    specificationVersionNumber: integer("specification_version_number")
      .notNull()
      .default(0),
    // The canonical @asafarim/appbuilder-schema checksum of that version's
    // payload, copied at preparation. Approval and deployment both re-verify
    // against this exact value — a version whose payload somehow no longer
    // hashes to it is refused rather than deployed.
    specificationChecksum: text("specification_checksum").notNull().default(""),
    schemaVersion: text("schema_version").notNull().default(""),

    // ── Pinned build/runtime identity (immutable) ──────────────────────
    previewBuildId: text("preview_build_id").references(
      (): AnyPgColumn => previewBuilds.id,
      { onDelete: "restrict" }
    ),
    previewChecksum: text("preview_checksum"),
    registryVersion: text("registry_version").notNull().default(""),

    // ── Pinned validation evidence (immutable) ─────────────────────────
    // The M10 run that proves this exact version+checksum passed every
    // mandatory gate. Deployment re-reads this row transactionally rather
    // than trusting the boolean alone.
    validationRunId: text("validation_run_id").references(
      (): AnyPgColumn => validationRuns.id,
      { onDelete: "restrict" }
    ),
    gateSetVersion: text("gate_set_version"),

    // ── Data-compatibility verdict (immutable, computed at preparation) ─
    // Result of diffing this version's entities against the CURRENTLY LIVE
    // production release's entities (see lib/deployment/dataCompatibility.ts).
    // "none" when there is no prior production release to diff against.
    dataCompatibility: text("data_compatibility").notNull().default("none"),
    dataCompatibilityDetail: jsonb("data_compatibility_detail")
      .$type<Record<string, unknown>>()
      .notNull()
      .default({}),

    // ── Frozen manifest + its own checksum ─────────────────────────────
    manifest: jsonb("manifest")
      .$type<Record<string, unknown>>()
      .notNull()
      .default({}),
    // sha256 over the canonicalized manifest — lets a deployment prove the
    // manifest it is acting on is byte-identical to the one approved.
    manifestChecksum: text("manifest_checksum").notNull().default(""),

    // ── Managed production host at preparation time ────────────────────
    appSlug: text("app_slug").notNull().default(""),
    productionHost: text("production_host").notNull().default(""),

    versionLabel: text("version_label").notNull(),
    status: releaseStatusEnum("status").notNull().default("draft"),

    // ── Actors / provenance ────────────────────────────────────────────
    preparedByPrincipalId: text("prepared_by_principal_id"),
    approvedByPrincipalId: text("approved_by_principal_id"),
    approvedAt: timestamp("approved_at", { withTimezone: true }),
    publishedByPrincipalId: text("published_by_principal_id"),
    publishedAt: timestamp("published_at", { withTimezone: true }),
    // The production release this one replaced when it first went live —
    // the rollback breadcrumb trail.
    previousReleaseId: text("previous_release_id"),

    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    uniqueIndex("releases_app_version_label_unique").on(
      table.appId,
      table.versionLabel
    ),
    index("releases_app_id_idx").on(table.appId),
    index("releases_app_status_idx").on(table.appId, table.status),
    // Preparing a release for the same (app, specification version) twice is
    // a replay, not a second release — see prepareRelease's idempotency.
    uniqueIndex("releases_app_spec_version_unique").on(
      table.appId,
      table.specificationVersionId
    ),
  ]
);

// M11: the app's managed production domain(s). This table — never the
// request Host header — is the authority for "which app does this hostname
// belong to". `activeReleaseId` is the ONLY pointer that decides what
// production serves; it moves exactly once per successful deployment, in a
// single transaction (see lib/deployment/pipeline.ts's activation phase).
//
// `host` is stored fully normalized (lowercase, punycode/ASCII, no port) so
// the routing lookup is an exact equality match against an untrusted,
// pre-normalized host — never a LIKE/suffix computation.
export const appDomains = pgTable(
  "app_domains",
  {
    id: text("id").primaryKey(),
    appId: text("app_id")
      .notNull()
      .references(() => apps.id, { onDelete: "cascade" }),
    host: text("host").notNull(),
    kind: appDomainKindEnum("kind").notNull().default("auto_slug"),
    status: appDomainStatusEnum("status").notNull().default("reserved"),
    // Null until the first successful deployment activates a release here.
    activeReleaseId: text("active_release_id").references(
      (): AnyPgColumn => releases.id,
      { onDelete: "restrict" }
    ),
    activatedAt: timestamp("activated_at", { withTimezone: true }),
    reservedByPrincipalId: text("reserved_by_principal_id").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    // Globally unique: two apps can never claim the same production host.
    uniqueIndex("app_domains_host_unique").on(table.host),
    // One managed auto-slug domain per app (a second would be ambiguous).
    uniqueIndex("app_domains_app_kind_unique").on(table.appId, table.kind),
    index("app_domains_app_id_idx").on(table.appId),
  ]
);

// M11: one durable row per deployment (or rollback) attempt. Mirrors the
// M07/M08/M10 job contract exactly — atomic claim via SELECT … FOR UPDATE
// SKIP LOCKED, lease + heartbeat, bounded retry, cooperative cancellation,
// terminal-state protection — so a crashed worker's in-flight deployment is
// recovered rather than stranded, and a redelivered dispatch never
// double-activates a pointer.
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
    phase: deploymentPhaseEnum("phase").notNull().default("queued"),

    // True when this deployment is a ROLLBACK to an earlier release rather
    // than a forward deploy; `supersededReleaseId` records what was live
    // before it, so the pointer can be restored if activation fails.
    isRollback: boolean("is_rollback").notNull().default(false),
    supersededReleaseId: text("superseded_release_id"),

    // Idempotency: a redelivered "deploy this release" request replays this
    // row instead of creating a second deployment.
    idempotencyKey: text("idempotency_key").notNull().default(""),
    requestHash: text("request_hash").notNull().default(""),

    attemptCount: integer("attempt_count").notNull().default(0),
    // Set the instant the production pointer actually moved — the single
    // fact that distinguishes "failed before activation" (previous release
    // untouched) from "failed after activation" (auto-restore required).
    activatedAt: timestamp("activated_at", { withTimezone: true }),

    deployedByPrincipalId: text("deployed_by_principal_id").notNull(),
    deployedAt: timestamp("deployed_at", { withTimezone: true }),

    failureCode: deploymentFailureCodeEnum("failure_code"),
    // Always the safe, user-facing message (lib/deployment/errors.ts) —
    // never a raw stack trace, connection string, cookie, or token.
    failureMessage: text("failure_message"),
    errorMessage: text("error_message"),

    cancelRequestedAt: timestamp("cancel_requested_at", { withTimezone: true }),
    cancelledByPrincipalId: text("cancelled_by_principal_id"),

    leaseOwner: text("lease_owner"),
    leaseExpiresAt: timestamp("lease_expires_at", { withTimezone: true }),
    heartbeatAt: timestamp("heartbeat_at", { withTimezone: true }),

    startedAt: timestamp("started_at", { withTimezone: true }),
    completedAt: timestamp("completed_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    index("deployments_app_id_idx").on(table.appId),
    index("deployments_status_idx").on(table.status),
    index("deployments_status_lease_idx").on(
      table.status,
      table.leaseExpiresAt
    ),
    uniqueIndex("deployments_app_idempotency_unique").on(
      table.appId,
      table.idempotencyKey
    ),
  ]
);

// M11: append-only per-phase record of what a deployment actually did —
// the "safe logs" surface. `detail` is always redacted
// (lib/validation/redaction.ts, reused) before persistence; nothing here is
// ever a secret, connection string, cookie, or raw provider body.
export const deploymentSteps = pgTable(
  "deployment_steps",
  {
    id: text("id").primaryKey(),
    deploymentId: text("deployment_id")
      .notNull()
      .references(() => deployments.id, { onDelete: "cascade" }),
    appId: text("app_id")
      .notNull()
      .references(() => apps.id, { onDelete: "cascade" }),
    phase: deploymentPhaseEnum("phase").notNull(),
    ok: boolean("ok").notNull(),
    message: text("message").notNull().default(""),
    detail: jsonb("detail")
      .$type<Record<string, unknown>>()
      .notNull()
      .default({}),
    durationMs: integer("duration_ms"),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    // A phase runs at most once per deployment attempt; a retried phase
    // replaces its own row rather than accumulating duplicates.
    uniqueIndex("deployment_steps_deployment_phase_unique").on(
      table.deploymentId,
      table.phase
    ),
    index("deployment_steps_app_id_idx").on(table.appId),
  ]
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
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [index("audit_events_app_id_idx").on(table.appId)]
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
    responseSnapshot:
      jsonb("response_snapshot").$type<Record<string, unknown>>(),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    uniqueIndex("idempotency_keys_owner_scope_key_unique").on(
      table.ownerPrincipalId,
      table.scope,
      table.key
    ),
    index("idempotency_keys_app_id_idx").on(table.appId),
  ]
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
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [uniqueIndex("creation_requests_app_id_unique").on(table.appId)]
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
    templateSelection:
      jsonb("template_selection").$type<Record<string, unknown>>(),

    // RequirementsAnalysisType (@asafarim/appbuilder-ai) — the model's
    // structured read of the prompt, re-validated on every write.
    normalizedRequirements: jsonb("normalized_requirements").$type<
      Record<string, unknown>
    >(),
    // ClarificationStateType (@asafarim/appbuilder-ai) — full question/
    // answer history across every round, never overwritten, only appended.
    clarificationState: jsonb("clarification_state").$type<
      Record<string, unknown>
    >(),

    totalOperationsApplied: integer("total_operations_applied")
      .notNull()
      .default(0),

    resultingVersionNumber: integer("resulting_version_number"),
    resultingVersionId: text("resulting_version_id").references(
      (): AnyPgColumn => specificationVersions.id,
      { onDelete: "set null" }
    ),
    resultingPreviewBuildId: text("resulting_preview_build_id").references(
      (): AnyPgColumn => previewBuilds.id,
      { onDelete: "set null" }
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
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    uniqueIndex("generation_jobs_app_idempotency_unique").on(
      table.appId,
      table.idempotencyKey
    ),
    index("generation_jobs_app_id_idx").on(table.appId),
    index("generation_jobs_status_idx").on(table.status),
    index("generation_jobs_status_lease_idx").on(
      table.status,
      table.leaseExpiresAt
    ),
  ]
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
    proposedOperationCount: integer("proposed_operation_count")
      .notNull()
      .default(0),
    // Ordered ids into appliedOperations for every operation in this batch
    // that was actually applied — the durable link from "what the model
    // proposed" to "what M04 actually persisted".
    appliedOperationIds: jsonb("applied_operation_ids")
      .$type<string[]>()
      .notNull()
      .default([]),
    status: generationBatchStatusEnum("status").notNull(),
    rejectionReason: text("rejection_reason"),
    idempotencyKey: text("idempotency_key").notNull(),
    requestHash: text("request_hash").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    uniqueIndex("generation_operation_batches_job_iteration_unique").on(
      table.jobId,
      table.iteration
    ),
    index("generation_operation_batches_app_id_idx").on(table.appId),
  ]
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
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [uniqueIndex("conversations_app_id_unique").on(table.appId)]
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
      { onDelete: "set null" }
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
      { onDelete: "set null" }
    ),
    failureCode: text("failure_code"),
    // Always the safe, user-facing message — never a raw stack trace,
    // provider error string, or SQL detail (mirrors
    // lib/generation/errors.ts#safeFailureMessage's contract).
    failureMessage: text("failure_message"),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    index("conversation_messages_conversation_id_idx").on(table.conversationId),
    index("conversation_messages_app_id_idx").on(table.appId),
    index("conversation_messages_created_at_idx").on(table.createdAt),
  ]
);

// M13 slice B: a conversation attachment's durable metadata. `storageKey`
// (and `thumbnailStorageKey`) are server-generated and NEVER returned by any
// API route — stricter than M09's generatedFiles, which does return its key
// (see lib/repositories/attachments.ts's module docstring for why M13 is
// deliberately stricter here). An attachment is inserted (status `pending`)
// BEFORE the message that will reference it exists — `messageId` starts
// null and is set exactly once, transactionally, when a still-`ready`,
// still-unclaimed, same-uploader attachment is atomically claimed by a
// message at send time (see claimAttachmentsForMessage). Never hard-deleted
// except by the 24h "never claimed" retention sweep (lib/retention/sweep.ts)
// — an explicit user/owner deletion after that point is a soft tombstone
// (`status: "deleted"`, storage object already removed) so audit history
// survives.
export const conversationAttachments = pgTable(
  "conversation_attachments",
  {
    id: text("id").primaryKey(),
    appId: text("app_id")
      .notNull()
      .references(() => apps.id, { onDelete: "cascade" }),
    conversationId: text("conversation_id")
      .notNull()
      .references(() => conversations.id, { onDelete: "cascade" }),
    messageId: text("message_id").references(
      (): AnyPgColumn => conversationMessages.id,
      { onDelete: "set null" }
    ),
    uploadedByPrincipalId: text("uploaded_by_principal_id").notNull(),

    originalFilename: text("original_filename").notNull(),
    // Client-declared at init — never trusted alone. Re-derived from the
    // actual bytes at commit (see lib/attachments/sniff.ts) and compared
    // against this; a mismatch fails the commit (`mime_mismatch`).
    declaredMimeType: text("declared_mime_type").notNull(),
    declaredSizeBytes: integer("declared_size_bytes").notNull(),
    detectedMimeType: text("detected_mime_type"),
    actualSizeBytes: integer("actual_size_bytes"),
    sha256: text("sha256"),

    storageKey: text("storage_key").notNull(),
    thumbnailStorageKey: text("thumbnail_storage_key"),

    status: conversationAttachmentStatusEnum("status").notNull().default("pending"),

    // Bounded extraction output (text/markdown/json/csv today — see
    // lib/attachments/extract.ts; image/PDF text extraction is an explicit,
    // documented deferral, mirroring M09's malware-scanning deferral
    // convention). Never raw/unbounded file content.
    extractionKind: text("extraction_kind"),
    extractionVersion: text("extraction_version"),
    extractedText: text("extracted_text"),
    pageCount: integer("page_count"),
    widthPx: integer("width_px"),
    heightPx: integer("height_px"),

    failureCode: conversationAttachmentFailureCodeEnum("failure_code"),
    failureMessage: text("failure_message"),

    idempotencyKey: text("idempotency_key").notNull(),
    requestHash: text("request_hash").notNull(),

    // M13 slice G: the trace label of the HTTP request that initiated this
    // upload, so the init/commit/extraction/scan/sweep events for one file
    // join to each other and to the conversation turn that claimed it. Never
    // an authorization or lookup key (see lib/observability/correlation.ts);
    // nullable because rows predating slice G were not backfilled.
    correlationId: text("correlation_id"),

    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    uploadedAt: timestamp("uploaded_at", { withTimezone: true }),
    processedAt: timestamp("processed_at", { withTimezone: true }),
    deletedAt: timestamp("deleted_at", { withTimezone: true }),
  },
  (table) => [
    uniqueIndex("conversation_attachments_storage_key_unique").on(table.storageKey),
    uniqueIndex("conversation_attachments_app_idempotency_unique").on(
      table.appId,
      table.idempotencyKey
    ),
    index("conversation_attachments_app_id_idx").on(table.appId),
    index("conversation_attachments_conversation_id_idx").on(table.conversationId),
    index("conversation_attachments_message_id_idx").on(table.messageId),
    // The 24h "unclaimed upload" retention sweep scans exactly this shape:
    // status in (pending, uploaded) ordered/filtered by createdAt.
    index("conversation_attachments_status_created_at_idx").on(
      table.status,
      table.createdAt
    ),
    index("conversation_attachments_correlation_idx").on(table.correlationId),
  ]
);

// M13 slice D: one bounded, structured memory row per conversation — the
// thing that makes "it is still black" interpretable three turns after the
// user last named what "it" is. Deliberately NOT a prose summary column:
// every fact in these JSONB arrays carries the message ids that produced it
// and the specification version it was true at, so recall can *verify* each
// fact against the current specification and drop what no longer holds (see
// lib/modification/memory.ts#invalidateStaleFacts) instead of feeding a
// model a confidently wrong pointer at a page somebody archived. One row per
// conversation (unique index below), rewritten in place — memory is current
// state, not an append-only log; the conversation messages themselves are
// the durable history, and `sourceMessageIds` is the link back to them.
export const conversationMemories = pgTable(
  "conversation_memories",
  {
    id: text("id").primaryKey(),
    appId: text("app_id")
      .notNull()
      .references(() => apps.id, { onDelete: "cascade" }),
    conversationId: text("conversation_id")
      .notNull()
      .references(() => conversations.id, { onDelete: "cascade" }),

    // Bumped on every write. Lets a concurrent writer detect that it read a
    // stale copy without holding a transaction open across a provider call.
    revision: integer("revision").notNull().default(0),

    // The specification version the memory was last written against —
    // recall compares this (and each fact's own version stamp) against the
    // current version to decide what survived.
    specificationVersionNumber: integer("specification_version_number")
      .notNull()
      .default(0),

    // MemoryReference[] / MemoryAssumption[] / MemoryPreference[]
    // (lib/modification/memory.ts). Bounded by MEMORY_LIMITS before every
    // write — never unbounded accumulation.
    references: jsonb("references")
      .$type<Record<string, unknown>[]>()
      .notNull()
      .default([]),
    assumptions: jsonb("assumptions")
      .$type<Record<string, unknown>[]>()
      .notNull()
      .default([]),
    preferences: jsonb("preferences")
      .$type<Record<string, unknown>[]>()
      .notNull()
      .default([]),

    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    uniqueIndex("conversation_memories_conversation_id_unique").on(
      table.conversationId
    ),
    index("conversation_memories_app_id_idx").on(table.appId),
  ]
);

// M13 slice F: one row per public HTTPS URL a conversation has imported —
// simultaneously the durable reference AND its cache. The unique index on
// (app_id, source_url) is what makes that safe: a re-import of the same URL
// refreshes this row in place instead of accumulating a new row per fetch, so
// "how many outbound requests has this app made" stays bounded by the quota
// and not by how often someone clicks Import.
//
// Deliberately NOT claimed by a message the way conversation_attachments are.
// An attachment is a one-shot upload whose bytes belong to the message that
// sent them; a reference is an addressable, re-fetchable, cacheable pointer
// at somebody else's server, shared by every turn that mentions it. Binding
// it to one message would mean re-fetching the same URL for the next turn.
//
// Freshness is never stored (see conversation_reference_status): `fetched_at`
// + `cache_expires_at` + `failure_code` are the raw facts, and
// lib/references/provenance.ts#freshnessOfRow derives cached/stale/
// unavailable from them at read time. `extracted_text` is bounded remote
// content and is always treated as untrusted prompt data.
export const conversationReferences = pgTable(
  "conversation_references",
  {
    id: text("id").primaryKey(),
    appId: text("app_id")
      .notNull()
      .references(() => apps.id, { onDelete: "cascade" }),
    conversationId: text("conversation_id")
      .notNull()
      .references(() => conversations.id, { onDelete: "cascade" }),
    importedByPrincipalId: text("imported_by_principal_id").notNull(),

    // The normalized URL the user asked for (lib/references/urlPolicy.ts#
    // normalizeReferenceUrl) — the cache key, and what provenance reports as
    // the source.
    sourceUrl: text("source_url").notNull(),
    // Where the fetch actually ended up: after redirects, or the API
    // endpoint an adapter used instead of the page.
    finalUrl: text("final_url"),
    host: text("host").notNull(),

    adapter: conversationReferenceAdapterEnum("adapter").notNull(),
    adapterVersion: text("adapter_version").notNull(),

    status: conversationReferenceStatusEnum("status").notNull().default("unavailable"),

    title: text("title"),
    contentType: text("content_type"),
    // Bounded (REFERENCE_LIMITS.MAX_EXTRACTED_TEXT_CHARS) remote text.
    extractedText: text("extracted_text"),
    // ReferenceFact[] (lib/references/limits.ts) — labelled values an adapter
    // projected out of the response. Remote data, wrapped as untrusted at
    // prompt-build time exactly like extracted_text.
    facts: jsonb("facts").$type<Record<string, unknown>[]>().notNull().default([]),
    // SHA-256 over the extracted text + facts, so a refresh can report
    // "unchanged" without diffing content.
    contentHash: text("content_hash"),
    originalChars: integer("original_chars"),
    truncated: boolean("truncated").notNull().default(false),

    // When the content above was fetched, and when it stops being reusable
    // without a re-fetch. Persisted (not recomputed from a constant) so
    // changing the TTL never silently re-validates rows fetched under the
    // old one.
    fetchedAt: timestamp("fetched_at", { withTimezone: true }),
    cacheExpiresAt: timestamp("cache_expires_at", { withTimezone: true }),
    refreshCount: integer("refresh_count").notNull().default(0),

    // Set when the MOST RECENT fetch attempt failed, even when older content
    // is still stored — which is exactly what downgrades freshness to
    // `stale` rather than letting a failed refresh keep the `cached` label.
    // Cleared on a successful fetch.
    failureCode: conversationReferenceFailureCodeEnum("failure_code"),
    failureMessage: text("failure_message"),

    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    deletedAt: timestamp("deleted_at", { withTimezone: true }),
  },
  (table) => [
    uniqueIndex("conversation_references_app_source_url_unique").on(
      table.appId,
      table.sourceUrl
    ),
    index("conversation_references_app_id_idx").on(table.appId),
    index("conversation_references_conversation_id_idx").on(
      table.conversationId
    ),
    index("conversation_references_status_fetched_at_idx").on(
      table.status,
      table.fetchedAt
    ),
  ]
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
      .references((): AnyPgColumn => conversationMessages.id, {
        onDelete: "cascade",
      }),

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

    // M13 slice G: the trace label of the HTTP request that enqueued this
    // job, carried through every phase, provider call, operational event,
    // and — via modification_plans — every later step's job, so one
    // conversational change reads as one thread. Captured at enqueue and
    // never rewritten afterwards; see lib/observability/correlation.ts for
    // why accepting it from a caller is safe.
    correlationId: text("correlation_id"),

    // Re-checked against specifications.currentVersionNumber immediately
    // before applying — a spec edited elsewhere mid-job fails safely
    // (stale_base_version) rather than silently overwriting it.
    baseVersionNumber: integer("base_version_number").notNull(),

    // Bounded preview-selection context (see
    // lib/modification/selectionContext.ts) — stable spec identifiers only.
    selectionContext:
      jsonb("selection_context").$type<Record<string, unknown>>(),

    // Truncated copy of the user's free-text request, bounded at the API
    // layer (see lib/validation/conversations.ts) before being persisted —
    // this is what the provider is actually asked about.
    userRequestText: text("user_request_text").notNull(),

    // ModificationAnalysisType (@asafarim/appbuilder-ai) — the model's
    // structured read of the request, re-validated on every write.
    normalizedRequest:
      jsonb("normalized_request").$type<Record<string, unknown>>(),

    // M13 slice D: the SAFE SUMMARY of what this job's interpretation was
    // grounded in — included/omitted/truncated source ids, token estimate,
    // redaction flags, the deterministic resolver outcome, and the resolved
    // target. M13 is explicit that we "persist a safe manifest summary, not
    // raw prompts": there is deliberately no column here for the assembled
    // prompt, the conversation text, or extracted attachment content, so an
    // operator can audit *what* grounded a decision without the audit trail
    // itself becoming a second copy of the user's private files.
    contextManifest: jsonb("context_manifest").$type<Record<string, unknown>>(),

    // M13 slice E: ModificationClarificationStateType
    // (@asafarim/appbuilder-ai) — at most two rounds, each with its own
    // question, contextVersion, expiry, and (once answered) answer. Set
    // only while/after this job has paused for clarification; a job that
    // never asked stays null. See lib/repositories/modificationJobs.ts#
    // submitClarificationAnswer.
    clarificationState: jsonb("clarification_state").$type<Record<string, unknown>>(),

    // M13 slice E: set when this job is executing one step of a
    // multi-step modification_plans row — null for an ordinary single-step
    // job. The reverse pointer (modification_plan_steps.
    // modification_job_id) is set atomically alongside this one; see
    // lib/repositories/modificationPlans.ts.
    planStepId: text("plan_step_id").references((): AnyPgColumn => modificationPlanSteps.id, {
      onDelete: "set null",
    }),

    totalOperationsApplied: integer("total_operations_applied")
      .notNull()
      .default(0),

    // Confirmation binding (issue requirement: "bind to actor, app, base
    // version, exact proposal checksum; expire; single-use; fail if base
    // version changed; never come from the model"). Folded directly onto
    // this row rather than a separate table since a modification job has
    // exactly one confirmation cycle for its one operation batch.
    confirmationRequired: boolean("confirmation_required")
      .notNull()
      .default(false),
    confirmationChecksum: text("confirmation_checksum"),
    confirmationBaseVersionNumber: integer("confirmation_base_version_number"),
    confirmationExpiresAt: timestamp("confirmation_expires_at", {
      withTimezone: true,
    }),
    confirmationConfirmedAt: timestamp("confirmation_confirmed_at", {
      withTimezone: true,
    }),
    confirmationConfirmedByPrincipalId: text(
      "confirmation_confirmed_by_principal_id"
    ),

    resultingVersionNumber: integer("resulting_version_number"),
    resultingVersionId: text("resulting_version_id").references(
      (): AnyPgColumn => specificationVersions.id,
      { onDelete: "set null" }
    ),
    resultingPreviewBuildId: text("resulting_preview_build_id").references(
      (): AnyPgColumn => previewBuilds.id,
      { onDelete: "set null" }
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
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    uniqueIndex("modification_jobs_app_idempotency_unique").on(
      table.appId,
      table.idempotencyKey
    ),
    index("modification_jobs_app_id_idx").on(table.appId),
    index("modification_jobs_conversation_id_idx").on(table.conversationId),
    index("modification_jobs_status_idx").on(table.status),
    index("modification_jobs_status_lease_idx").on(
      table.status,
      table.leaseExpiresAt
    ),
    index("modification_jobs_plan_step_id_idx").on(table.planStepId),
    // M13 slice G: "show me everything that happened to this request" is the
    // one operator query that has to be cheap, and it starts here before
    // fanning out to operational_events' own correlation index.
    index("modification_jobs_correlation_idx").on(table.correlationId),
  ]
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
    proposedOperationCount: integer("proposed_operation_count")
      .notNull()
      .default(0),
    // Ordered ids into appliedOperations for every operation actually
    // applied (before any confirmation-gated ones) — same durable link
    // convention as generationOperationBatches.appliedOperationIds.
    appliedOperationIds: jsonb("applied_operation_ids")
      .$type<string[]>()
      .notNull()
      .default([]),
    // { operation: unknown; reason: string }[] — proposed operations that
    // failed structural/semantic validation and were never applied.
    rejectedOperations: jsonb("rejected_operations")
      .$type<Record<string, unknown>[]>()
      .notNull()
      .default([]),
    // { operation: unknown; classification: string; details: string[] }[] —
    // proposed operations M04 classified as destructive, held pending
    // confirmation. Cleared (moved into appliedOperationIds or dropped) once
    // the confirmation cycle resolves.
    destructiveOperations: jsonb("destructive_operations")
      .$type<Record<string, unknown>[]>()
      .notNull()
      .default([]),
    status: modificationBatchStatusEnum("status").notNull().default("proposed"),
    idempotencyKey: text("idempotency_key").notNull(),
    requestHash: text("request_hash").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    uniqueIndex("modification_operation_batches_job_unique").on(table.jobId),
    index("modification_operation_batches_app_id_idx").on(table.appId),
  ]
);

// M13 slice E: one row per multi-step modification plan (docs/appbuilder-
// m13-multimodal-contextual-assistant.md, "`modification_plans` and
// `modification_plan_steps`"). Created only when a decision's outcome is
// `ready` with more than one planned step, or `partially_supported` (which
// always carries a plan alongside its honest gaps) — an ordinary
// single-step `ready` decision never allocates a plan row, so the common
// case pays no extra write. `capabilityAssessment` is the safe, structured
// record of what was judged supported/partially-supported/unsupported at
// creation time (assumptions + capability gaps), mirroring
// modificationJobs.contextManifest's "safe summary, never raw prompt"
// convention.
export const modificationPlans = pgTable(
  "modification_plans",
  {
    id: text("id").primaryKey(),
    appId: text("app_id")
      .notNull()
      .references(() => apps.id, { onDelete: "cascade" }),
    conversationId: text("conversation_id")
      .notNull()
      .references(() => conversations.id, { onDelete: "cascade" }),
    triggeringMessageId: text("triggering_message_id")
      .notNull()
      .references((): AnyPgColumn => conversationMessages.id, { onDelete: "cascade" }),
    status: modificationPlanStatusEnum("status").notNull().default("draft"),
    // The specification version this plan was proposed against — each
    // step's own job independently re-checks the live version before
    // applying (same stale-base-version protection every modification job
    // already has), so this is provenance, not a second authority.
    baseVersionNumber: integer("base_version_number").notNull(),
    summary: text("summary").notNull().default(""),
    capabilityAssessment: jsonb("capability_assessment").$type<Record<string, unknown>>().notNull().default({}),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index("modification_plans_app_id_idx").on(table.appId),
    index("modification_plans_conversation_id_idx").on(table.conversationId),
  ]
);

// M13 slice E: one row per planned step. `operationBatch` is the step's
// OperationBatchType draft (@asafarim/appbuilder-ai), persisted at plan-
// creation time so advancing to a later step never needs to re-ask the
// model what that step was — only WHETHER it still applies cleanly against
// the (possibly since-changed) live specification, which its own job
// re-derives for real via the unchanged single-step pipeline.
// `modificationJobId` is null until this step's job is created (steps
// beyond the first are created lazily as earlier steps complete — see
// lib/modification/pipeline.ts).
export const modificationPlanSteps = pgTable(
  "modification_plan_steps",
  {
    id: text("id").primaryKey(),
    planId: text("plan_id")
      .notNull()
      .references(() => modificationPlans.id, { onDelete: "cascade" }),
    appId: text("app_id")
      .notNull()
      .references(() => apps.id, { onDelete: "cascade" }),
    stepNumber: integer("step_number").notNull(),
    title: text("title").notNull(),
    operationBatch: jsonb("operation_batch").$type<Record<string, unknown>>().notNull(),
    status: modificationPlanStepStatusEnum("status").notNull().default("pending"),
    modificationJobId: text("modification_job_id").references((): AnyPgColumn => modificationJobs.id, {
      onDelete: "set null",
    }),
    resultingVersionNumber: integer("resulting_version_number"),
    failureCode: modificationJobFailureCodeEnum("failure_code"),
    failureMessage: text("failure_message"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    uniqueIndex("modification_plan_steps_plan_step_unique").on(table.planId, table.stepNumber),
    index("modification_plan_steps_app_id_idx").on(table.appId),
    index("modification_plan_steps_modification_job_id_idx").on(table.modificationJobId),
  ]
);

// ─── M09: generated-app membership, records, relations, files, activity,
// notifications, workflows, and row-access rules. Every table below is
// scoped by `appId` on every row — see docs/appbuilder-m09-data-engine.md
// for the full design writeup. ──────────────────────────────────────────

// A person's access to the FINISHED, generated app — distinct from
// `collaborators` (M03), which governs the AppBuilder *development*
// workspace. `roleIds` references role ids defined in the pinned
// specification (never invented ad hoc) — validated at write time by
// lib/generated-data/membership.ts, not enforced by a DB constraint (roles
// live in JSONB spec payloads, not a queryable table).
export const generatedAppMembers = pgTable(
  "generated_app_members",
  {
    id: text("id").primaryKey(),
    appId: text("app_id")
      .notNull()
      .references(() => apps.id, { onDelete: "cascade" }),
    // M11: immutable data-environment boundary. A person may legitimately be
    // a member of the same app in BOTH environments with different roles
    // (e.g. an admin in preview for testing, an ordinary employee in
    // production), so this belongs in the uniqueness key below.
    environment: generatedEnvironmentEnum("environment")
      .notNull()
      .default("preview"),
    principalId: text("principal_id").notNull(),
    roleIds: jsonb("role_ids").$type<string[]>().notNull().default([]),
    status: generatedMemberStatusEnum("status").notNull().default("active"),
    provenance: generatedMemberProvenanceEnum("provenance").notNull(),
    invitedByPrincipalId: text("invited_by_principal_id"),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    uniqueIndex("generated_app_members_app_env_principal_unique").on(
      table.appId,
      table.environment,
      table.principalId
    ),
    index("generated_app_members_app_env_idx").on(
      table.appId,
      table.environment
    ),
  ]
);

// One row per generated record, of any entity. `data` holds only
// already-validated field values (lib/generated-data/validation.ts) — never
// raw/unvalidated client input. `revision` is the optimistic-concurrency
// counter (bumped on every update); `specVersionNumber` is the pinned
// specification version this row's `data` was last validated against (see
// schema-evolution handling).
export const generatedRecords = pgTable(
  "generated_records",
  {
    id: text("id").primaryKey(),
    appId: text("app_id")
      .notNull()
      .references(() => apps.id, { onDelete: "cascade" }),
    // M11: immutable data-environment boundary — stamped at insert, never
    // updated. Every read predicate in lib/generated-data/* filters on it.
    environment: generatedEnvironmentEnum("environment")
      .notNull()
      .default("preview"),
    entityId: text("entity_id").notNull(),
    specVersionNumber: integer("spec_version_number").notNull(),
    revision: integer("revision").notNull().default(1),
    data: jsonb("data").$type<Record<string, unknown>>().notNull().default({}),
    status: generatedRecordStatusEnum("status").notNull().default("active"),
    createdByPrincipalId: text("created_by_principal_id").notNull(),
    updatedByPrincipalId: text("updated_by_principal_id").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    archivedAt: timestamp("archived_at", { withTimezone: true }),
  },
  (table) => [
    index("generated_records_app_env_entity_idx").on(
      table.appId,
      table.environment,
      table.entityId
    ),
    index("generated_records_app_env_entity_status_idx").on(
      table.appId,
      table.environment,
      table.entityId,
      table.status
    ),
  ]
);

// Append-only snapshot of a record's `data` immediately BEFORE each update
// — never mutated/deleted. The full pre-image (not a diff) so history can
// be reconstructed without replaying every intermediate operation.
export const generatedRecordRevisions = pgTable(
  "generated_record_revisions",
  {
    id: text("id").primaryKey(),
    recordId: text("record_id")
      .notNull()
      .references(() => generatedRecords.id, { onDelete: "cascade" }),
    appId: text("app_id")
      .notNull()
      .references(() => apps.id, { onDelete: "cascade" }),
    // Denormalized from the parent record for query-scoping symmetry — the
    // (recordId, revision) unique below is already environment-safe because
    // recordId itself belongs to exactly one environment.
    environment: generatedEnvironmentEnum("environment")
      .notNull()
      .default("preview"),
    entityId: text("entity_id").notNull(),
    revision: integer("revision").notNull(),
    data: jsonb("data").$type<Record<string, unknown>>().notNull(),
    changedByPrincipalId: text("changed_by_principal_id").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    uniqueIndex("generated_record_revisions_record_revision_unique").on(
      table.recordId,
      table.revision
    ),
    index("generated_record_revisions_app_env_idx").on(
      table.appId,
      table.environment
    ),
  ]
);

// Denormalized relation edges — maintained transactionally alongside
// `relation`-typed field writes on `generatedRecords.data` (never the sole
// source of truth for a relation's *value*, only an indexed projection of
// it) so reverse lookups ("all tasks for project X") don't require a JSONB
// scan. `relationId` is the M04 spec's Relation.id, validated to exist and
// bind two entities in the SAME app on every write.
export const generatedRecordRelations = pgTable(
  "generated_record_relations",
  {
    id: text("id").primaryKey(),
    appId: text("app_id")
      .notNull()
      .references(() => apps.id, { onDelete: "cascade" }),
    // Denormalized from the endpoint records. A relation edge may NEVER span
    // two environments — lib/generated-data/relations.ts asserts both
    // endpoints resolve within the same (appId, environment) before
    // inserting, and every edge read filters on it.
    environment: generatedEnvironmentEnum("environment")
      .notNull()
      .default("preview"),
    relationId: text("relation_id").notNull(),
    fromRecordId: text("from_record_id")
      .notNull()
      .references(() => generatedRecords.id, { onDelete: "cascade" }),
    toRecordId: text("to_record_id")
      .notNull()
      .references(() => generatedRecords.id, { onDelete: "cascade" }),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    uniqueIndex("generated_record_relations_unique").on(
      table.relationId,
      table.fromRecordId,
      table.toRecordId
    ),
    index("generated_record_relations_app_env_idx").on(
      table.appId,
      table.environment
    ),
    index("generated_record_relations_to_record_idx").on(table.toRecordId),
  ]
);

// Normalized uniqueness claims for `unique: true` fields — a claim row is
// inserted transactionally alongside the record write it backs; the unique
// index below is what actually enforces uniqueness at the database level
// (JSONB alone cannot). `valueHash` is a normalized (trimmed/lowercased
// where the field type calls for it) hash of the field's value, never the
// raw value itself, so this index works uniformly across field types.
export const generatedUniquenessClaims = pgTable(
  "generated_uniqueness_claims",
  {
    id: text("id").primaryKey(),
    appId: text("app_id")
      .notNull()
      .references(() => apps.id, { onDelete: "cascade" }),
    // M11 CRITICAL: without `environment` in the unique index below, a demo
    // record seeded in preview (e.g. team member "morgan@example.test")
    // would permanently occupy that unique value and make it impossible for
    // a REAL production user to ever register the same email. Uniqueness is
    // a per-environment property.
    environment: generatedEnvironmentEnum("environment")
      .notNull()
      .default("preview"),
    entityId: text("entity_id").notNull(),
    fieldId: text("field_id").notNull(),
    valueHash: text("value_hash").notNull(),
    recordId: text("record_id")
      .notNull()
      .references(() => generatedRecords.id, { onDelete: "cascade" }),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    uniqueIndex("generated_uniqueness_claims_unique").on(
      table.appId,
      table.environment,
      table.entityId,
      table.fieldId,
      table.valueHash
    ),
  ]
);

// File metadata for generated-app `file`/`image` fields. `storageKey` is
// always server-generated (lib/generated-data/files.ts#buildKey-style
// helper) — never the client's original filename or a client-supplied
// path. `recordId` is nullable because an upload may be initiated before
// the record it will attach to exists (a create form's file field).
export const generatedFiles = pgTable(
  "generated_files",
  {
    id: text("id").primaryKey(),
    appId: text("app_id")
      .notNull()
      .references(() => apps.id, { onDelete: "cascade" }),
    // M11: also encoded into the server-generated storage key
    // (`generated/{appId}/{environment}/{entityId}/…`) and into the HMAC
    // download-token payload, so a preview token can never be replayed
    // against a production object even if the file id were guessed.
    environment: generatedEnvironmentEnum("environment")
      .notNull()
      .default("preview"),
    entityId: text("entity_id").notNull(),
    recordId: text("record_id").references(
      (): AnyPgColumn => generatedRecords.id,
      { onDelete: "set null" }
    ),
    fieldId: text("field_id").notNull(),
    storageKey: text("storage_key").notNull(),
    originalFilename: text("original_filename").notNull(),
    mimeType: text("mime_type").notNull(),
    sizeBytes: integer("size_bytes").notNull(),
    status: generatedFileStatusEnum("status").notNull().default("pending"),
    uploadedByPrincipalId: text("uploaded_by_principal_id").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    committedAt: timestamp("committed_at", { withTimezone: true }),
    archivedAt: timestamp("archived_at", { withTimezone: true }),
  },
  (table) => [
    uniqueIndex("generated_files_storage_key_unique").on(table.storageKey),
    index("generated_files_app_env_idx").on(table.appId, table.environment),
    index("generated_files_record_id_idx").on(table.recordId),
  ]
);

// Append-only activity feed — never updated/deleted. `actorPrincipalId` is
// null only for `actorKind: "workflow"` entries (the workflow executor has
// no session of its own; it always replays the triggering user's identity
// for authorization, but the activity entry itself is attributed to the
// workflow so the distinction stays visible in the feed).
export const generatedActivity = pgTable(
  "generated_activity",
  {
    id: text("id").primaryKey(),
    appId: text("app_id")
      .notNull()
      .references(() => apps.id, { onDelete: "cascade" }),
    environment: generatedEnvironmentEnum("environment")
      .notNull()
      .default("preview"),
    entityId: text("entity_id").notNull(),
    recordId: text("record_id").references(
      (): AnyPgColumn => generatedRecords.id,
      { onDelete: "cascade" }
    ),
    action: text("action").notNull(),
    actorPrincipalId: text("actor_principal_id"),
    actorKind: text("actor_kind").notNull(),
    metadata: jsonb("metadata").$type<Record<string, unknown>>().default({}),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    index("generated_activity_app_env_idx").on(table.appId, table.environment),
    index("generated_activity_record_id_idx").on(table.recordId),
  ]
);

export const generatedNotifications = pgTable(
  "generated_notifications",
  {
    id: text("id").primaryKey(),
    appId: text("app_id")
      .notNull()
      .references(() => apps.id, { onDelete: "cascade" }),
    // M11: without this, demo notifications generated by a preview workflow
    // would appear in a real production user's inbox for the same app.
    environment: generatedEnvironmentEnum("environment")
      .notNull()
      .default("preview"),
    recipientPrincipalId: text("recipient_principal_id").notNull(),
    title: text("title").notNull(),
    body: text("body").notNull(),
    relatedRecordId: text("related_record_id").references(
      (): AnyPgColumn => generatedRecords.id,
      { onDelete: "set null" }
    ),
    read: boolean("read").notNull().default(false),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    index("generated_notifications_app_env_recipient_idx").on(
      table.appId,
      table.environment,
      table.recipientPrincipalId
    ),
  ]
);

// One durable row per workflow trigger event. Runs synchronously in-request
// (see lib/generated-data/workflows.ts) rather than through an async
// worker/queue — every allowlisted step (updateField/sendNotification/
// runAction/condition) is a fast, bounded DB write, so there is no need for
// M07/M08-style async job dispatch here. Still a real durable row: the
// UNIQUE (appId, idempotencyKey) index is what makes a retried record
// mutation (same idempotency key) never re-run — and therefore never
// re-notify/re-activity-log — a workflow that already executed for that
// exact trigger.
export const generatedWorkflowExecutions = pgTable(
  "generated_workflow_executions",
  {
    id: text("id").primaryKey(),
    appId: text("app_id")
      .notNull()
      .references(() => apps.id, { onDelete: "cascade" }),
    // M11 CRITICAL: the idempotency key is derived from
    // (workflowId, recordId, revision, triggerKind) — all of which can
    // legitimately repeat across environments. Without `environment` in the
    // unique index below, a preview execution would make the production
    // runtime believe that workflow had already run, silently suppressing a
    // real notification/activity entry.
    environment: generatedEnvironmentEnum("environment")
      .notNull()
      .default("preview"),
    workflowId: text("workflow_id").notNull(),
    triggerRecordId: text("trigger_record_id")
      .notNull()
      .references(() => generatedRecords.id, { onDelete: "cascade" }),
    triggerRevision: integer("trigger_revision").notNull(),
    triggerKind: text("trigger_kind").notNull(),
    status: generatedWorkflowExecutionStatusEnum("status").notNull(),
    idempotencyKey: text("idempotency_key").notNull(),
    attemptCount: integer("attempt_count").notNull().default(1),
    failureMessage: text("failure_message"),
    startedAt: timestamp("started_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    completedAt: timestamp("completed_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    uniqueIndex("generated_workflow_executions_idempotency_unique").on(
      table.appId,
      table.environment,
      table.idempotencyKey
    ),
    index("generated_workflow_executions_app_env_idx").on(
      table.appId,
      table.environment
    ),
  ]
);

export const generatedWorkflowStepExecutions = pgTable(
  "generated_workflow_step_executions",
  {
    id: text("id").primaryKey(),
    executionId: text("execution_id")
      .notNull()
      .references(() => generatedWorkflowExecutions.id, {
        onDelete: "cascade",
      }),
    stepId: text("step_id").notNull(),
    status: generatedWorkflowStepStatusEnum("status").notNull(),
    resultMetadata: jsonb("result_metadata")
      .$type<Record<string, unknown>>()
      .default({}),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    uniqueIndex("generated_workflow_step_executions_unique").on(
      table.executionId,
      table.stepId
    ),
  ]
);

// Generic idempotency ledger for record mutations (create/update/archive/
// restore) — mirrors idempotencyKeys' role for M05 app-creation, scoped
// additionally by entityId since two different entities in the same app
// must never collide on the same key.
export const generatedDataIdempotency = pgTable(
  "generated_data_idempotency",
  {
    id: text("id").primaryKey(),
    appId: text("app_id")
      .notNull()
      .references(() => apps.id, { onDelete: "cascade" }),
    // M11 CRITICAL: idempotency keys here are CLIENT-supplied. Without
    // `environment` in the unique index below, a client could replay a
    // preview response snapshot into production (or vice versa) simply by
    // reusing its own key across the two environments.
    environment: generatedEnvironmentEnum("environment")
      .notNull()
      .default("preview"),
    entityId: text("entity_id").notNull(),
    scope: text("scope").notNull(),
    idempotencyKey: text("idempotency_key").notNull(),
    requestHash: text("request_hash").notNull(),
    responseSnapshot:
      jsonb("response_snapshot").$type<Record<string, unknown>>(),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    uniqueIndex("generated_data_idempotency_unique").on(
      table.appId,
      table.environment,
      table.entityId,
      table.scope,
      table.idempotencyKey
    ),
  ]
);

// Declarative, allowlisted row-access rules (lib/generated-data/
// runtimeAuth.ts) — NEVER eval'd, NEVER a generated SQL fragment. Seeded
// today only by the M09 demo seed (lib/generated-data/seed.ts); a builder
// UI to configure these is future work (see docs deferrals). At most one
// rule per (appId, entityId, roleId, verb) — absence means "no row-level
// narrowing beyond the entity-level permission" (i.e. every row the
// permission allows).
export const generatedRowAccessRules = pgTable(
  "generated_row_access_rules",
  {
    id: text("id").primaryKey(),
    appId: text("app_id")
      .notNull()
      .references(() => apps.id, { onDelete: "cascade" }),
    // Row-access rules are environment-scoped so a permissive preview rule
    // (seeded for demo convenience) can never widen production access.
    environment: generatedEnvironmentEnum("environment")
      .notNull()
      .default("preview"),
    entityId: text("entity_id").notNull(),
    roleId: text("role_id").notNull(),
    verb: text("verb").notNull(),
    ruleKind: generatedRowAccessRuleKindEnum("rule_kind").notNull(),
    // Shape depends on ruleKind: {} for "all"/"own"; { assigneeFieldId } for
    // "assigned"; { parentRelationId } for "relatedToParent".
    ruleConfig: jsonb("rule_config")
      .$type<Record<string, unknown>>()
      .notNull()
      .default({}),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    uniqueIndex("generated_row_access_rules_unique").on(
      table.appId,
      table.environment,
      table.entityId,
      table.roleId,
      table.verb
    ),
  ]
);

// ─── M10: validation gates, preview QA, and the bounded AI repair loop.
// A validation run is pinned to an IMMUTABLE (specificationVersionId,
// specificationChecksum, previewBuildId, registryVersion, gateSetVersion)
// tuple at creation time and never re-derives any of those from the app's
// *current* state afterward — rerunning validation for a changed spec always
// means creating a NEW run, never mutating an old one's pinned identity or
// its terminal gate results/artifacts. See docs/appbuilder-m10-validation-qa.md.
export const validationRunStatusEnum = pgEnum("validation_run_status", [
  "pending",
  "running",
  "passed",
  "failed",
  "infrastructure_error",
  "flaky",
  "cancelled",
]);

// A gate's own status is a superset of the run's (adds "skipped" — a gate
// that legitimately does not apply, e.g. workflow idempotency on a
// specification with zero workflows — which must never be confused with
// "passed": a skipped mandatory gate does NOT count toward release
// eligibility; only an explicitly PASSED mandatory gate does).
export const validationGateStatusEnum = pgEnum("validation_gate_status", [
  "pending",
  "running",
  "passed",
  "failed",
  "skipped",
  "infrastructure_error",
  "flaky",
  "cancelled",
]);

// How a validation run was requested — never a builder-facing distinction of
// trust, only provenance. A repair-triggered revalidation is otherwise
// identical to a manually requested one (same gates, same pinning contract).
export const validationRequestSourceEnum = pgEnum("validation_request_source", [
  "manual",
  "repair",
  "api",
]);

export const validationArtifactKindEnum = pgEnum("validation_artifact_kind", [
  "screenshot",
  "trace",
  "report",
  "log",
  "summary",
]);

// The bounded AI repair loop's own job lifecycle — deliberately its own
// state machine (see lib/repair/stateMachine.ts), not a repurposing of
// modification_job_status, even though "propose -> dry-run -> confirm ->
// apply" is the identical shape reused from M08 (lib/modification/pipeline.ts).
// The extra `revalidating` phase is what modification jobs never have: a
// repair is not "done" when M04 accepts the new version, only when a fresh
// validation run against that new version has actually passed.
export const repairAttemptStatusEnum = pgEnum("repair_attempt_status", [
  "queued",
  "classifying",
  "proposing",
  "awaiting_confirmation",
  "applying",
  "revalidating",
  "completed",
  "failed",
  "cancelled",
]);

// Closed failure-classification vocabulary (issue requirement: "distinguish
// product bugs, infrastructure failures, flaky tests, and user-spec
// errors"). `infrastructure_failure`/`flaky_test`/`cancellation` are NEVER
// repairable — lib/repair/classify.ts's classifier is the one place that
// decides membership, and the repair pipeline refuses to even attempt a
// repair for those three no matter how many attempts remain.
export const repairFailureClassificationEnum = pgEnum(
  "repair_failure_classification",
  [
    "user_specification_error",
    "supported_repairable_configuration_error",
    "unsupported_product_capability",
    "test_failure",
    "accessibility_failure",
    "security_policy_failure",
    "migration_data_safety_failure",
    "provider_failure",
    "infrastructure_failure",
    "flaky_test",
    "cancellation",
  ]
);

export const repairJobFailureCodeEnum = pgEnum("repair_job_failure_code", [
  "invalid_request",
  "not_repairable",
  "provider_configuration_error",
  "provider_rate_limit",
  "provider_unavailable",
  /** See generationJobFailureCodeEnum's note — same distinction, same reason. */
  "provider_timeout",
  "malformed_provider_response",
  "forbidden_operation",
  "specification_validation_failed",
  "stale_base_version",
  "authorization_lost",
  "preview_failed",
  "confirmation_expired",
  "confirmation_invalid",
  "revalidation_failed",
  "repair_budget_exhausted",
  "worker_infrastructure_error",
  "cancelled",
]);

// One row per validation run. Pinned identity columns
// (specificationVersionId/specificationChecksum/previewBuildId/
// previewChecksum/registryVersion/gateSetVersion) are set once at creation
// and never updated afterward — only `status`/lease/timestamp/rollup
// columns are mutated while the run is non-terminal. `triggeringRepairAttemptId`
// is set only for a revalidation run created BY a repair attempt's own
// "new preview -> revalidate" step (see lib/repair/pipeline.ts); null for a
// manually/API-requested run.
export const validationRuns = pgTable(
  "validation_runs",
  {
    id: text("id").primaryKey(),
    appId: text("app_id")
      .notNull()
      .references(() => apps.id, { onDelete: "cascade" }),
    specificationVersionId: text("specification_version_id")
      .notNull()
      .references(() => specificationVersions.id, { onDelete: "cascade" }),
    specificationChecksum: text("specification_checksum").notNull(),
    // Nullable only for the brief window before the pinned preview build has
    // been resolved during run creation; every run that actually reaches
    // `running` has this set (see lib/repositories/validationRuns.ts).
    previewBuildId: text("preview_build_id").references(
      (): AnyPgColumn => previewBuilds.id,
      { onDelete: "set null" }
    ),
    previewChecksum: text("preview_checksum"),
    // @asafarim/appbuilder-runtime's REGISTRY_VERSION at run time — a
    // registry upgrade never silently reinterprets an old run's evidence
    // under new rendering behavior.
    registryVersion: text("registry_version").notNull(),
    // lib/validation/gates/registry.ts's GATE_SET_VERSION — bumping the gate
    // catalog (adding/removing/materially changing a gate) never
    // retroactively reinterprets an old run's recorded gate list.
    gateSetVersion: text("gate_set_version").notNull(),
    requestSource: validationRequestSourceEnum("request_source")
      .notNull()
      .default("manual"),
    requestedByPrincipalId: text("requested_by_principal_id").notNull(),
    triggeringRepairAttemptId: text("triggering_repair_attempt_id").references(
      (): AnyPgColumn => repairAttempts.id,
      { onDelete: "set null" }
    ),
    status: validationRunStatusEnum("status").notNull().default("pending"),
    idempotencyKey: text("idempotency_key").notNull(),
    requestHash: text("request_hash").notNull(),
    mandatoryGatesTotal: integer("mandatory_gates_total").notNull().default(0),
    mandatoryGatesPassed: integer("mandatory_gates_passed")
      .notNull()
      .default(0),
    // Issue requirement: "only a fully passing approved preview version
    // becomes release-eligible." Computed and stamped exactly once, when the
    // run reaches a terminal state (see
    // lib/validation/eligibility.ts#computeReleaseEligibility) — never
    // recomputed afterward, and never true for a non-`passed` run.
    releaseEligible: boolean("release_eligible").notNull().default(false),
    failureCode: text("failure_code"),
    failureMessage: text("failure_message"),
    cancelRequestedAt: timestamp("cancel_requested_at", { withTimezone: true }),
    cancelledByPrincipalId: text("cancelled_by_principal_id"),
    // Worker crash-recovery lease — identical mechanics to
    // modification_jobs (see lib/repositories/validationRuns.ts#claimInternal).
    leaseOwner: text("lease_owner"),
    leaseExpiresAt: timestamp("lease_expires_at", { withTimezone: true }),
    heartbeatAt: timestamp("heartbeat_at", { withTimezone: true }),
    startedAt: timestamp("started_at", { withTimezone: true }),
    completedAt: timestamp("completed_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    uniqueIndex("validation_runs_app_idempotency_unique").on(
      table.appId,
      table.idempotencyKey
    ),
    index("validation_runs_app_id_idx").on(table.appId),
    index("validation_runs_status_idx").on(table.status),
    index("validation_runs_status_lease_idx").on(
      table.status,
      table.leaseExpiresAt
    ),
  ]
);

// One row per gate per run. `mandatory` is copied from the gate definition
// at run time (not re-derived from the live registry later) so an old run's
// release-eligibility math stays reproducible even if a gate is later
// reclassified mandatory/optional. `structuredFailures` is always
// machine-readable ({ code, message, path? }[]), never a raw stack trace;
// `evidence` holds small deterministic proof (counts, ids, checksums) —
// anything larger (screenshots, traces, reports) is a row in
// validationArtifacts instead, referenced by id from here.
export const validationGateResults = pgTable(
  "validation_gate_results",
  {
    id: text("id").primaryKey(),
    runId: text("run_id")
      .notNull()
      .references(() => validationRuns.id, { onDelete: "cascade" }),
    appId: text("app_id")
      .notNull()
      .references(() => apps.id, { onDelete: "cascade" }),
    gateKey: text("gate_key").notNull(),
    gateVersion: text("gate_version").notNull(),
    mandatory: boolean("mandatory").notNull().default(true),
    status: validationGateStatusEnum("status").notNull().default("pending"),
    skipReason: text("skip_reason"),
    failureCode: text("failure_code"),
    failureMessage: text("failure_message"),
    structuredFailures: jsonb("structured_failures")
      .$type<Record<string, unknown>[]>()
      .notNull()
      .default([]),
    evidence: jsonb("evidence")
      .$type<Record<string, unknown>>()
      .notNull()
      .default({}),
    artifactIds: jsonb("artifact_ids").$type<string[]>().notNull().default([]),
    durationMs: integer("duration_ms"),
    startedAt: timestamp("started_at", { withTimezone: true }),
    completedAt: timestamp("completed_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    uniqueIndex("validation_gate_results_run_gate_unique").on(
      table.runId,
      table.gateKey
    ),
    index("validation_gate_results_app_id_idx").on(table.appId),
  ]
);

// Safe QA evidence (issue requirement: "screenshots, traces, test reports,
// structured console/network diagnostics, gate summaries ... free of
// secrets/session cookies/raw authorization headers"). `storageKey` always
// comes from lib/generated-data/files.ts-style server-generated key
// construction (never a client path); every artifact is written through
// lib/validation/redaction.ts before being persisted, mirroring
// @asafarim/appbuilder-ai's redactForLogging contract for provider
// diagnostics. `retentionExpiresAt` is set at write time from
// VALIDATION_LIMITS.ARTIFACT_RETENTION_MS — a scheduled cleanup (see
// docs/appbuilder-m10-validation-qa.md#artifact-retention) deletes both the
// row and the underlying object once expired; nothing reads an artifact
// past its retention window.
export const validationArtifacts = pgTable(
  "validation_artifacts",
  {
    id: text("id").primaryKey(),
    runId: text("run_id")
      .notNull()
      .references(() => validationRuns.id, { onDelete: "cascade" }),
    appId: text("app_id")
      .notNull()
      .references(() => apps.id, { onDelete: "cascade" }),
    gateKey: text("gate_key"),
    kind: validationArtifactKindEnum("kind").notNull(),
    label: text("label").notNull(),
    storageKey: text("storage_key").notNull(),
    contentType: text("content_type").notNull(),
    sizeBytes: integer("size_bytes").notNull().default(0),
    retentionExpiresAt: timestamp("retention_expires_at", {
      withTimezone: true,
    }),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    index("validation_artifacts_run_id_idx").on(table.runId),
    index("validation_artifacts_app_id_idx").on(table.appId),
  ]
);

// One row per bounded AI repair attempt against a FAILED validation run.
// `originatingRunId` + `attemptNumber` together enforce
// VALIDATION_LIMITS.MAX_REPAIR_ATTEMPTS_PER_RUN at the database level (the
// unique index below), not just in application code. `diagnosticsSummary` is
// always the OUTPUT of lib/validation/redaction.ts — the only diagnostics
// ever sent to the model or persisted here. Mirrors
// modification_operation_batches' proposed/rejected/destructive/applied
// bookkeeping folded onto one row (a repair attempt proposes exactly one
// bounded batch, like a modification job).
export const repairAttempts = pgTable(
  "repair_attempts",
  {
    id: text("id").primaryKey(),
    appId: text("app_id")
      .notNull()
      .references(() => apps.id, { onDelete: "cascade" }),
    originatingRunId: text("originating_run_id")
      .notNull()
      .references(() => validationRuns.id, { onDelete: "cascade" }),
    attemptNumber: integer("attempt_number").notNull(),
    initiatedByPrincipalId: text("initiated_by_principal_id").notNull(),
    status: repairAttemptStatusEnum("status").notNull().default("queued"),
    phase: text("phase").notNull().default("queued"),
    failureClassification: repairFailureClassificationEnum(
      "failure_classification"
    ),
    // Which failed gate(s) this attempt is targeting — never "the whole run"
    // implicitly, so a repair proposal stays scoped to what was actually
    // classified as repairable.
    targetGateKeys: jsonb("target_gate_keys")
      .$type<string[]>()
      .notNull()
      .default([]),
    // Bounded, redacted diagnostics actually shown to the model — see
    // lib/validation/redaction.ts. Never a raw stack trace, DB error, or
    // provider response body.
    diagnosticsSummary: jsonb("diagnostics_summary")
      .$type<Record<string, unknown>>()
      .notNull()
      .default({}),
    proposedOperationCount: integer("proposed_operation_count")
      .notNull()
      .default(0),
    rejectedOperations: jsonb("rejected_operations")
      .$type<Record<string, unknown>[]>()
      .notNull()
      .default([]),
    destructiveOperations: jsonb("destructive_operations")
      .$type<Record<string, unknown>[]>()
      .notNull()
      .default([]),
    appliedOperationIds: jsonb("applied_operation_ids")
      .$type<string[]>()
      .notNull()
      .default([]),
    // Identical confirmation-binding contract to modification_jobs (actor,
    // app, base version, exact checksum, expiry, single-use) — reuses
    // lib/modification/confirmation.ts's functions directly rather than a
    // parallel implementation.
    confirmationRequired: boolean("confirmation_required")
      .notNull()
      .default(false),
    confirmationChecksum: text("confirmation_checksum"),
    confirmationBaseVersionNumber: integer("confirmation_base_version_number"),
    confirmationExpiresAt: timestamp("confirmation_expires_at", {
      withTimezone: true,
    }),
    confirmationConfirmedAt: timestamp("confirmation_confirmed_at", {
      withTimezone: true,
    }),
    confirmationConfirmedByPrincipalId: text(
      "confirmation_confirmed_by_principal_id"
    ),
    baseVersionNumber: integer("base_version_number").notNull(),
    resultingVersionNumber: integer("resulting_version_number"),
    resultingVersionId: text("resulting_version_id").references(
      (): AnyPgColumn => specificationVersions.id,
      { onDelete: "set null" }
    ),
    resultingPreviewBuildId: text("resulting_preview_build_id").references(
      (): AnyPgColumn => previewBuilds.id,
      { onDelete: "set null" }
    ),
    // The NEW validation run created to revalidate from scratch after this
    // repair applied — never the same row as originatingRunId.
    resultingValidationRunId: text("resulting_validation_run_id").references(
      (): AnyPgColumn => validationRuns.id,
      { onDelete: "set null" }
    ),
    providerName: text("provider_name"),
    providerModel: text("provider_model"),
    usage: jsonb("usage").$type<Record<string, unknown>>().default({}),
    idempotencyKey: text("idempotency_key").notNull(),
    requestHash: text("request_hash").notNull(),
    failureCode: repairJobFailureCodeEnum("failure_code"),
    failureMessage: text("failure_message"),
    cancelRequestedAt: timestamp("cancel_requested_at", { withTimezone: true }),
    cancelledByPrincipalId: text("cancelled_by_principal_id"),
    leaseOwner: text("lease_owner"),
    leaseExpiresAt: timestamp("lease_expires_at", { withTimezone: true }),
    heartbeatAt: timestamp("heartbeat_at", { withTimezone: true }),
    startedAt: timestamp("started_at", { withTimezone: true }),
    completedAt: timestamp("completed_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    uniqueIndex("repair_attempts_app_idempotency_unique").on(
      table.appId,
      table.idempotencyKey
    ),
    // Enforces MAX_REPAIR_ATTEMPTS_PER_RUN structurally: attempt numbers for
    // one run are unique, so the repository's bounds check racing another
    // insert fails closed at the database rather than only in application
    // logic.
    uniqueIndex("repair_attempts_run_attempt_unique").on(
      table.originatingRunId,
      table.attemptNumber
    ),
    index("repair_attempts_app_id_idx").on(table.appId),
    index("repair_attempts_status_idx").on(table.status),
    index("repair_attempts_status_lease_idx").on(
      table.status,
      table.leaseExpiresAt
    ),
  ]
);

export const validationRunsRelations = relations(
  validationRuns,
  ({ one, many }) => ({
    app: one(apps, { fields: [validationRuns.appId], references: [apps.id] }),
    specificationVersion: one(specificationVersions, {
      fields: [validationRuns.specificationVersionId],
      references: [specificationVersions.id],
    }),
    previewBuild: one(previewBuilds, {
      fields: [validationRuns.previewBuildId],
      references: [previewBuilds.id],
    }),
    gateResults: many(validationGateResults),
    artifacts: many(validationArtifacts),
    repairAttempts: many(repairAttempts),
  })
);

export const validationGateResultsRelations = relations(
  validationGateResults,
  ({ one }) => ({
    run: one(validationRuns, {
      fields: [validationGateResults.runId],
      references: [validationRuns.id],
    }),
    app: one(apps, {
      fields: [validationGateResults.appId],
      references: [apps.id],
    }),
  })
);

export const validationArtifactsRelations = relations(
  validationArtifacts,
  ({ one }) => ({
    run: one(validationRuns, {
      fields: [validationArtifacts.runId],
      references: [validationRuns.id],
    }),
    app: one(apps, {
      fields: [validationArtifacts.appId],
      references: [apps.id],
    }),
  })
);

export const repairAttemptsRelations = relations(repairAttempts, ({ one }) => ({
  app: one(apps, { fields: [repairAttempts.appId], references: [apps.id] }),
  originatingRun: one(validationRuns, {
    fields: [repairAttempts.originatingRunId],
    references: [validationRuns.id],
    relationName: "originatingRun",
  }),
  resultingValidationRun: one(validationRuns, {
    fields: [repairAttempts.resultingValidationRunId],
    references: [validationRuns.id],
    relationName: "resultingValidationRun",
  }),
  resultingVersion: one(specificationVersions, {
    fields: [repairAttempts.resultingVersionId],
    references: [specificationVersions.id],
  }),
  resultingPreviewBuild: one(previewBuilds, {
    fields: [repairAttempts.resultingPreviewBuildId],
    references: [previewBuilds.id],
  }),
}));

// ---------------------------------------------------------------------------
// M12: launch hardening — quotas/usage, observability events, backups and
// restore rehearsals, custom-domain readiness (inert, feature-flagged), and
// privacy/retention foundations. See docs/appbuilder-m12-launch-hardening.md.
// ---------------------------------------------------------------------------

export const quotaScopeTypeEnum = pgEnum("quota_scope_type", ["owner", "app"]);

// Admin/owner override for a single quota metric. Deliberately NOT a
// per-metric column set on `apps` — overrides are rare, audited exceptions,
// not normal app configuration, so they get their own append-mostly table
// with a `revokedAt` lifecycle rather than being silently editable. Every
// insert/revoke is additionally mirrored into `auditEvents` (or, for
// owner-scoped overrides that predate any single app, `operationalEvents`)
// by the repository layer — this table alone is the resolution source of
// truth, but never the only record of who changed it and why.
export const quotaOverrides = pgTable(
  "quota_overrides",
  {
    id: text("id").primaryKey(),
    scopeType: quotaScopeTypeEnum("scope_type").notNull(),
    // ownerPrincipalId when scopeType="owner", appId when scopeType="app".
    // Deliberately one opaque column rather than two nullable FKs — the
    // interpretation is selected by scopeType, mirroring idempotencyKeys'
    // existing (appId nullable, ownerPrincipalId always set) convention.
    scopeId: text("scope_id").notNull(),
    metric: text("metric").notNull(),
    limitValue: integer("limit_value").notNull(),
    reason: text("reason").notNull(),
    createdByPrincipalId: text("created_by_principal_id").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    expiresAt: timestamp("expires_at", { withTimezone: true }),
    revokedAt: timestamp("revoked_at", { withTimezone: true }),
    revokedByPrincipalId: text("revoked_by_principal_id"),
  },
  (table) => [
    index("quota_overrides_scope_idx").on(
      table.scopeType,
      table.scopeId,
      table.metric
    ),
  ]
);

export const usageEventKindEnum = pgEnum("usage_event_kind", [
  "ai_generation_request",
  "ai_modification_request",
  "ai_repair_request",
  "preview_build",
  "validation_run",
  "deployment",
  "workflow_execution",
  "storage_write",
  // M13 slice F: one outbound public-reference fetch. Recorded in the same
  // transaction as the quota check that bounds it, so "fetches today" is
  // re-derived from this ledger rather than a counter that could drift.
  "public_reference_fetch",
]);

// Append-only usage ledger. Exists so M12 "preserve enough usage data for
// future billing" is satisfied without building billing itself (explicit
// non-goal) — a future billing system can aggregate this table without any
// schema change. Never updated or deleted; not covered by the general
// retention sweep (see docs/appbuilder-m12-privacy-retention.md — usage
// records are kept indefinitely by design, unlike prompts/diagnostics).
export const usageEvents = pgTable(
  "usage_events",
  {
    id: text("id").primaryKey(),
    appId: text("app_id").references(() => apps.id, { onDelete: "cascade" }),
    ownerPrincipalId: text("owner_principal_id").notNull(),
    environment: generatedEnvironmentEnum("environment"),
    kind: usageEventKindEnum("kind").notNull(),
    quantity: integer("quantity").notNull().default(1),
    unit: text("unit").notNull().default("count"),
    metadata: jsonb("metadata").$type<Record<string, unknown>>().default({}),
    occurredAt: timestamp("occurred_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    index("usage_events_app_id_idx").on(table.appId),
    index("usage_events_owner_occurred_idx").on(
      table.ownerPrincipalId,
      table.occurredAt
    ),
    index("usage_events_kind_occurred_idx").on(table.kind, table.occurredAt),
  ]
);

export const operationalEventSeverityEnum = pgEnum(
  "operational_event_severity",
  ["info", "warning", "error"]
);

// Durable, queryable operational event stream — the backbone for M12
// observability that isn't already derivable by aggregating an existing
// domain table (queue depth/duration/pass-fail rates ARE derived directly
// from generationJobs/validationRuns/deployments — see
// lib/observability/metrics.ts). This table exists for events with no other
// durable home: quota rejections, security-policy check failures, backup/
// restore lifecycle, and correlation-id-tagged milestones across
// generation/modification/repair/validation/preview/deployment/rollback/
// runtime/storage/workflow paths. Append-only; retention documented in
// docs/appbuilder-m12-privacy-retention.md.
export const operationalEvents = pgTable(
  "operational_events",
  {
    id: text("id").primaryKey(),
    appId: text("app_id").references(() => apps.id, { onDelete: "cascade" }),
    correlationId: text("correlation_id"),
    category: text("category").notNull(),
    kind: text("kind").notNull(),
    severity: operationalEventSeverityEnum("severity")
      .notNull()
      .default("info"),
    actorPrincipalId: text("actor_principal_id"),
    detail: jsonb("detail")
      .$type<Record<string, unknown>>()
      .notNull()
      .default({}),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    index("operational_events_app_id_idx").on(table.appId),
    index("operational_events_category_created_idx").on(
      table.category,
      table.createdAt
    ),
    index("operational_events_correlation_idx").on(table.correlationId),
  ]
);

export const backupKindEnum = pgEnum("backup_kind", [
  "database",
  "object_storage",
]);
export const backupStatusEnum = pgEnum("backup_status", [
  "running",
  "succeeded",
  "failed",
]);
export const backupTriggerEnum = pgEnum("backup_trigger", [
  "scheduled",
  "manual",
]);

// Platform-wide, not per-app — AppBuilder owns exactly one database and one
// object-storage bucket, backed up as a unit. `appId` is deliberately
// absent; every app's readiness page surfaces the SAME latest row (see
// lib/backup/repository.ts#getLatestBackupStatus).
export const backupRuns = pgTable(
  "backup_runs",
  {
    id: text("id").primaryKey(),
    kind: backupKindEnum("kind").notNull(),
    status: backupStatusEnum("status").notNull().default("running"),
    trigger: backupTriggerEnum("trigger").notNull().default("manual"),
    // Storage key/path for the artifact — never a filesystem secret or
    // credential; see lib/backup/runBackup.ts.
    location: text("location").notNull(),
    sizeBytes: integer("size_bytes"),
    checksum: text("checksum"),
    encryption: text("encryption")
      .notNull()
      .default("at-rest (provider-managed)"),
    startedAt: timestamp("started_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    completedAt: timestamp("completed_at", { withTimezone: true }),
    failureMessage: text("failure_message"),
    retentionExpiresAt: timestamp("retention_expires_at", {
      withTimezone: true,
    }),
    triggeredByPrincipalId: text("triggered_by_principal_id"),
    metadata: jsonb("metadata").$type<Record<string, unknown>>().default({}),
  },
  (table) => [
    index("backup_runs_kind_started_idx").on(table.kind, table.startedAt),
    index("backup_runs_status_idx").on(table.status),
  ]
);

export const restoreRehearsalStatusEnum = pgEnum("restore_rehearsal_status", [
  "running",
  "succeeded",
  "failed",
]);

// A restore rehearsal NEVER targets the production database — see
// lib/backup/runRestoreRehearsal.ts, which refuses to run unless the
// resolved target connection string is provably not
// APPBUILDER_DATABASE_URL. `verifiedCounts` records row counts per checked
// table (apps, specifications, specificationVersions, releases,
// generatedRecords, generatedFiles, ...) captured from the restored target,
// so "restore recovers AppBuilder metadata/specs/generated data/release
// manifests/artifacts" is evidenced, not merely asserted.
export const restoreRehearsals = pgTable(
  "restore_rehearsals",
  {
    id: text("id").primaryKey(),
    backupRunId: text("backup_run_id")
      .notNull()
      .references(() => backupRuns.id, { onDelete: "cascade" }),
    status: restoreRehearsalStatusEnum("status").notNull().default("running"),
    targetDescription: text("target_description").notNull(),
    startedAt: timestamp("started_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    completedAt: timestamp("completed_at", { withTimezone: true }),
    verifiedCounts: jsonb("verified_counts").$type<Record<string, number>>(),
    findings: jsonb("findings").$type<Record<string, unknown>>().default({}),
    failureMessage: text("failure_message"),
    performedByPrincipalId: text("performed_by_principal_id"),
  },
  (table) => [index("restore_rehearsals_backup_run_idx").on(table.backupRunId)]
);

export const customDomainStatusEnum = pgEnum("custom_domain_status", [
  "pending_verification",
  "verified",
  "blocked",
  "cancelled",
]);

export const customDomainTlsStateEnum = pgEnum("custom_domain_tls_state", [
  "not_started",
  "pending",
  "issued",
  "failed",
]);

// M12: readiness data model ONLY — see lib/customDomains/featureFlag.ts.
// APPBUILDER_CUSTOM_DOMAINS_ENABLED is unset/false in every environment this
// milestone ships to; nothing in this codebase provisions DNS, issues a TLS
// certificate, or routes traffic for a row in this table. Collision
// prevention piggybacks on `appDomains.host`'s existing global unique
// index: the (still unimplemented, flag-gated) verification step would
// insert/activate a row there exactly like the auto-slug flow, so two apps
// can never claim the same host even once the flag is on.
export const customDomainRequests = pgTable(
  "custom_domain_requests",
  {
    id: text("id").primaryKey(),
    appId: text("app_id")
      .notNull()
      .references(() => apps.id, { onDelete: "cascade" }),
    requestedHost: text("requested_host").notNull(),
    status: customDomainStatusEnum("status")
      .notNull()
      .default("pending_verification"),
    verificationToken: text("verification_token").notNull(),
    verificationMethod: text("verification_method")
      .notNull()
      .default("dns_txt"),
    verifiedAt: timestamp("verified_at", { withTimezone: true }),
    tlsState: customDomainTlsStateEnum("tls_state")
      .notNull()
      .default("not_started"),
    releaseId: text("release_id").references((): AnyPgColumn => releases.id, {
      onDelete: "set null",
    }),
    requestedByPrincipalId: text("requested_by_principal_id").notNull(),
    cancelledAt: timestamp("cancelled_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    // Partial: uniqueness only holds among non-cancelled requests, so
    // cancelling a request (see lib/customDomains/requests.ts#cancelCustomDomainRequest)
    // genuinely frees that host for a new request instead of leaving a
    // permanent tombstone behind.
    uniqueIndex("custom_domain_requests_host_unique")
      .on(table.requestedHost)
      .where(sql`${table.status} <> 'cancelled'`),
    index("custom_domain_requests_app_id_idx").on(table.appId),
  ]
);

export const dataSubjectRequestKindEnum = pgEnum("data_subject_request_kind", [
  "export",
  "deletion",
]);
export const dataSubjectRequestStatusEnum = pgEnum(
  "data_subject_request_status",
  ["received", "in_progress", "completed", "rejected"]
);

// Export/deletion-request FOUNDATION only (explicit M12 scope: not a full
// compliance platform). Fulfillment today is operator-assisted: an operator
// works this queue by hand following
// docs/appbuilder-m12-privacy-retention.md and marks the row completed —
// there is no automatic fulfiller yet.
export const dataSubjectRequests = pgTable(
  "data_subject_requests",
  {
    id: text("id").primaryKey(),
    requestedByPrincipalId: text("requested_by_principal_id").notNull(),
    appId: text("app_id").references(() => apps.id, { onDelete: "cascade" }),
    kind: dataSubjectRequestKindEnum("kind").notNull(),
    status: dataSubjectRequestStatusEnum("status")
      .notNull()
      .default("received"),
    notes: text("notes"),
    resultLocation: text("result_location"),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    completedAt: timestamp("completed_at", { withTimezone: true }),
    completedByPrincipalId: text("completed_by_principal_id"),
  },
  (table) => [
    index("data_subject_requests_owner_idx").on(table.requestedByPrincipalId),
  ]
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
  attachments: many(conversationAttachments),
  generatedAppMembers: many(generatedAppMembers),
  generatedRecords: many(generatedRecords),
  validationRuns: many(validationRuns),
  repairAttempts: many(repairAttempts),
  appDomains: many(appDomains),
  deploymentSteps: many(deploymentSteps),
  usageEvents: many(usageEvents),
  operationalEvents: many(operationalEvents),
  customDomainRequests: many(customDomainRequests),
  dataSubjectRequests: many(dataSubjectRequests),
}));

export const creationRequestsRelations = relations(
  creationRequests,
  ({ one }) => ({
    app: one(apps, { fields: [creationRequests.appId], references: [apps.id] }),
  })
);

export const collaboratorsRelations = relations(collaborators, ({ one }) => ({
  app: one(apps, { fields: [collaborators.appId], references: [apps.id] }),
}));

export const specificationsRelations = relations(
  specifications,
  ({ one, many }) => ({
    app: one(apps, { fields: [specifications.appId], references: [apps.id] }),
    versions: many(specificationVersions),
    operations: many(appliedOperations),
  })
);

export const specificationVersionsRelations = relations(
  specificationVersions,
  ({ one, many }) => ({
    specification: one(specifications, {
      fields: [specificationVersions.specificationId],
      references: [specifications.id],
    }),
    app: one(apps, {
      fields: [specificationVersions.appId],
      references: [apps.id],
    }),
    previewBuilds: many(previewBuilds),
    releases: many(releases),
  })
);

export const appliedOperationsRelations = relations(
  appliedOperations,
  ({ one }) => ({
    app: one(apps, {
      fields: [appliedOperations.appId],
      references: [apps.id],
    }),
    specification: one(specifications, {
      fields: [appliedOperations.specificationId],
      references: [specifications.id],
    }),
    resultingVersion: one(specificationVersions, {
      fields: [appliedOperations.resultingVersionId],
      references: [specificationVersions.id],
    }),
  })
);

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
  previewBuild: one(previewBuilds, {
    fields: [releases.previewBuildId],
    references: [previewBuilds.id],
  }),
  validationRun: one(validationRuns, {
    fields: [releases.validationRunId],
    references: [validationRuns.id],
  }),
  deployments: many(deployments),
}));

export const appDomainsRelations = relations(appDomains, ({ one }) => ({
  app: one(apps, { fields: [appDomains.appId], references: [apps.id] }),
  activeRelease: one(releases, {
    fields: [appDomains.activeReleaseId],
    references: [releases.id],
  }),
}));

export const deploymentsRelations = relations(deployments, ({ one, many }) => ({
  app: one(apps, { fields: [deployments.appId], references: [apps.id] }),
  release: one(releases, {
    fields: [deployments.releaseId],
    references: [releases.id],
  }),
  steps: many(deploymentSteps),
}));

export const deploymentStepsRelations = relations(
  deploymentSteps,
  ({ one }) => ({
    deployment: one(deployments, {
      fields: [deploymentSteps.deploymentId],
      references: [deployments.id],
    }),
    app: one(apps, { fields: [deploymentSteps.appId], references: [apps.id] }),
  })
);

export const auditEventsRelations = relations(auditEvents, ({ one }) => ({
  app: one(apps, { fields: [auditEvents.appId], references: [apps.id] }),
}));

export const idempotencyKeysRelations = relations(
  idempotencyKeys,
  ({ one }) => ({
    app: one(apps, { fields: [idempotencyKeys.appId], references: [apps.id] }),
  })
);

export const generationJobsRelations = relations(
  generationJobs,
  ({ one, many }) => ({
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
  })
);

export const generationOperationBatchesRelations = relations(
  generationOperationBatches,
  ({ one }) => ({
    job: one(generationJobs, {
      fields: [generationOperationBatches.jobId],
      references: [generationJobs.id],
    }),
    app: one(apps, {
      fields: [generationOperationBatches.appId],
      references: [apps.id],
    }),
  })
);

export const conversationsRelations = relations(
  conversations,
  ({ one, many }) => ({
    app: one(apps, { fields: [conversations.appId], references: [apps.id] }),
    messages: many(conversationMessages),
    modificationJobs: many(modificationJobs),
    attachments: many(conversationAttachments),
    memory: many(conversationMemories),
    publicReferences: many(conversationReferences),
  })
);

export const conversationReferencesRelations = relations(
  conversationReferences,
  ({ one }) => ({
    app: one(apps, {
      fields: [conversationReferences.appId],
      references: [apps.id],
    }),
    conversation: one(conversations, {
      fields: [conversationReferences.conversationId],
      references: [conversations.id],
    }),
  })
);

export const conversationMemoriesRelations = relations(
  conversationMemories,
  ({ one }) => ({
    app: one(apps, {
      fields: [conversationMemories.appId],
      references: [apps.id],
    }),
    conversation: one(conversations, {
      fields: [conversationMemories.conversationId],
      references: [conversations.id],
    }),
  })
);

export const conversationMessagesRelations = relations(
  conversationMessages,
  ({ one, many }) => ({
    conversation: one(conversations, {
      fields: [conversationMessages.conversationId],
      references: [conversations.id],
    }),
    app: one(apps, {
      fields: [conversationMessages.appId],
      references: [apps.id],
    }),
    modificationJob: one(modificationJobs, {
      fields: [conversationMessages.modificationJobId],
      references: [modificationJobs.id],
    }),
    resultingPreviewBuild: one(previewBuilds, {
      fields: [conversationMessages.resultingPreviewBuildId],
      references: [previewBuilds.id],
    }),
    attachments: many(conversationAttachments),
  })
);

export const conversationAttachmentsRelations = relations(
  conversationAttachments,
  ({ one }) => ({
    app: one(apps, {
      fields: [conversationAttachments.appId],
      references: [apps.id],
    }),
    conversation: one(conversations, {
      fields: [conversationAttachments.conversationId],
      references: [conversations.id],
    }),
    message: one(conversationMessages, {
      fields: [conversationAttachments.messageId],
      references: [conversationMessages.id],
    }),
  })
);

export const modificationJobsRelations = relations(
  modificationJobs,
  ({ one, many }) => ({
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
  })
);

export const modificationOperationBatchesRelations = relations(
  modificationOperationBatches,
  ({ one }) => ({
    job: one(modificationJobs, {
      fields: [modificationOperationBatches.jobId],
      references: [modificationJobs.id],
    }),
    app: one(apps, {
      fields: [modificationOperationBatches.appId],
      references: [apps.id],
    }),
  })
);

export const generatedAppMembersRelations = relations(
  generatedAppMembers,
  ({ one }) => ({
    app: one(apps, {
      fields: [generatedAppMembers.appId],
      references: [apps.id],
    }),
  })
);

export const generatedRecordsRelations = relations(
  generatedRecords,
  ({ one, many }) => ({
    app: one(apps, { fields: [generatedRecords.appId], references: [apps.id] }),
    revisions: many(generatedRecordRevisions),
    outgoingRelations: many(generatedRecordRelations, {
      relationName: "fromRecord",
    }),
    incomingRelations: many(generatedRecordRelations, {
      relationName: "toRecord",
    }),
  })
);

export const generatedRecordRevisionsRelations = relations(
  generatedRecordRevisions,
  ({ one }) => ({
    record: one(generatedRecords, {
      fields: [generatedRecordRevisions.recordId],
      references: [generatedRecords.id],
    }),
    app: one(apps, {
      fields: [generatedRecordRevisions.appId],
      references: [apps.id],
    }),
  })
);

export const generatedRecordRelationsRelations = relations(
  generatedRecordRelations,
  ({ one }) => ({
    app: one(apps, {
      fields: [generatedRecordRelations.appId],
      references: [apps.id],
    }),
    fromRecord: one(generatedRecords, {
      fields: [generatedRecordRelations.fromRecordId],
      references: [generatedRecords.id],
      relationName: "fromRecord",
    }),
    toRecord: one(generatedRecords, {
      fields: [generatedRecordRelations.toRecordId],
      references: [generatedRecords.id],
      relationName: "toRecord",
    }),
  })
);

export const generatedUniquenessClaimsRelations = relations(
  generatedUniquenessClaims,
  ({ one }) => ({
    app: one(apps, {
      fields: [generatedUniquenessClaims.appId],
      references: [apps.id],
    }),
    record: one(generatedRecords, {
      fields: [generatedUniquenessClaims.recordId],
      references: [generatedRecords.id],
    }),
  })
);

export const generatedFilesRelations = relations(generatedFiles, ({ one }) => ({
  app: one(apps, { fields: [generatedFiles.appId], references: [apps.id] }),
  record: one(generatedRecords, {
    fields: [generatedFiles.recordId],
    references: [generatedRecords.id],
  }),
}));

export const generatedActivityRelations = relations(
  generatedActivity,
  ({ one }) => ({
    app: one(apps, {
      fields: [generatedActivity.appId],
      references: [apps.id],
    }),
    record: one(generatedRecords, {
      fields: [generatedActivity.recordId],
      references: [generatedRecords.id],
    }),
  })
);

export const generatedNotificationsRelations = relations(
  generatedNotifications,
  ({ one }) => ({
    app: one(apps, {
      fields: [generatedNotifications.appId],
      references: [apps.id],
    }),
    record: one(generatedRecords, {
      fields: [generatedNotifications.relatedRecordId],
      references: [generatedRecords.id],
    }),
  })
);

export const generatedWorkflowExecutionsRelations = relations(
  generatedWorkflowExecutions,
  ({ one, many }) => ({
    app: one(apps, {
      fields: [generatedWorkflowExecutions.appId],
      references: [apps.id],
    }),
    triggerRecord: one(generatedRecords, {
      fields: [generatedWorkflowExecutions.triggerRecordId],
      references: [generatedRecords.id],
    }),
    steps: many(generatedWorkflowStepExecutions),
  })
);

export const generatedWorkflowStepExecutionsRelations = relations(
  generatedWorkflowStepExecutions,
  ({ one }) => ({
    execution: one(generatedWorkflowExecutions, {
      fields: [generatedWorkflowStepExecutions.executionId],
      references: [generatedWorkflowExecutions.id],
    }),
  })
);

export const generatedDataIdempotencyRelations = relations(
  generatedDataIdempotency,
  ({ one }) => ({
    app: one(apps, {
      fields: [generatedDataIdempotency.appId],
      references: [apps.id],
    }),
  })
);

export const generatedRowAccessRulesRelations = relations(
  generatedRowAccessRules,
  ({ one }) => ({
    app: one(apps, {
      fields: [generatedRowAccessRules.appId],
      references: [apps.id],
    }),
  })
);

export const usageEventsRelations = relations(usageEvents, ({ one }) => ({
  app: one(apps, { fields: [usageEvents.appId], references: [apps.id] }),
}));

export const operationalEventsRelations = relations(
  operationalEvents,
  ({ one }) => ({
    app: one(apps, {
      fields: [operationalEvents.appId],
      references: [apps.id],
    }),
  })
);

export const restoreRehearsalsRelations = relations(
  restoreRehearsals,
  ({ one }) => ({
    backupRun: one(backupRuns, {
      fields: [restoreRehearsals.backupRunId],
      references: [backupRuns.id],
    }),
  })
);

export const customDomainRequestsRelations = relations(
  customDomainRequests,
  ({ one }) => ({
    app: one(apps, {
      fields: [customDomainRequests.appId],
      references: [apps.id],
    }),
    release: one(releases, {
      fields: [customDomainRequests.releaseId],
      references: [releases.id],
    }),
  })
);

export const dataSubjectRequestsRelations = relations(
  dataSubjectRequests,
  ({ one }) => ({
    app: one(apps, {
      fields: [dataSubjectRequests.appId],
      references: [apps.id],
    }),
  })
);
