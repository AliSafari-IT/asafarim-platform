import "server-only";
import {
  addRow,
  decodeCursor,
  effectiveCost,
  emptyTotals,
  encodeCursor,
  legacyUsdFloatToMicros,
  totalsToDTO,
  type AggregatableRow,
  type CostStatusFilter,
  type CostTotals,
  type CostTotalsDTO,
  type ResolvedRange,
  type TimelineItemDTO,
  type UsageLine,
} from "@asafarim/ai-cost-ledger";
import type { Prisma } from "../../db/generated";
import type { RequestContext } from "../../context";

/**
 * TasksAI AI cost read model (issues #590/#591).
 *
 * **Authorization (repository-enforced, never left to the UI):**
 *  - owner / admin — every event in the workspace;
 *  - member — events on projects they can see (workspace-visible projects,
 *    plus private projects they belong to), and their *own* workspace-level
 *    runs;
 *  - guest — events on projects they are a member of, and their own
 *    workspace-level runs.
 * The actor id is only ever used for that "own runs" rule and the "my AI
 * activity" filter — never to group or rank people.
 *
 * **No double counting:** each event has exactly one attribution (task,
 * project or workspace). A project subtotal = its direct-task runs + its
 * shared project runs. A task subtotal = only runs *attributed to that
 * task*; shared runs that merely created/touched it are listed as
 * involvement, with their amount shown but never added to the task.
 */

export const MAX_ROWS = 20_000;

export class CostRangeTooLargeError extends Error {
  constructor() {
    super("too many AI cost rows in this range — narrow the date range");
    this.name = "CostRangeTooLargeError";
  }
}

export interface TasksAiCostFilter {
  range: ResolvedRange;
  projectId?: string | null;
  /** Direct runs attributed to this task. */
  taskId?: string | null;
  operations?: string[];
  provider?: string;
  model?: string;
  status?: CostStatusFilter[];
  /** "My AI activity": only runs this member started. */
  mine?: boolean;
}

export interface TasksAiCostRow extends AggregatableRow {
  id: string;
  occurredAt: Date;
  operation: string;
  outcome: string;
  provider: string;
  model: string;
  promptVersion: string | null;
  usage: UsageLine[];
  finality: string;
  latencyMs: number | null;
  attribution: "task" | "project" | "workspace" | "legacy";
  subjectType: string;
  subjectId: string;
  projectId: string | null;
  taskId: string | null;
  aiJobId: string | null;
  legacy: boolean;
}

function isAdmin(ctx: RequestContext) {
  return ctx.actor.role === "owner" || ctx.actor.role === "admin";
}

/** Project ids this actor may see cost for; null = unrestricted (owner/admin). */
export async function authorizedProjectIds(ctx: RequestContext): Promise<Set<string> | null> {
  if (isAdmin(ctx)) return null;
  const mine = { members: { some: { membershipId: ctx.actor.membershipId } } };
  const where: Prisma.ProjectWhereInput =
    ctx.actor.role === "guest"
      ? { workspaceId: ctx.workspaceId, ...mine }
      : { workspaceId: ctx.workspaceId, OR: [{ visibility: "workspace" }, mine] };
  const rows = await ctx.db.project.findMany({ where, select: { id: true } });
  return new Set(rows.map((r) => r.id));
}

function statusOf(row: TasksAiCostRow): CostStatusFilter {
  if (row.legacy) return "legacy";
  const b = effectiveCost(row).basis;
  return b === "adjustment" ? "estimated" : (b as CostStatusFilter);
}

