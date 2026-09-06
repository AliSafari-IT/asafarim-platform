import "server-only";
import { z } from "zod";
import type { RequestContext } from "../context";
import { ApiError } from "../errors";
import { recordAudit } from "../events/emit";
import { rankTasks, RULE_VERSION, type FactorContribution, type FocusInput } from "./scoring";
import { detectSignals, SIGNAL_RULE_VERSION, type Signal, type WorkspaceSnapshot } from "./signals";
import { assertNoSurveillance } from "./guard";

async function snapshot(ctx: RequestContext): Promise<{ snap: WorkspaceSnapshot; viewerOpen: number }> {
  const tasks = await ctx.db.task.findMany({
    where: { workspaceId: ctx.workspaceId, archivedAt: null },
    select: {
      id: true, title: true, dueDate: true, completedAt: true, estimate: true,
      updatedAt: true, assigneeId: true,
      outgoingRelations: { where: { kind: "blocks" }, select: { toTaskId: true } },
      incomingRelations: { where: { kind: "blocks" }, select: { fromTaskId: true } },
    },
  });
  const members = await ctx.db.membership.findMany({
    where: { workspaceId: ctx.workspaceId, archivedAt: null },
    select: { id: true, platformUserId: true },
  });
  const labels: Record<string, string> = {};
  for (const m of members) labels[m.id] = `member:${m.id.slice(-4)}`;

  const snap: WorkspaceSnapshot = {
    now: new Date().toISOString(),
    memberLabels: labels,
    tasks: tasks.map((t) => ({
      id: t.id,
      title: t.title,
      dueDate: t.dueDate?.toISOString() ?? null,
      completedAt: t.completedAt?.toISOString() ?? null,
      estimate: t.estimate,
      updatedAt: t.updatedAt.toISOString(),
      assigneeId: t.assigneeId,
      blocks: t.outgoingRelations.map((r) => r.toTaskId),
      blockedBy: t.incomingRelations.map((r) => r.fromTaskId),
    })),
  };
  const viewerOpen = snap.tasks.filter(
    (t) => !t.completedAt && t.assigneeId === ctx.actor.membershipId,
  ).length;
  return { snap, viewerOpen };
}

/** Ranked focus list for the viewer's assigned open work, with breakdowns. */
export async function focusList(ctx: RequestContext, limit = 20) {
  const prefs = await ctx.db.signalPreference.findMany({
    where: { workspaceId: ctx.workspaceId, membershipId: ctx.actor.membershipId },
  });
  const userWeights: Partial<Record<FactorContribution["factor"], number>> = {};
  for (const p of prefs) {
    if (["urgency", "impact", "readiness", "commitment", "workload", "freshness"].includes(p.signalType)) {
      userWeights[p.signalType as FactorContribution["factor"]] = p.enabled ? p.weight : 0;
    }
  }

  const { snap, viewerOpen } = await snapshot(ctx);
  const mine = snap.tasks.filter(
    (t) => !t.completedAt && t.assigneeId === ctx.actor.membershipId,
  );
  const inputs: FocusInput[] = mine.map((t) => ({
    taskId: t.id,
    title: t.title,
    dueDate: t.dueDate,
    startDate: null,
    completedAt: t.completedAt,
    estimate: t.estimate,
    blocks: t.blocks.length,
    blockedBy: t.blockedBy.length,
    updatedAt: t.updatedAt,
    isAssignedToViewer: true,
    viewerOpenCount: viewerOpen,
  }));

  const ranked = rankTasks(inputs, new Date(), userWeights).slice(0, limit);
  const byId = new Map(mine.map((t) => [t.id, t]));
  const payload = {
    ruleVersion: RULE_VERSION,
    generatedAt: new Date().toISOString(),
    items: ranked.map((r) => ({
      task: { id: r.taskId, title: byId.get(r.taskId)?.title ?? "" },
      score: r.score,
      factors: r.factors,
    })),
    limitations:
      "Deterministic ranking from urgency, dependencies, your commitment and workload. It does not read task content or judge anyone.",
  };
  assertNoSurveillance(payload);
  return payload;
}

