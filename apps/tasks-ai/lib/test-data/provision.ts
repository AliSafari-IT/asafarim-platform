/**
 * TasksAI synthetic test data (#742 slice 2b): setup / verify / cleanup /
 * prune-runs against a TasksAI database. Driven by scripts/test-data.ts; the
 * guard (./guard.ts) has already decided this database may be written.
 *
 * Domain rows go through TasksAI's own services with a request context per
 * synthetic member, so the activity/outbox invariants and validation hold.
 * Only workspace + membership creation is done here directly, mirroring
 * services/workspaces.ts (which takes its owner from the session).
 *
 * Never touches a workspace whose slug lacks SYNTHETIC_SLUG_PREFIX.
 */
import { randomUUID } from "node:crypto";
import { Prisma, type MemberRole, type PrismaClient } from "../db/generated";
import type { RequestContext } from "../context";
import { emitActivity } from "../events/emit";
import { EVENT } from "../events/names";
import { seedDefaultStatuses } from "../services/statuses";
import { createProject } from "../services/projects";
import { completeTask, createTask, linkTasks } from "../services/tasks";
import { assignLabel, createLabel } from "../services/labels";
import { addComment } from "../services/comments";
import { applyCheckState, createCheck } from "../services/task-checks";
import { createSavedSearch } from "../search/saved";
import { createRule } from "../automations/service";
import {
  DEFAULT_TIMEZONE,
  RUN_TITLE_PREFIX,
  SYNTHETIC_SLUG_PREFIX,
  WORKSPACES,
  relativeDue,
  type IdentityKey,
  type WorkspaceKey,
} from "./plan";
import type { TestDataMode } from "./guard";

/** identity key → opaque platform user id (from the platform-side identities file). */
export type IdentityMap = Partial<Record<IdentityKey, string>>;

export interface SetupOptions {
  mode: TestDataMode;
  identities: IdentityMap;
  anchor?: Date;
  timeZone?: string;
}

export interface WorkspaceOutcome {
  slug: string;
  id: string;
  created: boolean;
}

export interface SetupResult {
  anchor: string;
  timeZone: string;
  workspaces: Partial<Record<WorkspaceKey, WorkspaceOutcome>>;
  /** Stable handles for later slices' fixtures (ids of baseline records). */
  handles: Record<string, string>;
}

interface MemberSpec {
  identity: IdentityKey;
  role: MemberRole;
}

const WORKSPACE_MEMBERS: Record<WorkspaceKey, { name: string; members: MemberSpec[] }> = {
  main: {
    name: "Synthetic · Main",
    members: [
      { identity: "owner", role: "owner" },
      { identity: "admin", role: "admin" },
      { identity: "member", role: "member" },
      { identity: "member2", role: "member" },
      { identity: "guest", role: "guest" },
    ],
  },
  second: {
    name: "Synthetic · Second",
    members: [
      { identity: "owner", role: "owner" },
      { identity: "member", role: "member" },
    ],
  },
  empty: {
    name: "Synthetic · Empty",
    members: [
      { identity: "owner", role: "owner" },
      { identity: "member", role: "member" },
    ],
  },
  aiOff: {
    name: "Synthetic · AI off",
    members: [
      { identity: "owner", role: "owner" },
      { identity: "member", role: "member" },
    ],
  },
  disposable: {
    name: "Synthetic · Disposable",
    members: [
      { identity: "owner", role: "owner" },
      { identity: "admin", role: "admin" },
    ],
  },
};

// ─── setup ───────────────────────────────────────────────────────────────