export async function loadCostRows(ctx: RequestContext, filter: TasksAiCostFilter): Promise<TasksAiCostRow[]> {
  const allowed = await authorizedProjectIds(ctx);
  const self = ctx.actor.membershipId;
  if (filter.projectId && allowed && !allowed.has(filter.projectId)) return [];

  const scopeOr: Prisma.AiCostEventWhereInput[] | undefined = allowed
    ? [{ projectId: { in: [...allowed] } }, { projectId: null, actorId: self }]
    : undefined;

  const events = await ctx.db.aiCostEvent.findMany({
    where: {
      workspaceId: ctx.workspaceId,
      occurredAt: { gte: filter.range.from, lt: filter.range.to },
      ...(scopeOr ? { OR: scopeOr } : {}),
      ...(filter.projectId ? { projectId: filter.projectId } : {}),
      ...(filter.taskId ? { taskId: filter.taskId } : {}),
      ...(filter.operations?.length ? { operation: { in: filter.operations } } : {}),
      ...(filter.provider ? { provider: filter.provider } : {}),
      ...(filter.model ? { responseModel: filter.model } : {}),
      ...(filter.mine ? { actorId: self } : {}),
    },
    orderBy: [{ occurredAt: "desc" }, { id: "desc" }],
    take: MAX_ROWS + 1,
  });

  // Pre-#590 history: legacy ledger rows whose job has no canonical event.
  // Workspace-level only (those jobs never recorded a project), so a
  // project/task filter excludes them; members see only their own.
  const legacy =
    filter.projectId || filter.taskId
      ? []
      : await ctx.db.aiUsageLedger.findMany({
          where: {
            workspaceId: ctx.workspaceId,
            createdAt: { gte: filter.range.from, lt: filter.range.to },
            ...(filter.provider ? { provider: filter.provider } : {}),
            ...(filter.model ? { model: filter.model } : {}),
          },
          orderBy: [{ createdAt: "desc" }, { id: "desc" }],
          take: MAX_ROWS + 1,
        });
  if (events.length + legacy.length > MAX_ROWS) throw new CostRangeTooLargeError();

  const eventJobIds = new Set(events.map((e) => e.aiJobId).filter(Boolean));
  const legacyCandidates = legacy.filter((l) => !eventJobIds.has(l.aiJobId));
  const jobs = legacyCandidates.length
    ? await ctx.db.aiJob.findMany({
        where: { id: { in: legacyCandidates.map((l) => l.aiJobId) }, workspaceId: ctx.workspaceId },
        select: { id: true, kind: true, membershipId: true, promptVersion: true },
      })
    : [];
  const jobById = new Map(jobs.map((j) => [j.id, j]));
  // A job that has a canonical event outside the date window is still not legacy.
  const withEvents = legacyCandidates.length
    ? new Set(
        (
          await ctx.db.aiCostEvent.findMany({
            where: { workspaceId: ctx.workspaceId, aiJobId: { in: legacyCandidates.map((l) => l.aiJobId) } },
            select: { aiJobId: true },
          })
        ).map((e) => e.aiJobId),
      )
    : new Set<string | null>();

  const rows: TasksAiCostRow[] = [
    ...events.map(
      (e): TasksAiCostRow => ({
        id: e.id,
        entryType: e.entryType as TasksAiCostRow["entryType"],
        occurredAt: e.occurredAt,
        operation: e.operation,
        outcome: e.outcome,
        provider: e.provider,
        model: e.responseModel,
        promptVersion: e.promptVersion,
        usage: (e.usage as unknown as UsageLine[]) ?? [],
        inputTokens: e.inputTokens,
        outputTokens: e.outputTokens,
        estimatedCostMicros: e.estimatedCostMicros,
        actualCostMicros: e.actualCostMicros,
        adjustmentDeltaMicros: e.adjustmentDeltaMicros,
        costSource: e.costSource as TasksAiCostRow["costSource"],
        credentialSource: e.credentialSource as TasksAiCostRow["credentialSource"],
        fixture: e.fixture,
        finality: e.finality,
        latencyMs: e.latencyMs,
        attribution: e.attribution as TasksAiCostRow["attribution"],
        subjectType: e.subjectType,
        subjectId: e.subjectId,
        projectId: e.projectId,
        taskId: e.taskId,
        aiJobId: e.aiJobId,
        legacy: false,
      }),
    ),
    ...legacyCandidates
      .filter((l) => !withEvents.has(l.aiJobId))
      .filter((l) => {
        const job = jobById.get(l.aiJobId);
        if (filter.operations?.length && !filter.operations.includes(job?.kind ?? "")) return false;
        if ((allowed || filter.mine) && job?.membershipId !== self) return false;
        return true;
      })
      .map((l): TasksAiCostRow => {
        const job = jobById.get(l.aiJobId);
        return {
          id: `legacy_${l.id}`,
          entryType: "usage",
          occurredAt: l.createdAt,
          operation: job?.kind ?? "unknown",
          outcome: "succeeded",
          provider: l.provider,
          model: l.model,
          promptVersion: job?.promptVersion ?? null,
          usage: [
            ...(l.inputTokens > 0 ? [{ bucket: "input" as const, unit: "tokens" as const, quantity: l.inputTokens }] : []),
            ...(l.outputTokens > 0 ? [{ bucket: "output" as const, unit: "tokens" as const, quantity: l.outputTokens }] : []),
          ],
          inputTokens: l.inputTokens,
          outputTokens: l.outputTokens,
          estimatedCostMicros: legacyUsdFloatToMicros(l.costUsd),
          actualCostMicros: null,
          adjustmentDeltaMicros: null,
          costSource: "registry_estimate",
          credentialSource: l.fixture ? "none" : "platform",
          fixture: l.fixture,
          finality: "provisional",
          latencyMs: null,
          attribution: "legacy",
          subjectType: "workspace",
          subjectId: ctx.workspaceId,
          projectId: null,
          taskId: null,
          aiJobId: l.aiJobId,
          legacy: true,
        };
      }),
  ];

  const filtered = filter.status?.length ? rows.filter((r) => filter.status!.includes(statusOf(r))) : rows;
  return filtered.sort((a, b) => b.occurredAt.getTime() - a.occurredAt.getTime() || (a.id < b.id ? 1 : a.id > b.id ? -1 : 0));
}