/** Workspace-wide risk/workload signals (not a per-person report). */
export async function workspaceSignals(ctx: RequestContext): Promise<{ ruleVersion: string; signals: Signal[] }> {
  const disabled = new Set(
    (
      await ctx.db.signalPreference.findMany({
        where: { workspaceId: ctx.workspaceId, membershipId: ctx.actor.membershipId, enabled: false },
      })
    ).map((p) => p.signalType),
  );
  const { snap } = await snapshot(ctx);
  const signals = detectSignals(snap).filter((s) => !disabled.has(s.type));
  const payload = { ruleVersion: SIGNAL_RULE_VERSION, signals };
  assertNoSurveillance(payload);
  return payload;
}

/** Personal daily brief: top focus items + the signals that touch them. */
export async function dailyBrief(ctx: RequestContext) {
  const [focus, sig] = await Promise.all([focusList(ctx, 5), workspaceSignals(ctx)]);
  const myTaskIds = new Set(focus.items.map((i) => i.task.id));
  const relevant = sig.signals.filter((s) => s.evidence.some((e) => myTaskIds.has(e.id)));
  const brief = {
    generatedAt: new Date().toISOString(),
    ruleVersions: { focus: focus.ruleVersion, signals: sig.ruleVersion },
    topFocus: focus.items,
    signalsForYou: relevant,
    otherSignals: sig.signals.length - relevant.length,
    note: "Suggestions, not instructions. Every item links to the work it came from.",
  };
  assertNoSurveillance(brief);
  return brief;
}

// ── preferences + feedback ───────────────────────────────────────────────

const prefSchema = z.object({
  signalType: z.string().min(1).max(40),
  enabled: z.boolean().optional(),
  weight: z.number().min(0).max(2).optional(),
});

export async function getSignalPreferences(ctx: RequestContext) {
  return ctx.db.signalPreference.findMany({
    where: { workspaceId: ctx.workspaceId, membershipId: ctx.actor.membershipId },
  });
}

export async function setSignalPreference(ctx: RequestContext, input: unknown) {
  const p = prefSchema.parse(input);
  return ctx.db.signalPreference.upsert({
    where: {
      workspaceId_membershipId_signalType: {
        workspaceId: ctx.workspaceId,
        membershipId: ctx.actor.membershipId,
        signalType: p.signalType,
      },
    },
    create: {
      workspaceId: ctx.workspaceId,
      membershipId: ctx.actor.membershipId,
      signalType: p.signalType,
      enabled: p.enabled ?? true,
      weight: p.weight ?? 1,
    },
    update: { ...(p.enabled != null ? { enabled: p.enabled } : {}), ...(p.weight != null ? { weight: p.weight } : {}) },
  });
}

const feedbackSchema = z.object({
  signalType: z.string().min(1).max(40),
  targetType: z.string().min(1).max(30),
  targetId: z.string().min(1),
  verdict: z.enum(["false_alarm", "missed", "helpful", "wrong_evidence"]),
  ruleVersion: z.string().min(1).max(40),
  note: z.string().max(1000).optional(),
});

export async function recordSignalFeedback(ctx: RequestContext, input: unknown) {
  const f = feedbackSchema.parse(input);
  const row = await ctx.db.signalFeedback.create({
    data: { workspaceId: ctx.workspaceId, membershipId: ctx.actor.membershipId, ...f },
  });
  await recordAudit(ctx.db, ctx.workspaceId, "signal.feedback", ctx.actor.membershipId, {
    signalType: f.signalType,
    verdict: f.verdict,
    ruleVersion: f.ruleVersion,
  }, ctx.correlationId);
  return row;
}

/** Offline-eval-style quality summary from accumulated feedback. */
export async function signalQuality(ctx: RequestContext) {
  authorizeAdmin(ctx);
  const rows = await ctx.db.signalFeedback.groupBy({
    by: ["signalType", "verdict", "ruleVersion"],
    where: { workspaceId: ctx.workspaceId },
    _count: { _all: true },
  });
  return rows.map((r) => ({
    signalType: r.signalType,
    verdict: r.verdict,
    ruleVersion: r.ruleVersion,
    count: r._count._all,
  }));
}

function authorizeAdmin(ctx: RequestContext) {
  if (ctx.actor.role !== "owner" && ctx.actor.role !== "admin") throw new ApiError("forbidden");
}