export async function setupTestData(db: PrismaClient, options: SetupOptions): Promise<SetupResult> {
  const anchor = options.anchor ?? new Date();
  const timeZone = options.timeZone ?? DEFAULT_TIMEZONE;
  const result: SetupResult = { anchor: anchor.toISOString(), timeZone, workspaces: {}, handles: {} };
  const keys: WorkspaceKey[] = options.mode === "production-baseline" ? ["main"] : ["main", "second", "empty", "aiOff", "disposable"];

  for (const key of keys) {
    const slug = WORKSPACES[key];
    const existing = await db.workspace.findUnique({ where: { slug }, select: { id: true } });
    if (existing) {
      // Idempotent: a present workspace is left exactly as it is (use `reset` to rebuild).
      result.workspaces[key] = { slug, id: existing.id, created: false };
      continue;
    }
    const spec = WORKSPACE_MEMBERS[key];
    const members =
      options.mode === "production-baseline"
        ? // Only the member identity exists there; it is the workspace's only member.
          [{ identity: "member" as const, role: "member" as const }]
        : spec.members;
    const ws = await createSyntheticWorkspace(db, slug, spec.name, members, options.identities);
    result.workspaces[key] = { slug, id: ws.id, created: true };

    await db.aiSettings.upsert({
      where: { workspaceId: ws.id },
      create: { workspaceId: ws.id, provider: "fixture", model: "fixture-1", enabled: key !== "aiOff" },
      update: { provider: "fixture", model: "fixture-1", enabled: key !== "aiOff" },
    });

    const ctx = (identity: IdentityKey, roleOverride?: MemberRole) => {
      const m = ws.memberships[identity];
      if (!m) throw new Error(`${slug}: no membership for ${identity}`);
      return context(db, ws, m, roleOverride);
    };
    // Who builds the content: the owner, or (production baseline) the member
    // acting with owner rights for this provisioning run only.
    const builder = options.mode === "production-baseline" ? ctx("member", "owner") : ctx("owner");

    if (key === "main") Object.assign(result.handles, await buildMain(db, ws, builder, ctx, anchor, timeZone, options.mode));
    if (key === "second") {
      const project = await createProject(builder, { name: "Second Workspace Project", key: "SYNS" });
      const task = await createTask(builder, { projectId: project.id, title: "Synthetic · Second-workspace secret task" });
      result.handles.secondProjectId = project.id;
      result.handles.secondSecretTaskId = task.id;
    }
    if (key === "aiOff") {
      const project = await createProject(builder, { name: "AI Off Project", key: "SYNX" });
      await createTask(builder, { projectId: project.id, title: "Synthetic · Ordinary work without AI", assigneeId: ws.memberships.member?.id });
    }
  }
  return result;
}

