import {
  pgTable,
  text,
  jsonb,
  timestamp,
  integer,
  boolean,
  real,
  pgEnum,
  uniqueIndex,
} from "drizzle-orm/pg-core";
import { relations } from "drizzle-orm";

export const testStatusEnum = pgEnum("test_status", [
  "pending",
  "running",
  "passed",
  "failed",
  "error",
]);

export const scriptTypeEnum = pgEnum("script_type", ["single", "multi", "scripted"]);

export const projectVisibilityEnum = pgEnum("project_visibility", ["public", "private"]);

export const issueStatusEnum = pgEnum("issue_status", ["draft", "published"]);

export const githubIssueStateEnum = pgEnum("github_issue_state", ["open", "closed"]);

// Who quarantined a case/suite: an operator through the UI/API, or Testora's
// own auto-quarantine crossing a project's flake threshold (issue #260).
export const quarantineReasonEnum = pgEnum("quarantine_reason", ["manual", "auto"]);

// Lifecycle of a scenario provisioned from a TasksAI acceptance criterion
// (issue #262) — mirrors the contract's PendingScenarioState
// (@asafarim/testora-tasksai-contract). A manually-authored case defaults to
// "active"; a provisioned scaffold starts "pending" and is excluded from the
// green-light set (#263) until promoted.
export const pendingScenarioStateEnum = pgEnum("pending_scenario_state", [
  "pending",
  "authoring",
  "active",
  "passing",
  "failing",
  "quarantined",
]);

