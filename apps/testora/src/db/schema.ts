import {
  pgTable,
  text,
  jsonb,
  timestamp,
  integer,
  boolean,
  pgEnum,
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
  projectId: text("project_id").notNull().default("immostory"),
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
  projectId: text("project_id").notNull().default("immostory"),
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
