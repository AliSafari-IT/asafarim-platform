/**
 * TasksAI coverage manifest (#742): every scenario of the issue's catalog →
 * stable case ids, the role it runs as, whether it writes data, and which
 * targets may run it. tasksai-coverage.test.ts enforces the rules below, so
 * the manifest can't drift from the executable catalog.
 *
 * Rules:
 *   - `mutates` scenarios never list "remote-smoke" (the deployment). Remote
 *     mutation runs only on the isolated "remote-test" environment.
 *   - `planned` entries reserve their case ids; `implemented` entries' case ids
 *     must exist in the TasksAI bundle; `excluded` entries carry a reason.
 *   - Each slice's PR flips the entries it delivers to `implemented`.
 */

/** Seeded target slugs (see the TasksAI entry in src/data/projects.ts). */
export type TasksaiTarget = "local" | "remote-smoke" | "remote-test";
export type TasksaiRole = "signed-out" | "guest" | "member" | "admin" | "owner" | "outsider" | "member+member";
export type MutationClass = "read" | "mutates";
export type CoverageStatus = "planned" | "implemented" | "excluded";

export interface CoverageEntry {
  /** Stable scenario id: tasksai.<group>.<scenario>. */
  id: string;
  group: TasksaiGroup;
  scenario: string;
  role: TasksaiRole;
  mutation: MutationClass;
  targets: TasksaiTarget[];
  /** Stable case ids that cover it (reserved while planned). */
  caseIds: string[];
  /** Synthetic data / capabilities the cases need (slice 2 provisions them). */
  prerequisites: string[];
  /** The #742 delivery slice that implements it. */
  slice: 3 | 4 | 5 | 6;
  status: CoverageStatus;
  /** Why it is excluded (required when status is "excluded"). */
  reason?: string;
}

/** The groups of #742's scenario table, plus its two end-to-end fixtures. */
export const TASKSAI_GROUPS = [
  "auth",
  "home",
  "isolation",
  "capture",
  "inbox",
  "projects",
  "task-details",
  "my-work",
  "views",
  "subtasks",
  "dependencies",
  "completion-checks",
  "comments",
  "search",
  "focus",
  "copilot-proposal",
  "copilot-apply",
  "ai-safeguards",
  "imports",
  "automations",
  "analytics",
  "permissions",
  "concurrency",
  "recovery",
  "a11y",
  "daily-work",
  "ai-planning",
] as const;
export type TasksaiGroup = (typeof TASKSAI_GROUPS)[number];

const READ_ALL: TasksaiTarget[] = ["local", "remote-smoke", "remote-test"];
const WRITE: TasksaiTarget[] = ["local", "remote-test"];

const BASELINE = "synthetic baseline workspace";
const TWO_WS = "two synthetic workspaces";
const AI_FIXTURE = "deterministic AI provider";
const WORKER = "automation worker";

function entry(
  group: TasksaiGroup,
  key: string,
  scenario: string,
  role: TasksaiRole,
  mutation: MutationClass,
  slice: CoverageEntry["slice"],
  prerequisites: string[],
  // Remote smoke (the deployment) gets read scenarios that need at most the
  // synthetic baseline account: no extra workspaces, clocks or AI fixtures there.
  targets: TasksaiTarget[] = mutation === "read" && prerequisites.every((p) => p === BASELINE) ? READ_ALL : WRITE,
): CoverageEntry {
  const id = `tasksai.${group}.${key}`;
  return { id, group, scenario, role, mutation, targets, caseIds: [`tasksai-${group}-${key}`], prerequisites, slice, status: "planned" };
}