export interface ProjectCostGroup {
  projectId: string;
  name: string;
  archived: boolean;
  totals: CostTotalsDTO;
  directTaskRuns: CostTotalsDTO;
  sharedRuns: CostTotalsDTO;
}

export interface TasksAiCostTimeline {
  range: { from: string; to: string; preset: string };
  summary: CostTotalsDTO;
  projects: ProjectCostGroup[];
  workspaceOnly: CostTotalsDTO;
  legacy: CostTotalsDTO;
  items: (TimelineItemDTO & { attribution: TasksAiCostRow["attribution"]; projectId: string | null; taskId: string | null; aiJobId: string | null })[];
  nextCursor: string | null;
  generatedAt: string;
  /** Whether this viewer sees the whole workspace or only authorized projects. */
  scope: "workspace" | "authorized_projects";
}

export function toItem(row: TasksAiCostRow): TasksAiCostTimeline["items"][number] {
  const { amountMicros, basis } = effectiveCost(row);
  return {
    id: row.id,
    occurredAt: row.occurredAt.toISOString(),
    operation: row.operation,
    outcome: row.outcome,
    provider: row.provider,
    model: row.model,
    promptVersion: row.promptVersion,
    usage: row.usage,
    amountMicros: amountMicros === null ? null : amountMicros.toString(),
    basis,
    costSource: row.costSource,
    credentialSource: row.credentialSource,
    finality: row.finality,
    latencyMs: row.latencyMs,
    legacy: row.legacy,
    subjectType: row.subjectType,
    subjectId: row.subjectId,
    workflowId: row.aiJobId,
    attribution: row.attribution,
    projectId: row.projectId,
    taskId: row.taskId,
    aiJobId: row.aiJobId,
  };
}

function page<T extends { occurredAt: Date; id: string }>(rows: T[], cursorRaw: string | null | undefined, limit: number) {
  const cursor = decodeCursor(cursorRaw);
  const start = cursor
    ? rows.findIndex(
        (r) =>
          r.occurredAt.getTime() < cursor.occurredAt.getTime() ||
          (r.occurredAt.getTime() === cursor.occurredAt.getTime() && r.id < cursor.id),
      )
    : 0;
  const slice = start < 0 ? [] : rows.slice(start, start + limit);
  const last = slice.at(-1);
  const next = start >= 0 && start + limit < rows.length && last ? encodeCursor({ occurredAt: last.occurredAt, id: last.id }) : null;
  return { slice, next };
}

export async function buildCostTimeline(
  ctx: RequestContext,
  filter: TasksAiCostFilter,
  paging: { cursor?: string | null; limit: number },
  now: Date = new Date(),
): Promise<TasksAiCostTimeline> {
  const rows = await loadCostRows(ctx, filter);
  const summary = emptyTotals();
  const workspaceOnly = emptyTotals();
  const legacy = emptyTotals();
  const byProject = new Map<string, { total: CostTotals; direct: CostTotals; shared: CostTotals }>();
  for (const row of rows) {
    addRow(summary, row);
    if (row.legacy) addRow(legacy, row);
    else if (!row.projectId) addRow(workspaceOnly, row);
    else {
      const p = byProject.get(row.projectId) ?? { total: emptyTotals(), direct: emptyTotals(), shared: emptyTotals() };
      addRow(p.total, row);
      addRow(row.attribution === "task" ? p.direct : p.shared, row);
      byProject.set(row.projectId, p);
    }
  }
  const projects = byProject.size
    ? await ctx.db.project.findMany({
        where: { workspaceId: ctx.workspaceId, id: { in: [...byProject.keys()] } },
        select: { id: true, name: true, archivedAt: true },
      })
    : [];
  const projectById = new Map(projects.map((p) => [p.id, p]));
  const { slice, next } = page(rows, paging.cursor, paging.limit);

  return {
    range: { from: filter.range.from.toISOString(), to: filter.range.to.toISOString(), preset: filter.range.preset },
    summary: totalsToDTO(summary),
    projects: [...byProject.entries()]
      .map(([projectId, t]) => ({
        projectId,
        name: projectById.get(projectId)?.name ?? "Deleted project",
        archived: Boolean(projectById.get(projectId)?.archivedAt) || !projectById.has(projectId),
        totals: totalsToDTO(t.total),
        directTaskRuns: totalsToDTO(t.direct),
        sharedRuns: totalsToDTO(t.shared),
      }))
      .sort((a, b) => (BigInt(b.totals.effectiveKnownMicros) > BigInt(a.totals.effectiveKnownMicros) ? 1 : -1)),
    workspaceOnly: totalsToDTO(workspaceOnly),
    legacy: totalsToDTO(legacy),
    items: slice.map(toItem),
    nextCursor: next,
    generatedAt: now.toISOString(),
    scope: isAdmin(ctx) ? "workspace" : "authorized_projects",
  };
}