// The app registry. Apps used to be code-only (src/data/projects.ts); they now
// live here so new apps can be added from the UI and marked private. A private
// app is locked behind a key (keyHash) — its catalog and results are withheld
// server-side until a viewer unlocks it. `seeded` rows mirror the code defaults
// (their name/URLs/branding are reconciled on each seed, but a user's visibility
// + key are preserved); `seeded = false` rows are user-created.
export const projects = pgTable("projects", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  baseUrl: text("base_url").notNull().default(""),
  apiUrl: text("api_url").notNull().default(""),
  visibility: projectVisibilityEnum("visibility").notNull().default("public"),
  // Salted scrypt hash of the unlock key; null for public apps.
  keyHash: text("key_hash"),
  productName: text("product_name"),
  companyName: text("company_name"),
  // Optional GitHub wiring for filing issues from failed results. `githubRepo`
  // is "owner/name"; `githubTokenEnc` is an AES-GCM-encrypted PAT — server-only,
  // never returned to the client (see src/lib/github.ts).
  githubRepo: text("github_repo"),
  githubTokenEnc: text("github_token_enc"),
  seeded: boolean("seeded").notNull().default(false),
  // Opt-in (issue #260): when true, a case crossing the flake threshold is
  // quarantined automatically. Off by default — auto-quarantine changes what
  // blocks a green-light check, so a project opts in deliberately.
  autoQuarantineFlaky: boolean("auto_quarantine_flaky").notNull().default(false),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

// Issues generated from failed results. Always stored here (the markdown
// fallback when an app has no GitHub repo connected); when the app IS wired to a
// repo, "publishing" also files it on GitHub and records the url/number. Deleting
// an app cascades its issues away.
export const issues = pgTable("issues", {
  id: text("id").primaryKey(),
  projectId: text("project_id")
    .notNull()
    .references(() => projects.id, { onDelete: "cascade" }),
  title: text("title").notNull(),
  body: text("body").notNull().default(""),
  status: issueStatusEnum("status").notNull().default("draft"),
  // Provenance of the failed result that seeded this issue. Loose refs (no FK):
  // results get pruned/re-seeded, but the issue should outlive them.
  resultId: text("result_id"),
  caseId: text("case_id"),
  // Set once published to GitHub.
  githubUrl: text("github_url"),
  githubNumber: integer("github_number"),
  githubState: githubIssueStateEnum("github_state"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

export const functionalRequirements = pgTable("functional_requirements", {
  id: text("id").primaryKey(),
  // Which app/project this requirement belongs to. The Run page filters the
  // whole catalog by the active project so a different target domain runs its
  // OWN tests, not another app's. See src/data/projects.ts for the registry.
  projectId: text("project_id").notNull().default("asafarim-timelineai"),
  title: text("title").notNull(),
  description: text("description").notNull().default(""),
  // Environment root shared by every suite/fixture/case under this FR (e.g.
  // http://localhost:3233 or https://app.example.com). Fixtures may inherit it
  // as-is, extend it with a relative path, or override it entirely with
  // their own absolute baseUrl — see resolveFixtureBaseUrl().
  baseUrl: text("base_url"),
  metadata: jsonb("metadata").$type<Record<string, unknown>>().default({}),
  version: integer("version").notNull().default(1),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

export const testSuites = pgTable("test_suites", {
  suiteId: text("suite_id").primaryKey(),
  frId: text("fr_id")
    .notNull()
    .references(() => functionalRequirements.id, { onDelete: "cascade" }),
  title: text("title").notNull(),
  description: text("description").notNull().default(""),
  metadata: jsonb("metadata").$type<Record<string, unknown>>().default({}),
  version: integer("version").notNull().default(1),
  // Suite-level manual quarantine (issue #260) — e.g. an environment is down
  // and every case under the suite is noisy; excludes the whole suite from a
  // green-light check without touching each case.
  quarantined: boolean("quarantined").notNull().default(false),
  quarantinedAt: timestamp("quarantined_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

export const testFixtures = pgTable("test_fixtures", {
  fixtureId: text("fixture_id").primaryKey(),
  suiteId: text("suite_id")
    .notNull()
    .references(() => testSuites.suiteId, { onDelete: "cascade" }),
  title: text("title").notNull(),
  baseUrl: text("base_url"),
  commonInput: jsonb("common_input").$type<Record<string, unknown>>().default({}),
  setupScript: text("setup_script"),
  teardownScript: text("teardown_script"),
  metadata: jsonb("metadata").$type<Record<string, unknown>>().default({}),
  version: integer("version").notNull().default(1),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

export const testCases = pgTable("test_cases", {
  caseId: text("case_id").primaryKey(),
  fixtureId: text("fixture_id")
    .notNull()
    .references(() => testFixtures.fixtureId, { onDelete: "cascade" }),
  title: text("title").notNull(),
  scriptType: scriptTypeEnum("script_type").notNull().default("single"),
  input: jsonb("input").$type<Record<string, unknown>>().default({}),
  runs: jsonb("runs").$type<Record<string, unknown>[]>().default([]),
  expected: jsonb("expected").$type<Record<string, unknown>>().default({}),
  // Raw TestCafe test body for scriptType "scripted" — used for multi-step
  // flows that don't fit the generic fill-fields/submit/assert model.
  script: text("script"),
  metadata: jsonb("metadata").$type<Record<string, unknown>>().default({}),
  version: integer("version").notNull().default(1),
  // Automatic flake detection (issue #260). flakeScore is the pass rate over
  // the last N stored results (0..1); a case whose score is strictly between
  // 0 and 1, or that failed then passed within one run's repeats, is flaky.
  // Recomputed after every run; lastFlakeAt only advances when a run is
  // actually flaky (not on every score refresh).
  flakeScore: real("flake_score"),
  lastFlakeAt: timestamp("last_flake_at", { withTimezone: true }),
  // A quarantined case still executes and records results but is excluded
  // from the blocking/green-light set (#263). `quarantinedReason` says
  // whether an operator set it or auto-quarantine crossed the threshold;
  // manual quarantine/unquarantine always overrides auto.
  quarantined: boolean("quarantined").notNull().default(false),
  quarantinedAt: timestamp("quarantined_at", { withTimezone: true }),
  quarantineReason: quarantineReasonEnum("quarantine_reason"),
  // TDD-gate provisioning (issue #262). A manually-authored case is "active";
  // a case scaffolded from a TasksAI acceptance criterion is "pending" and
  // carries a loose ref back to its provision + criterion (results get
  // pruned/re-seeded independently, so no FK — same convention as
  // issues.resultId above).
  scenarioState: pendingScenarioStateEnum("scenario_state").notNull().default("active"),
  provisionId: text("provision_id"),
  criterionRef: text("criterion_ref"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

export const testResults = pgTable("test_results", {
  id: text("id").primaryKey(),
  caseId: text("case_id")
    .notNull()
    .references(() => testCases.caseId, { onDelete: "cascade" }),
  status: testStatusEnum("status").notNull().default("pending"),
  runIndex: integer("run_index"),
  durationMs: integer("duration_ms"),
  details: jsonb("details").$type<Record<string, unknown>>().default({}),
  errorMessage: text("error_message"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

// Named deployments a run can be pointed at, per app. Each app (project) carries
// its own Local / Remote (and any user-added) targets, so switching apps offers
// that app's own environments. Built-in entries are seeded (seeded = true) and
// reconciled by seedDatabase(); user-added ones (seeded = false) are created via
// the Run page's "Add new…" flow and never pruned.
export const targetEnvironments = pgTable("target_environments", {
  // Seeded ids are stable (`${projectId}:${slug}`); custom ones are random uuids.
  id: text("id").primaryKey(),
  projectId: text("project_id").notNull().default("asafarim-timelineai"),
  name: text("name").notNull(),
  baseUrl: text("base_url").notNull(),
  apiUrl: text("api_url").notNull(),
  // Built-in (reconciled from code on each seed) vs user-added (kept as-is).
  seeded: boolean("seeded").notNull().default(false),
  // Orders the dropdown; seeded entries come first in their defined order.
  sortOrder: integer("sort_order").notNull().default(0),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

export const outboundEventStatusEnum = pgEnum("outbound_event_status", [
  "pending",
  // claimed by a dispatch run, in flight — prevents a concurrent dispatch
  // call (request-path trigger racing a redrive) from double-sending.
  "processing",
  "sent",
  "failed",
  "dead",
]);

// Testora → TasksAI signed webhooks (issue #260 producer, #261 dispatcher).
// A producer (flake detection, a future regression detector) enqueues a row
// here inside the same transaction as its own write; the outbound dispatcher
// worker (#261) drains `pending` rows, signs and POSTs the event, and only
// then marks it `sent` — an at-least-once outbox, the same shape as the
// platform's other transactional-outbox usages.
export const outboundEvents = pgTable("outbound_events", {
  id: text("id").primaryKey(),
  projectId: text("project_id").notNull(),
  /** contract WebhookEventType, e.g. "flake.detected" */
  eventType: text("event_type").notNull(),
  /** the contract event `data` payload (not the signed envelope — the
   *  dispatcher wraps it, since deliveryId/timestamp are assigned at send time) */
  payload: jsonb("payload").$type<Record<string, unknown>>().notNull(),
  // The green-light callback (issue #263) goes to the provision's own
  // callbackUrl, not the project's general webhook subscriptions — set only
  // for that event type. Signed with the project's configured webhook
  // secret (same trust relationship as the general dispatch).
  directUrl: text("direct_url"),
  status: outboundEventStatusEnum("status").notNull().default("pending"),
  attempts: integer("attempts").notNull().default(0),
  lastError: text("last_error"),
  availableAt: timestamp("available_at", { withTimezone: true }).notNull().defaultNow(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

// Per-project outbound endpoint (issue #261). A project can register more
// than one (e.g. a staging TasksAI workspace and a production one); each has
// its own signing secret — the same secret TasksAI's Integration row stores
// for this appId, so its signature also doubles as the delivery's routing
// key on the receiving end (see @asafarim/testora-tasksai-contract).
export const outboundWebhooks = pgTable("outbound_webhooks", {
  id: text("id").primaryKey(),
  projectId: text("project_id").notNull(),
  url: text("url").notNull(),
  secret: text("secret").notNull(),
  enabled: boolean("enabled").notNull().default(true),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

// One row per delivery attempt, per webhook — the delivery log referenced in
// the issue's "/settings/webhooks" acceptance. Kept even after the
// underlying outbound_events row is pruned/reused.
export const outboundDeliveries = pgTable("outbound_deliveries", {
  id: text("id").primaryKey(),
  webhookId: text("webhook_id").notNull(),
  outboundEventId: text("outbound_event_id").notNull(),
  eventType: text("event_type").notNull(),
  /** the deliveryId placed in the signed envelope / x-asafarim-delivery header */
  deliveryId: text("delivery_id").notNull(),
  attempt: integer("attempt").notNull().default(1),
  status: outboundEventStatusEnum("status").notNull().default("pending"),
  responseStatus: integer("response_status"),
  error: text("error"),
  deliveredAt: timestamp("delivered_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

// TDD-gate provisioning (issue #262): one row per TasksAI task that asked
// Testora to scaffold acceptance-criteria scenarios. `id` is the contract
// provisionId from the FIRST request for a given taskRef — re-provisioning
// (same taskRef) updates this row and its scaffold set rather than minting a
// new identity, so anything TasksAI already correlated against the original
// provisionId (a check, a proposal) keeps pointing at the same provision.
export const provisions = pgTable("provisions", {
  id: text("id").primaryKey(),
  projectId: text("project_id").notNull(),
  frId: text("fr_id").notNull(),
  taskRef: text("task_ref").notNull(),
  checkRef: text("check_ref").notNull(),
  featureTitle: text("feature_title").notNull(),
  callbackUrl: text("callback_url").notNull(),
  requiredRuns: integer("required_runs").notNull().default(3),
  causationId: text("causation_id"),
  // Stamped the first time this provision's linked scenarios go green
  // (issue #263) — the idempotency marker: greenlight.reached fires exactly
  // once per provision, on that transition, not on every subsequent clean run.
  greenAt: timestamp("green_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),

  // one active provision per TasksAI task
}, (table) => ({
  taskRefUnique: uniqueIndex("provisions_task_ref_unique").on(table.taskRef),
}));

export const functionalRequirementsRelations = relations(functionalRequirements, ({ many }) => ({
  suites: many(testSuites),
}));

export const testSuitesRelations = relations(testSuites, ({ one, many }) => ({
  functionalRequirement: one(functionalRequirements, {
    fields: [testSuites.frId],
    references: [functionalRequirements.id],
  }),
  fixtures: many(testFixtures),
}));

export const testFixturesRelations = relations(testFixtures, ({ one, many }) => ({
  suite: one(testSuites, {
    fields: [testFixtures.suiteId],
    references: [testSuites.suiteId],
  }),
  cases: many(testCases),
}));

export const testCasesRelations = relations(testCases, ({ one, many }) => ({
  fixture: one(testFixtures, {
    fields: [testCases.fixtureId],
    references: [testFixtures.fixtureId],
  }),
  results: many(testResults),
}));

export const testResultsRelations = relations(testResults, ({ one }) => ({
  case: one(testCases, {
    fields: [testResults.caseId],
    references: [testCases.caseId],
  }),
}));

export const issuesRelations = relations(issues, ({ one }) => ({
  project: one(projects, {
    fields: [issues.projectId],
    references: [projects.id],
  }),
}));