export const TASKSAI_COVERAGE: CoverageEntry[] = [
  // Authentication
  entry("auth", "redirect-to-hub", "Protected workspace redirects through the target's Hub", "signed-out", "read", 3, []),
  entry("auth", "login-returns", "Sign-in returns to the selected TasksAI origin and workspace", "member", "read", 3, [BASELINE]),
  entry("auth", "invalid-sign-in", "Invalid sign-in gives useful feedback", "signed-out", "read", 3, []),
  entry("auth", "sign-out", "Sign-out prevents further protected access", "member", "read", 3, [BASELINE]),

  // Home / onboarding / navigation
  entry("home", "empty-next-actions", "Empty workspace offers next actions", "member", "read", 5, ["empty synthetic workspace"]),
  entry("home", "populated", "Populated Home shows the workspace's data", "member", "read", 5, [BASELINE]),
  entry("home", "destinations", "All main destinations load", "member", "read", 5, [BASELINE]),
  entry("home", "breadcrumbs-palette", "Project breadcrumbs and command palette navigate correctly", "member", "read", 5, [BASELINE]),

  // Workspace isolation
  entry("isolation", "switch", "Switching workspaces changes projects, tasks, search and settings", "member", "read", 4, [TWO_WS]),
  entry("isolation", "direct-access-denied", "Direct access to another workspace's task or project is denied", "outsider", "read", 4, [TWO_WS]),

  // Capture / validation
  entry("capture", "global", "Global capture from several pages lands in Inbox without losing context", "member", "mutates", 5, [BASELINE]),
  entry("capture", "blank-rejected", "Blank or whitespace title is rejected", "member", "read", 5, [BASELINE]),
  entry("capture", "unicode-boundaries", "Punctuation, Unicode and input-length boundaries are preserved", "member", "mutates", 5, [BASELINE]),

  // Inbox triage
  entry("inbox", "untriaged", "A captured task starts untriaged", "member", "mutates", 5, [BASELINE]),
  entry("inbox", "organize", "Organizing moves it into project planning and out of Inbox", "member", "mutates", 5, [BASELINE]),
  entry("inbox", "organized-not-inbox", "Already-organized tasks are not Inbox captures", "member", "read", 5, [BASELINE]),

  // Projects
  entry("projects", "create", "Create a project and a task; both persist after reload", "member", "mutates", 5, [BASELINE]),
  entry("projects", "validation", "Required fields and duplicate keys are validated", "member", "read", 5, [BASELINE]),
  entry("projects", "empty-guidance", "An empty project gives useful guidance", "member", "read", 5, ["empty synthetic project"]),

  // Task details
  entry("task-details", "edit-persist", "Edit title, description, assignee, due date, status and labels; persists after refresh", "member", "mutates", 5, [BASELINE]),
  entry("task-details", "invalid-input", "Invalid inputs are rejected with feedback", "member", "read", 5, [BASELINE]),
  entry("task-details", "other-views", "Updates show in the other relevant views", "member", "mutates", 5, [BASELINE]),

  // My Work
  entry("my-work", "assignment", "Self-assigned vs other/unassigned tasks", "member", "read", 5, [BASELINE]),
  entry("my-work", "grouping", "Overdue / Today / Blocked / Upcoming / No due date grouping by app rules", "member", "read", 5, [BASELINE, "controlled clock/timezone"]),
  entry("my-work", "regroup-on-edit", "A due-date edit moves the task to the right group", "member", "mutates", 5, [BASELINE]),
  entry("my-work", "completed", "Completed work behaves consistently with the view", "member", "read", 5, [BASELINE]),

  // Views
  entry("views", "consistent", "List / Board / Calendar / Timeline show consistent records, dates, completion and status", "member", "read", 5, [BASELINE]),
  entry("views", "undated", "Undated tasks behave as each view defines", "member", "read", 5, [BASELINE]),

  // Subtasks
  entry("subtasks", "create-open", "Create and open a subtask; parent relationship and breadcrumb", "member", "mutates", 5, [BASELINE]),
  entry("subtasks", "back-to-parent", "Navigation returns to the correct parent", "member", "read", 5, [BASELINE]),
  entry("subtasks", "completion", "Supported subtask completion behavior", "member", "mutates", 5, [BASELINE]),

  // Dependencies
  entry("dependencies", "blocks-both-sides", "A blocks / blocked-by relation shows on both tasks", "member", "mutates", 5, [BASELINE]),
  entry("dependencies", "relates-duplicates", "Relates / duplicates where supported", "member", "mutates", 5, [BASELINE]),
  entry("dependencies", "self-or-cycle-rejected", "Self-links and cycles are rejected where the domain disallows them", "member", "read", 5, [BASELINE]),

  // Completion checks
  entry("completion-checks", "pending-blocks", "A pending required check blocks completion with a named reason", "member", "read", 5, [BASELINE]),
  entry("completion-checks", "satisfied-allows", "Satisfying the check permits completion, which persists", "member", "mutates", 5, [BASELINE]),
  entry("completion-checks", "member-no-override", "A member cannot use the admin-only override", "member", "read", 4, [BASELINE]),
  entry("completion-checks", "admin-override-recorded", "An authorized override is recorded", "admin", "mutates", 4, [BASELINE]),

  // Comments
  entry("comments", "add-reopen", "Add a comment; reopen shows it with author on the right task", "member", "mutates", 5, [BASELINE]),
  entry("comments", "invalid", "Empty or invalid comment is handled", "member", "read", 5, [BASELINE]),
  entry("comments", "cross-workspace-denied", "Cross-workspace comment access is denied", "outsider", "read", 4, [TWO_WS]),

  // Search
  entry("search", "find-open", "Find a task / project / comment / label and open the right result", "member", "read", 5, [BASELINE]),
  entry("search", "no-results", "No-result guidance", "member", "read", 5, [BASELINE]),
  entry("search", "saved-search", "Save and reopen a search with current matches", "member", "mutates", 5, [BASELINE]),
  entry("search", "scope", "Results stay within the workspace and the guest's projects", "guest", "read", 4, [TWO_WS, "guest membership"]),

  // Focus
  entry("focus", "explainable", "Known data yields explainable prioritization with ranking factors", "member", "read", 5, [BASELINE, "controlled clock/timezone"]),
  entry("focus", "override", "A supported override changes the behavior as described", "member", "mutates", 5, [BASELINE]),
  entry("focus", "empty", "Empty state offers a next action", "member", "read", 5, ["empty synthetic workspace"]),

  // Copilot proposal boundary
  entry("copilot-proposal", "generate", "Generate from synthetic notes: grouped create/update/link diff, citations, confidence", "member", "read", 6, [BASELINE, AI_FIXTURE]),
  entry("copilot-proposal", "no-change-before-apply", "No domain change before apply", "member", "read", 6, [BASELINE, AI_FIXTURE]),
  entry("copilot-proposal", "reject-unchanged", "Reject / dismiss leaves data unchanged", "member", "read", 6, [BASELINE, AI_FIXTURE]),

  // Copilot review / apply
  entry("copilot-apply", "subset", "Edit the proposal, accept a subset; only chosen operations apply to the intended project", "member", "mutates", 6, [BASELINE, AI_FIXTURE]),
  entry("copilot-apply", "links", "Generated links are correct", "member", "mutates", 6, [BASELINE, AI_FIXTURE]),
  entry("copilot-apply", "no-duplicate", "A repeated apply does not duplicate work", "member", "mutates", 6, [BASELINE, AI_FIXTURE]),
  entry("copilot-apply", "undo-feedback", "Undo and feedback behave as supported", "member", "mutates", 6, [BASELINE, AI_FIXTURE]),

  // AI safeguards / fallback
  entry("ai-safeguards", "unavailable", "AI disabled / provider failure / quota gives understandable feedback; ordinary work stays usable", "member", "read", 6, [BASELINE, "AI-unavailable mode"]),
  entry("ai-safeguards", "no-privileged-actions", "Notes asking for privileged changes can't touch membership, permissions or excluded fields", "member", "read", 6, [BASELINE, AI_FIXTURE]),

  // Imports
  entry("imports", "csv-json-apply", "CSV and JSON preview then apply with correct mapping, counts and destination", "member", "mutates", 5, [BASELINE, "import samples"]),
  entry("imports", "malformed", "Malformed / missing-field input gives row-level guidance", "member", "read", 5, [BASELINE, "import samples"]),
  entry("imports", "capture-to-inbox", "The capture-to-Inbox option works", "member", "mutates", 5, [BASELINE, "import samples"]),
  entry("imports", "handoff-idempotent", "Repeating an identical Workbench handoff creates no duplicates", "member", "mutates", 5, [BASELINE, "handoff samples"]),

  // Automations
  entry("automations", "draft-validate", "Create a draft; rule input is validated", "admin", "mutates", 5, [BASELINE]),
  entry("automations", "dry-run", "Dry-run shows planned actions without applying them", "admin", "read", 5, [BASELINE, "automation draft"]),
  entry("automations", "activate-trigger", "Activate in an isolated workspace, trigger, verify condition/action and bounded execution", "admin", "mutates", 5, [BASELINE, WORKER]),
  entry("automations", "disable", "Disabling stops later execution", "admin", "mutates", 5, [BASELINE, WORKER]),

  // Analytics
  entry("analytics", "aggregates", "Aggregates and project scope match an independently calculated expectation", "member", "read", 5, [BASELINE, "known completed/aging work"]),
  entry("analytics", "empty", "Empty state", "member", "read", 5, ["empty synthetic workspace"]),
  entry("analytics", "work-not-people", "Reports concern work, not individual performance", "member", "read", 5, [BASELINE]),

  // Permissions / settings
  entry("permissions", "guest-scope", "Guest sees only permitted projects and cannot mutate", "guest", "read", 4, [BASELINE, "guest membership"]),
  entry("permissions", "member-limits", "Member manages ordinary work but not membership, status definitions or custom fields", "member", "read", 4, [BASELINE]),
  entry("permissions", "admin-admin", "Admin performs supported administration", "admin", "mutates", 4, [BASELINE]),
  entry("permissions", "admin-no-archive", "Admin cannot archive the workspace", "admin", "read", 4, [BASELINE]),
  entry("permissions", "owner-archive", "Owner archives a disposable workspace", "owner", "mutates", 4, ["disposable synthetic workspace"]),

  // Concurrent editing
  entry("concurrency", "stale-update", "Two sessions edit one task; the stale update gets conflict feedback, not a silent overwrite", "member+member", "mutates", 5, [BASELINE]),

  // Recovery / persistence
  entry("recovery", "refresh-after-save", "Refresh after save keeps the change", "member", "mutates", 5, [BASELINE]),
  entry("recovery", "request-failure-retry", "Request failure during capture/edit/apply/import retries safely without duplicates", "member", "mutates", 5, [BASELINE]),
  entry("recovery", "session-expiry", "Session expiry is understandable", "member", "read", 5, [BASELINE]),
  entry("recovery", "cancel-run-cleanup", "Cancelling a Testora run stays bounded and cleans up", "member", "mutates", 5, [BASELINE, "per-run cleanup"]),

  // Accessibility / responsiveness
  entry("a11y", "widths", "Key journeys at desktop and mobile widths", "member", "read", 5, [BASELINE]),
  entry("a11y", "keyboard-focus", "Keyboard navigation, visible focus, labeled inputs, dialog focus return", "member", "read", 5, [BASELINE]),
  entry("a11y", "states", "Empty / error / loading states are usable", "member", "read", 5, [BASELINE]),

  // End-to-end fixtures
  entry("daily-work", "journey", "Sign in → capture → triage → assign self / due date → My Work → completion check → complete → persists", "member", "mutates", 3, [BASELINE]),
  entry("ai-planning", "journey", "Generate → review/edit → partially apply → verify → undo", "member", "mutates", 6, [BASELINE, AI_FIXTURE]),
];