export interface TaskCostView {
  taskId: string;
  /** Runs attributed to this task — the only money that is "this task's". */
  direct: CostTotalsDTO;
  directItems: TasksAiCostTimeline["items"];
  /** Shared project runs that created/touched this task: shown, never summed. */
  sharedRuns: (TasksAiCostTimeline["items"][number] & { role: string })[];
}

/** One task's AI history: direct runs + referenced shared runs. */
export async function taskCostView(ctx: RequestContext, taskId: string, range: ResolvedRange): Promise<TaskCostView | null> {
  const task = await ctx.db.task.findFirst({
    where: {
      id: taskId,
      workspaceId: ctx.workspaceId,
      ...(ctx.actor.role === "guest"
        ? { project: { members: { some: { membershipId: ctx.actor.membershipId } } } }
        : {}),
    },
    select: { id: true, projectId: true },
  });
  if (!task) return null;
  const allowed = await authorizedProjectIds(ctx);
  if (allowed && !allowed.has(task.projectId)) return null;

  const direct = await loadCostRows(ctx, { range, taskId });
  const links = await ctx.db.aiJobTaskLink.findMany({ where: { taskId, role: { not: "target" } }, select: { aiJobId: true, role: true } });
  const sharedEvents = links.length
    ? await ctx.db.aiCostEvent.findMany({
        where: {
          workspaceId: ctx.workspaceId,
          aiJobId: { in: [...new Set(links.map((l) => l.aiJobId))] },
          attribution: { not: "task" },
          occurredAt: { gte: range.from, lt: range.to },
        },
        orderBy: [{ occurredAt: "desc" }, { id: "desc" }],
      })
    : [];
  const roleByJob = new Map<string, string>();
  for (const l of links) roleByJob.set(l.aiJobId, roleByJob.has(l.aiJobId) ? `${roleByJob.get(l.aiJobId)},${l.role}` : l.role);

  const totals = emptyTotals();
  for (const r of direct) addRow(totals, r);
  return {
    taskId,
    direct: totalsToDTO(totals),
    directItems: direct.map(toItem),
    sharedRuns: sharedEvents
      .filter((e) => !allowed || (e.projectId ? allowed.has(e.projectId) : e.actorId === ctx.actor.membershipId))
      .map((e) => ({
        ...toItem({
          id: e.id,
          entryType: e.entryType as "usage",
          occurredAt: e.occurredAt,
          operation: e.operation,
          outcome: e.outcome,
          provider: e.provider,
          model: e.responseModel,
          promptVersion: e.promptVersion,
          usage: (e.usage as unknown as UsageLine[]) ?? [],
          estimatedCostMicros: e.estimatedCostMicros,
          actualCostMicros: e.actualCostMicros,
          adjustmentDeltaMicros: e.adjustmentDeltaMicros,
          costSource: e.costSource as TasksAiCostRow["costSource"],
          credentialSource: e.credentialSource as TasksAiCostRow["credentialSource"],
          fixture: e.fixture,
          finality: e.finality,
          latencyMs: e.latencyMs,
          attribution: e.attribution as TasksAiCostRow["attribution"],
          subjectType: e.subjectType,
          subjectId: e.subjectId,
          projectId: e.projectId,
          taskId: e.taskId,
          aiJobId: e.aiJobId,
          legacy: false,
        }),
        role: roleByJob.get(e.aiJobId ?? "") ?? "linked",
      })),
  };
}
