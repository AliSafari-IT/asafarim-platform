import "server-only";
import { z } from "zod";
import type { Prisma } from "../db/generated";
import type { RequestContext } from "../context";
import { authorize } from "../authz";
import { ApiError } from "../errors";
import { assertNoSurveillance } from "../intel/guard";
import { agingWip, cycleTime, predictability, throughput, type FlowTask } from "./flow";
import { forecast } from "./forecast";

const DAY = 86_400_000;

async function flowTasks(ctx: RequestContext, projectId?: string): Promise<FlowTask[]> {
  const rows = await ctx.db.task.findMany({
    where: { workspaceId: ctx.workspaceId, ...(projectId ? { projectId } : {}) },
    select: { id: true, createdAt: true, completedAt: true, archivedAt: true },
  });
  // startedAt approximation: first task.status_changed activity for the task.
  const starts = await ctx.db.activityEvent.findMany({
    where: { workspaceId: ctx.workspaceId, name: "task.status_changed" },
    select: { targetId: true, occurredAt: true },
    orderBy: { occurredAt: "asc" },
  });
  const firstStart = new Map<string, string>();
  for (const s of starts) if (!firstStart.has(s.targetId)) firstStart.set(s.targetId, s.occurredAt.toISOString());

  return rows.map((t) => ({
    id: t.id,
    createdAt: t.createdAt.toISOString(),
    startedAt: firstStart.get(t.id) ?? null,
    completedAt: t.completedAt?.toISOString() ?? null,
    archivedAt: t.archivedAt?.toISOString() ?? null,
  }));
}

/** Team / project flow dashboard. */
export async function flowDashboard(ctx: RequestContext, projectId?: string, windowDays = 30) {
  const now = new Date();
  const start = new Date(now.getTime() - windowDays * DAY);
  const tasks = await flowTasks(ctx, projectId);
  const payload = {
    scope: projectId ? `project:${projectId}` : "workspace",
    window: { start: start.toISOString(), end: now.toISOString() },
    cycleTime: cycleTime(tasks, start, now),
    throughput: throughput(tasks, start, now),
    aging: agingWip(tasks, now),
    predictability: predictability(tasks, now),
    note: "All metrics describe the flow of work — not any individual. See docs/metric-semantics.md.",
  };
  assertNoSurveillance(payload);
  return payload;
}

/** Portfolio: per-project health + goal progress + a forecast. */
export async function portfolio(ctx: RequestContext) {
  authorize(ctx.actor, "project.update"); // any member; managers see the same numbers
  const projects = await ctx.db.project.findMany({
    where: { workspaceId: ctx.workspaceId, archivedAt: null },
    select: { id: true, key: true, name: true },
  });
  const goals = await ctx.db.goal.findMany({
    where: { workspaceId: ctx.workspaceId, archivedAt: null },
    include: { projects: true },
  });
  const keyResults = await ctx.db.keyResult.findMany({ where: { workspaceId: ctx.workspaceId } });

  const now = new Date();
  const items = [];
  for (const p of projects) {
    const tasks = await flowTasks(ctx, p.id);
    const open = tasks.filter((t) => !t.completedAt && !t.archivedAt).length;
    const pred = predictability(tasks, now);
    const f = forecast({ weeklyThroughput: pred.weeklyThroughput, remaining: open, now });
    const overdue = await ctx.db.task.count({
      where: { workspaceId: ctx.workspaceId, projectId: p.id, archivedAt: null, completedAt: null, dueDate: { lt: now } },
    });
    items.push({
      project: { id: p.id, key: p.key, name: p.name },
      open,
      overdue,
      health: overdue > 5 || pred.coefficientOfVariation > 0.8 ? "at_risk" : overdue > 0 ? "watch" : "on_track",
      forecast: { p50: f.bands.p50, p80: f.bands.p80, reliable: f.reliable },
    });
  }

  const goalProgress = goals.map((g) => {
    const krs = keyResults.filter((k) => k.goalId === g.id);
    const progress =
      krs.length === 0
        ? null
        : krs.reduce((sum, k) => {
            const span = k.targetValue - k.startValue || 1;
            return sum + Math.max(0, Math.min(1, (k.currentValue - k.startValue) / span));
          }, 0) / krs.length;
    return { goal: { id: g.id, title: g.title }, projectCount: g.projects.length, keyResults: krs.length, progress };
  });

  const payload = { generatedAt: now.toISOString(), projects: items, goals: goalProgress };
  assertNoSurveillance(payload);
  return payload;
}

// ── key results + time entries + snapshots ───────────────────────────────

const krSchema = z.object({
  goalId: z.string(),
  name: z.string().min(1).max(160),
  startValue: z.number().default(0),
  targetValue: z.number(),
  currentValue: z.number().default(0),
  unit: z.string().max(20).optional(),
});

export async function upsertKeyResult(ctx: RequestContext, input: unknown, id?: string) {
  authorize(ctx.actor, "project.update");
  const d = krSchema.parse(input);
  const goal = await ctx.db.goal.findFirst({ where: { id: d.goalId, workspaceId: ctx.workspaceId } });
  if (!goal) throw new ApiError("not_found", { field: "goalId" });
  return id
    ? ctx.db.keyResult.update({ where: { id }, data: d })
    : ctx.db.keyResult.create({ data: { workspaceId: ctx.workspaceId, ...d } });
}

const timeSchema = z.object({
  taskId: z.string(),
  minutes: z.number().int().min(1).max(24 * 60),
  spentOn: z.string(),
  note: z.string().max(500).optional(),
});

export async function logTime(ctx: RequestContext, input: unknown) {
  const d = timeSchema.parse(input);
  const task = await ctx.db.task.findFirst({ where: { id: d.taskId, workspaceId: ctx.workspaceId } });
  if (!task) throw new ApiError("not_found");
  return ctx.db.timeEntry.create({
    data: {
      workspaceId: ctx.workspaceId,
      taskId: d.taskId,
      membershipId: ctx.actor.membershipId,
      minutes: d.minutes,
      spentOn: new Date(d.spentOn),
      note: d.note,
    },
  });
}

/** Freeze the current flow metrics as MetricSnapshot rows (history-safe). */
export async function snapshotMetrics(ctx: RequestContext) {
  authorize(ctx.actor, "customfield.manage");
  const dash = await flowDashboard(ctx);
  const now = new Date();
  const rows: Prisma.MetricSnapshotCreateManyInput[] = [
    { workspaceId: ctx.workspaceId, scope: "workspace", metric: "cycle_time_p50", value: dash.cycleTime.p50, defVersion: dash.cycleTime.defVersion, windowStart: new Date(dash.window.start), windowEnd: now },
    { workspaceId: ctx.workspaceId, scope: "workspace", metric: "throughput_per_day", value: dash.throughput.perDay, defVersion: dash.throughput.defVersion, windowStart: new Date(dash.window.start), windowEnd: now },
    { workspaceId: ctx.workspaceId, scope: "workspace", metric: "predictability_cv", value: dash.predictability.coefficientOfVariation, defVersion: dash.predictability.defVersion, windowStart: new Date(dash.window.start), windowEnd: now },
  ];
  await ctx.db.metricSnapshot.createMany({ data: rows });
  return { snapshotted: rows.length, at: now.toISOString() };
}

export async function metricHistory(ctx: RequestContext, metric: string) {
  return ctx.db.metricSnapshot.findMany({
    where: { workspaceId: ctx.workspaceId, metric },
    orderBy: { createdAt: "asc" },
    select: { value: true, defVersion: true, createdAt: true, windowStart: true, windowEnd: true },
  });
}
