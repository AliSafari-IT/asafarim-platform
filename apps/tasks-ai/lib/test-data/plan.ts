/**
 * TasksAI synthetic test data (#742 slice 2b): the pure half. Markers, the
 * workspace layout, the controlled clock, and which setup step provides each
 * prerequisite named in Testora's coverage manifest
 * (apps/testora/src/data/asafarim/tasksai-coverage.ts). No database access:
 * see ./provision.ts and scripts/test-data.ts.
 *
 * Markers: every synthetic record hangs off a workspace whose slug starts with
 * SYNTHETIC_SLUG_PREFIX. Cleanup deletes only those workspaces' rows. Records a
 * test RUN creates inside them carry RUN_TITLE_PREFIX in their title, so
 * `prune-runs` can remove abandoned run data without touching the baseline.
 */

import { buildHandoff, type HandoffEnvelope } from "@asafarim/tool-handoff";

export const SYNTHETIC_SLUG_PREFIX = "tasksai-synthetic-";
/** Title prefix for records a Testora run creates: `[run:<runId>] …`. */
export const RUN_TITLE_PREFIX = "[run:";

export const WORKSPACES = {
  /** The synthetic baseline: projects, tasks, checks, comments, searches… */
  main: `${SYNTHETIC_SLUG_PREFIX}main`,
  /** A second workspace for switching and isolation checks. */
  second: `${SYNTHETIC_SLUG_PREFIX}second`,
  /** No projects: empty-state checks. */
  empty: `${SYNTHETIC_SLUG_PREFIX}empty`,
  /** AI disabled: the AI-unavailable fallback. */
  aiOff: `${SYNTHETIC_SLUG_PREFIX}ai-off`,
  /** Owner-only archival test target; recreated by `reset`. */
  disposable: `${SYNTHETIC_SLUG_PREFIX}disposable`,
} as const;
export type WorkspaceKey = keyof typeof WORKSPACES;

export function isSyntheticSlug(slug: string): boolean {
  return slug.startsWith(SYNTHETIC_SLUG_PREFIX);
}

/** The identity keys the platform-side CLI writes (db:seed:tasksai-identities). */
export const IDENTITY_KEYS = ["owner", "admin", "member", "member2", "guest", "outsider"] as const;
export type IdentityKey = (typeof IDENTITY_KEYS)[number];

/** Remote smoke on production: only this identity and the main workspace, read-only data. */
export const PRODUCTION_BASELINE_IDENTITIES: readonly IdentityKey[] = ["member"];

export const DEFAULT_TIMEZONE = "Europe/Brussels";

/**
 * The calendar date `offsetDays` from `anchor` in `timeZone`, as an ISO
 * datetime at 12:00 UTC: noon can't cross midnight in any European zone, so
 * "today"/"overdue"/"upcoming" stay what they were set up to be on that day.
 */
export function relativeDue(anchor: Date, timeZone: string, offsetDays: number): string {
  const ymd = new Intl.DateTimeFormat("en-CA", { timeZone, year: "numeric", month: "2-digit", day: "2-digit" }).format(anchor);
  const base = new Date(`${ymd}T12:00:00.000Z`);
  base.setUTCDate(base.getUTCDate() + offsetDays);
  return base.toISOString();
}

export type PrerequisiteKind =
  /** setup creates it in the database */
  | "data"
  /** setup configures it (a setting on the synthetic workspaces) */
  | "configured"
  /** committed sample files setup checks and reports */
  | "files"
  /** not in TasksAI's database; the Testora preflight must check it */
  | "external";

export interface PrerequisiteProvision {
  kind: PrerequisiteKind;
  /** The setup step that provides it. */
  step: string;
  how: string;
}

/**
 * Every prerequisite string used in Testora's TasksAI coverage manifest →
 * how setup provides it. lib/test-data/plan.test.ts fails if the manifest
 * names one that isn't here.
 */