async function buildMain(
  db: PrismaClient,
  ws: SyntheticWorkspace,
  builder: RequestContext,
  ctx: (identity: IdentityKey, role?: MemberRole) => RequestContext,
  anchor: Date,
  timeZone: string,
  mode: TestDataMode,
): Promise<Record<string, string>> {
  const due = (days: number) => relativeDue(anchor, timeZone, days);
  const member = ws.memberships.member?.id;
  const member2 = ws.memberships.member2?.id;
  const h: Record<string, string> = {};

  const alpha = await createProject(builder, { name: "Synthetic Alpha", key: "SYNA", description: "Populated synthetic project." });
  const guestProject = await createProject(builder, { name: "Synthetic Guest Project", key: "SYNG" });
  const empty = await createProject(builder, { name: "Synthetic Empty Project", key: "SYNE" });
  Object.assign(h, { alphaProjectId: alpha.id, guestProjectId: guestProject.id, emptyProjectId: empty.id });

  if (ws.memberships.guest) {
    await db.projectMembership.create({
      data: { projectId: guestProject.id, membershipId: ws.memberships.guest.id, role: "guest" },
    });
  }

  const bug = await createLabel(builder, { name: "synthetic-bug", color: "#d14343" });
  const ux = await createLabel(builder, { name: "synthetic-ux", color: "#3d7be0" });
  Object.assign(h, { bugLabelId: bug.id, uxLabelId: ux.id });

  const task = async (handle: string, input: Record<string, unknown>) => {
    const t = await createTask(builder, { projectId: alpha.id, ...input });
    h[handle] = t.id;
    return t;
  };
  const overdue = await task("overdueTaskId", { title: "Synthetic · Overdue", assigneeId: member, dueDate: due(-3) });
  const today = await task("todayTaskId", { title: "Synthetic · Due today", assigneeId: member, dueDate: due(0) });
  await task("upcomingTaskId", { title: "Synthetic · Upcoming", assigneeId: member, dueDate: due(5) });
  await task("undatedTaskId", { title: "Synthetic · No due date", assigneeId: member });
  await task("otherMemberTaskId", { title: "Synthetic · Assigned to another member", assigneeId: member2, dueDate: due(2) });
  await task("unassignedTaskId", { title: "Synthetic · Unassigned", dueDate: due(7) });
  const blocker = await task("blockerTaskId", { title: "Synthetic · Blocker", assigneeId: member2 ?? member });
  const blocked = await task("blockedTaskId", { title: "Synthetic · Blocked", assigneeId: member, dueDate: due(1) });
  await linkTasks(builder, blocker.id, { toTaskId: blocked.id, kind: "blocks" });
  const parent = await task("parentTaskId", { title: "Synthetic · Parent", assigneeId: member });
  await task("subtaskId", { title: "Synthetic · Subtask", parentId: parent.id, assigneeId: member });
  const relA = await task("relatesFromTaskId", { title: "Synthetic · Relates A" });
  const relB = await task("relatesToTaskId", { title: "Synthetic · Relates B" });
  await linkTasks(builder, relA.id, { toTaskId: relB.id, kind: "relates" });

  const pending = await task("checkPendingTaskId", { title: "Synthetic · Completion check pending", assigneeId: member });
  await createCheck(builder, pending.id, { source: "testora", key: "synthetic-pending-check" });
  const satisfied = await task("checkSatisfiedTaskId", { title: "Synthetic · Completion check satisfied", assigneeId: member });
  const check = await createCheck(builder, satisfied.id, { source: "testora", key: "synthetic-satisfied-check" });
  await db.$transaction((tx) =>
    applyCheckState(tx, { workspaceId: ws.id, checkId: check.id, taskId: satisfied.id, state: "satisfied", correlationId: randomUUID() }),
  );

  // Analytics: known completed and aging work.
  for (const [i, title] of ["Synthetic · Completed one", "Synthetic · Completed two"].entries()) {
    const done = await task(`completedTask${i + 1}Id`, { title, assigneeId: member, dueDate: due(-2) });
    await completeTask(builder, done.id);
  }
  await task("agingTaskId", { title: "Synthetic · Aging open work", assigneeId: member, startDate: due(-30), dueDate: due(-20) });

  await assignLabel(builder, overdue.id, bug.id);
  await assignLabel(builder, today.id, ux.id);

  for (const title of ["Synthetic · Guest-visible one", "Synthetic · Guest-visible two"]) {
    await createTask(builder, { projectId: guestProject.id, title });
  }

  if (ws.memberships.member) {
    const comment = await addComment(ctx("member"), today.id, { body: "Synthetic comment by the member." });
    h.commentId = comment.id;
    const saved = await createSavedSearch(ctx("member"), { name: "Synthetic open work", query: "Synthetic" });
    h.savedSearchId = saved.id;
  }
  if (mode === "full" && ws.memberships.admin) {
    const rule = await createRule(ctx("admin"), {
      name: "Synthetic · Label new tasks",
      trigger: { event: "task.created" },
      actions: [{ type: "add_label", labelId: ux.id }],
    });
    h.automationDraftId = rule.id;
  }
  return h;
}

// ─── workspace + memberships ─────────────────────────────────────────────

interface SyntheticWorkspace {
  id: string;
  slug: string;
  memberships: Partial<Record<IdentityKey, { id: string; platformUserId: string; role: MemberRole }>>;
}

