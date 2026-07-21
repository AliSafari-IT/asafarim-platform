import {
  pgTable,
  text,
  jsonb,
  timestamp,
  integer,
  pgEnum,
  uniqueIndex,
  index,
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

// Preview builds triggered from a specific specification version. The
// preview runtime itself ships later (M06/M07) — this table only tracks the
// build lifecycle and its outcome.
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
    status: previewBuildStatusEnum("status").notNull().default("queued"),
    requestedByPrincipalId: text("requested_by_principal_id").notNull(),
    startedAt: timestamp("started_at", { withTimezone: true }),
    completedAt: timestamp("completed_at", { withTimezone: true }),
    errorMessage: text("error_message"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [index("preview_builds_app_id_idx").on(table.appId)],
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

export const appsRelations = relations(apps, ({ many }) => ({
  collaborators: many(collaborators),
  specifications: many(specifications),
  operations: many(appliedOperations),
  previewBuilds: many(previewBuilds),
  releases: many(releases),
  deployments: many(deployments),
  auditEvents: many(auditEvents),
  creationRequest: many(creationRequests),
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