export const PREREQUISITES: Record<string, PrerequisiteProvision> = {
  "synthetic baseline workspace": {
    kind: "data",
    step: "workspace:main",
    how: "Workspace tasksai-synthetic-main: owner/admin/member/member2/guest memberships, projects, tasks, labels, comments, checks, relations, saved search.",
  },
  "two synthetic workspaces": {
    kind: "data",
    step: "workspace:second",
    how: "tasksai-synthetic-second with its own project and a task that must never appear in main.",
  },
  "empty synthetic workspace": { kind: "data", step: "workspace:empty", how: "tasksai-synthetic-empty: memberships, no projects." },
  "empty synthetic project": { kind: "data", step: "workspace:main", how: "Project SYNE (Synthetic Empty Project) in main, with no tasks." },
  "guest membership": { kind: "data", step: "workspace:main", how: "guest is a workspace guest with a project membership on SYNG only." },
  "known completed/aging work": {
    kind: "data",
    step: "workspace:main",
    how: "Completed tasks plus an open task started 30 days before the anchor, for Analytics expectations.",
  },
  "disposable synthetic workspace": { kind: "data", step: "workspace:disposable", how: "tasksai-synthetic-disposable, owner + admin only; `reset` recreates it after an archival test." },
  "automation draft": { kind: "data", step: "workspace:main", how: "A draft automation rule created by admin in main." },
  "controlled clock/timezone": {
    kind: "configured",
    step: "clock",
    how: "Due dates are set relative to the anchor date in the timezone (default Europe/Brussels) and recorded in the output file; `reset` re-anchors them.",
  },
  "deterministic AI provider": { kind: "configured", step: "ai-settings", how: "AiSettings provider=fixture, model=fixture-1, enabled on every synthetic workspace except ai-off." },
  "AI-unavailable mode": { kind: "configured", step: "workspace:ai-off", how: "tasksai-synthetic-ai-off has AiSettings enabled=false." },
  "import samples": { kind: "files", step: "samples", how: "scripts/test-data/samples: valid CSV/JSON, malformed and missing-field files." },
  "handoff samples": {
    kind: "files",
    step: "handoff-samples",
    how: "setup writes a fresh AI Workbench handoff (@asafarim/tool-handoff, tasksai-tasks/1) and a byte-identical duplicate (same handoffId) to .tasksai-test/; handoffs expire, so they are never committed.",
  },
  "per-run cleanup": {
    kind: "data",
    step: "prune-runs",
    how: `Run-created records carry the "${RUN_TITLE_PREFIX}<runId>]" title prefix; \`prune-runs\` deletes them (all, one run, or older than N hours) and nothing else.`,
  },
  "automation worker": {
    kind: "external",
    step: "-",
    how: "The worker's liveness is a queue heartbeat, not a database row: Testora's slice-5 preflight checks it.",
  },
};

/** Prerequisites setup can't provide; each needs a stated reason (`how`). */
export const EXTERNAL_PREREQUISITES = Object.entries(PREREQUISITES)
  .filter(([, p]) => p.kind === "external")
  .map(([name]) => name);

/** The committed import samples (relative to scripts/test-data/samples). */
export const SAMPLE_FILES = [
  "import-valid.csv",
  "import-valid.json",
  "import-malformed.csv",
  "import-missing-fields.csv",
] as const;

/**
 * A real AI Workbench handoff to TasksAI and its exact duplicate (same
 * handoffId — the destination's idempotency key). Built at setup time:
 * handoffs expire, so a committed one would go stale.
 */
export function buildHandoffSamples(now: Date): { handoff: HandoffEnvelope<"tasksai">; duplicate: HandoffEnvelope<"tasksai"> } {
  const handoff = buildHandoff(
    "tasksai",
    { app: "web", tool: "notes-to-action-plan", toolVersion: "1.0.0", schemaVersion: "action-plan/1" },
    {
      title: "Synthetic handoff plan",
      objective: "Exercise TasksAI's handoff import with synthetic data.",
      tasks: [
        { ref: "t1", title: "Synthetic handoff task one", description: "First task from the handoff.", basis: "extracted", evidence: ["Synthetic note line 1"], waitsFor: [] },
        { ref: "t2", title: "Synthetic handoff task two", description: "Waits for task one.", basis: "inferred", evidence: ["Synthetic note line 2"], waitsFor: ["t1"] },
      ],
      risks: [],
      questions: [],
    },
    { now },
  );
  return { handoff, duplicate: structuredClone(handoff) };
}