async function createSyntheticWorkspace(
  db: PrismaClient,
  slug: string,
  name: string,
  members: MemberSpec[],
  identities: IdentityMap,
): Promise<SyntheticWorkspace> {
  if (!slug.startsWith(SYNTHETIC_SLUG_PREFIX)) throw new Error(`not a synthetic slug: ${slug}`);
  const correlationId = randomUUID();
  return db.$transaction(async (tx) => {
    const workspace = await tx.workspace.create({ data: { name, slug } });
    const memberships: SyntheticWorkspace["memberships"] = {};
    for (const spec of members) {
      const platformUserId = identities[spec.identity];
      if (!platformUserId) throw new Error(`identity "${spec.identity}" is missing from the identities file`);
      const m = await tx.membership.create({ data: { workspaceId: workspace.id, platformUserId, role: spec.role } });
      memberships[spec.identity] = { id: m.id, platformUserId, role: spec.role };
    }
    await seedDefaultStatuses(tx, workspace.id);
    const first = Object.values(memberships)[0];
    await emitActivity(tx, workspace.id, correlationId, {
      name: EVENT.workspaceCreated,
      targetType: "workspace",
      targetId: workspace.id,
      actorId: first?.id ?? null,
      data: { name, slug, via: "test-data" },
    });
    for (const m of Object.values(memberships)) {
      await emitActivity(tx, workspace.id, correlationId, {
        name: EVENT.membershipAdded,
        targetType: "membership",
        targetId: m.id,
        actorType: "system",
        data: { role: m.role, via: "test-data" },
      });
    }
    return { id: workspace.id, slug, memberships };
  });
}

function context(
  db: PrismaClient,
  ws: SyntheticWorkspace,
  m: { id: string; platformUserId: string; role: MemberRole },
  roleOverride?: MemberRole,
): RequestContext {
  return {
    db,
    workspaceId: ws.id,
    workspaceSlug: ws.slug,
    actor: { membershipId: m.id, platformUserId: m.platformUserId, role: roleOverride ?? m.role },
    correlationId: randomUUID(),
  };
}

// ─── cleanup ─────────────────────────────────────────────────────────────

/** Delegate names of every model with a workspaceId column (except Workspace itself). */
function workspaceScopedDelegates(): string[] {
  return Prisma.dmmf.datamodel.models
    .filter((m) => m.name !== "Workspace" && m.fields.some((f) => f.name === "workspaceId"))
    .map((m) => m.name.charAt(0).toLowerCase() + m.name.slice(1));
}

/**
 * Delete every synthetic workspace and every row scoped to one, in any table
 * (many workspace-scoped tables have no cascade from Workspace). Rows of other
 * workspaces are never matched: every delete filters on the synthetic ids.
 */
export async function cleanupTestData(db: PrismaClient): Promise<{ workspaces: string[]; rows: Record<string, number> }> {
  const synthetic = await db.workspace.findMany({
    where: { slug: { startsWith: SYNTHETIC_SLUG_PREFIX } },
    select: { id: true, slug: true },
  });
  const ids = synthetic.map((w) => w.id);
  const rows: Record<string, number> = {};
  if (ids.length === 0) return { workspaces: [], rows };

  let pending = workspaceScopedDelegates();
  // Foreign keys between scoped tables have no declared order: retry the ones
  // a dependent row still blocks until a pass makes no progress.
  for (let pass = 0; pass < 10 && pending.length; pass++) {
    const blocked: string[] = [];
    for (const delegate of pending) {
      try {
        const model = (db as unknown as Record<string, { deleteMany(args: unknown): Promise<{ count: number }> }>)[delegate];
        const { count } = await model.deleteMany({ where: { workspaceId: { in: ids } } });
        if (count) rows[delegate] = (rows[delegate] ?? 0) + count;
      } catch (error) {
        if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2003") blocked.push(delegate);
        else throw error;
      }
    }
    if (blocked.length === pending.length) throw new Error(`cleanup stuck on foreign keys: ${blocked.join(", ")}`);
    pending = blocked;
  }
  const deleted = await db.workspace.deleteMany({ where: { id: { in: ids }, slug: { startsWith: SYNTHETIC_SLUG_PREFIX } } });
  rows.workspace = deleted.count;
  return { workspaces: synthetic.map((w) => w.slug), rows };
}

// ─── prune-runs ──────────────────────────────────────────────────────────

/**
 * Remove records a Testora run created inside the synthetic workspaces
 * (title/name starting with "[run:"): all, one run's, or those older than N
 * hours (abandoned runs). Baseline records never carry the prefix.
 */
export async function pruneRunData(
  db: PrismaClient,
  options: { runId?: string; olderThanHours?: number } = {},
): Promise<{ tasks: number; projects: number; labels: number; savedSearches: number }> {
  const workspaces = await db.workspace.findMany({ where: { slug: { startsWith: SYNTHETIC_SLUG_PREFIX } }, select: { id: true } });
  const workspaceId = { in: workspaces.map((w) => w.id) };
  const prefix = options.runId ? `${RUN_TITLE_PREFIX}${options.runId}]` : RUN_TITLE_PREFIX;
  const createdAt = options.olderThanHours ? { lt: new Date(Date.now() - options.olderThanHours * 3_600_000) } : undefined;

  const runProjects = await db.project.findMany({ where: { workspaceId, name: { startsWith: prefix }, createdAt }, select: { id: true } });
  const runTasks = await db.task.findMany({
    where: { workspaceId, OR: [{ title: { startsWith: prefix }, createdAt }, { projectId: { in: runProjects.map((p) => p.id) } }] },
    select: { id: true },
  });
  const taskIds = runTasks.map((t) => t.id);
  if (taskIds.length) {
    await db.taskRelation.deleteMany({ where: { OR: [{ fromTaskId: { in: taskIds } }, { toTaskId: { in: taskIds } }] } });
    await db.taskCheck.deleteMany({ where: { taskId: { in: taskIds } } });
    // Subtasks first, then their parents.
    await db.task.deleteMany({ where: { id: { in: taskIds }, parentId: { in: taskIds } } });
  }
  const tasks = taskIds.length ? (await db.task.deleteMany({ where: { id: { in: taskIds } } })).count : 0;
  const projects = runProjects.length ? (await db.project.deleteMany({ where: { id: { in: runProjects.map((p) => p.id) } } })).count : 0;
  // Labels have no createdAt: matched by the run prefix only (an age filter can't apply).
  const labels = (await db.label.deleteMany({ where: { workspaceId, name: { startsWith: prefix } } })).count;
  const savedSearches = (await db.savedSearch.deleteMany({ where: { workspaceId, name: { startsWith: prefix }, createdAt } })).count;
  return { tasks, projects, labels, savedSearches };
}

// ─── verify ──────────────────────────────────────────────────────────────

export interface VerifyCheck {
  name: string;
  ok: boolean;
  detail: string;
}

/** Read-only: does the database hold what setup promises? */
export async function verifyTestData(db: PrismaClient, mode: TestDataMode): Promise<{ ok: boolean; checks: VerifyCheck[] }> {
  const checks: VerifyCheck[] = [];
  const keys: WorkspaceKey[] = mode === "production-baseline" ? ["main"] : ["main", "second", "empty", "aiOff", "disposable"];
  for (const key of keys) {
    const ws = await db.workspace.findUnique({
      where: { slug: WORKSPACES[key] },
      select: { id: true, archivedAt: true, _count: { select: { memberships: true, projects: true, tasks: true } } },
    });
    checks.push({
      name: `workspace:${key}`,
      ok: Boolean(ws && !ws.archivedAt),
      detail: ws ? `${ws._count.memberships} members, ${ws._count.projects} projects, ${ws._count.tasks} tasks${ws.archivedAt ? ", ARCHIVED" : ""}` : "missing",
    });
    if (ws) {
      const ai = await db.aiSettings.findUnique({ where: { workspaceId: ws.id } });
      const want = key !== "aiOff";
      checks.push({
        name: `ai-settings:${key}`,
        ok: Boolean(ai && ai.provider === "fixture" && ai.enabled === want),
        detail: ai ? `provider=${ai.provider} enabled=${ai.enabled}` : "missing",
      });
    }
  }
  const main = await db.workspace.findUnique({ where: { slug: WORKSPACES.main }, select: { id: true } });
  if (main) {
    const projects = await db.project.findMany({ where: { workspaceId: main.id }, select: { key: true, _count: { select: { tasks: true } } } });
    const byKey = new Map(projects.map((p) => [p.key, p._count.tasks]));
    checks.push({ name: "project:SYNA populated", ok: (byKey.get("SYNA") ?? 0) > 0, detail: `${byKey.get("SYNA") ?? 0} tasks` });
    checks.push({ name: "project:SYNE empty", ok: byKey.has("SYNE") && byKey.get("SYNE") === 0, detail: `${byKey.get("SYNE") ?? "missing"}` });
  }
  return { ok: checks.every((c) => c.ok), checks };
}
