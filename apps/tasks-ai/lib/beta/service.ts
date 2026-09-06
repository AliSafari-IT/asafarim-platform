import "server-only";
import { z } from "zod";
import type { RequestContext } from "../context";
import { ApiError } from "../errors";
import { recordAudit } from "../events/emit";
import { copilotMetrics } from "../ai/feedback";
import { usageSummary } from "../ai/quota";

export const BETA_TERMS_VERSION = "beta-terms@2026-09";

function requireOwner(ctx: RequestContext) {
  if (ctx.actor.role !== "owner") throw new ApiError("forbidden");
}

// ── enrolment + consent ──────────────────────────────────────────────────

const enrollSchema = z.object({
  cohort: z.enum(["concierge", "self_serve"]),
  teamType: z.enum(["agency", "consultancy", "product"]).optional(),
  segment: z.string().max(60).optional(),
});

export async function enrollBeta(ctx: RequestContext, input: unknown) {
  requireOwner(ctx);
  const d = enrollSchema.parse(input);
  const row = await ctx.db.betaEnrollment.upsert({
    where: { workspaceId: ctx.workspaceId },
    create: { workspaceId: ctx.workspaceId, ...d },
    update: { cohort: d.cohort, teamType: d.teamType, segment: d.segment },
  });
  await recordAudit(ctx.db, ctx.workspaceId, "beta.enrolled", ctx.actor.membershipId, { cohort: d.cohort }, ctx.correlationId);
  return row;
}

export async function betaStatus(ctx: RequestContext) {
  const [enrollment, consent] = await Promise.all([
    ctx.db.betaEnrollment.findUnique({ where: { workspaceId: ctx.workspaceId } }),
    ctx.db.betaConsent.findUnique({
      where: {
        workspaceId_membershipId_termsVersion: {
          workspaceId: ctx.workspaceId,
          membershipId: ctx.actor.membershipId,
          termsVersion: BETA_TERMS_VERSION,
        },
      },
    }),
  ]);
  return {
    enrolled: Boolean(enrollment),
    cohort: enrollment?.cohort ?? null,
    termsVersion: BETA_TERMS_VERSION,
    consented: Boolean(consent),
    decision: enrollment?.decision ?? null,
  };
}

export async function giveConsent(ctx: RequestContext) {
  const status = await betaStatus(ctx);
  if (!status.enrolled) throw new ApiError("validation_failed", { reason: "workspace is not enrolled in the beta" });
  const row = await ctx.db.betaConsent.upsert({
    where: {
      workspaceId_membershipId_termsVersion: {
        workspaceId: ctx.workspaceId,
        membershipId: ctx.actor.membershipId,
        termsVersion: BETA_TERMS_VERSION,
      },
    },
    create: { workspaceId: ctx.workspaceId, membershipId: ctx.actor.membershipId, termsVersion: BETA_TERMS_VERSION },
    update: {},
  });
  await recordAudit(ctx.db, ctx.workspaceId, "beta.consent_given", ctx.actor.membershipId, { termsVersion: BETA_TERMS_VERSION }, ctx.correlationId);
  return row;
}

/** Gate used by beta-only surfaces — throws until this member has consented. */
export async function requireBetaConsent(ctx: RequestContext) {
  const status = await betaStatus(ctx);
  if (status.enrolled && !status.consented) {
    throw new ApiError("forbidden", { reason: "beta consent required", termsVersion: BETA_TERMS_VERSION });
  }
}

// ── feedback triage ──────────────────────────────────────────────────────

const SLA_HOURS: Record<string, number> = { blocker: 4, major: 48, minor: 168, idea: 720 };

const feedbackSchema = z.object({
  source: z.enum(["in_app", "interview", "email", "support", "observed"]),
  severity: z.enum(["blocker", "major", "minor", "idea"]),
  title: z.string().min(1).max(160),
  detail: z.string().min(1).max(8000),
});

export async function createFeedback(ctx: RequestContext, input: unknown) {
  const d = feedbackSchema.parse(input);
  const respondBy = new Date(Date.now() + SLA_HOURS[d.severity] * 3600_000);
  return ctx.db.feedbackItem.create({
    data: { workspaceId: ctx.workspaceId, reportedBy: ctx.actor.membershipId, respondBy, ...d },
  });
}

const triageSchema = z.object({
  state: z.enum(["triage", "accepted", "in_progress", "resolved", "wont_do"]).optional(),
  ownerId: z.string().nullable().optional(),
  severity: z.enum(["blocker", "major", "minor", "idea"]).optional(),
  linkedChange: z.string().max(120).nullable().optional(),
});

export async function triageFeedback(ctx: RequestContext, id: string, input: unknown) {
  if (ctx.actor.role !== "owner" && ctx.actor.role !== "admin") throw new ApiError("forbidden");
  const d = triageSchema.parse(input);
  const item = await ctx.db.feedbackItem.findFirst({ where: { id, workspaceId: ctx.workspaceId } });
  if (!item) throw new ApiError("not_found");

  const patch: Record<string, unknown> = { ...d };
  if (d.severity && d.severity !== item.severity) {
    patch.respondBy = new Date(item.createdAt.getTime() + SLA_HOURS[d.severity] * 3600_000);
  }
  if ((d.state === "resolved" || d.state === "wont_do") && !item.respondedAt) {
    patch.respondedAt = new Date();
  }
  return ctx.db.feedbackItem.update({ where: { id }, data: patch });
}

export async function listFeedback(ctx: RequestContext, opts: { state?: string; overdueOnly?: boolean }) {
  return ctx.db.feedbackItem.findMany({
    where: {
      workspaceId: ctx.workspaceId,
      ...(opts.state ? { state: opts.state as never } : {}),
      ...(opts.overdueOnly ? { respondedAt: null, respondBy: { lt: new Date() } } : {}),
    },
    orderBy: [{ severity: "asc" }, { respondBy: "asc" }],
  });
}

// ── beta metrics dashboard (KPI dictionary) ──────────────────────────────

export async function betaMetrics(ctx: RequestContext) {
  const since = new Date(Date.now() - 7 * 86_400_000);
  const monthAgo = new Date(Date.now() - 30 * 86_400_000);
  const db = ctx.db;
  const ws = ctx.workspaceId;

  const [members, tasksCreated, tasksCompleted, overdueOpen, invitesSent, invitesAccepted, ai, usage, feedbackOpen, feedbackOverdue] =
    await Promise.all([
      db.membership.count({ where: { workspaceId: ws, archivedAt: null } }),
      db.task.count({ where: { workspaceId: ws, createdAt: { gte: since } } }),
      db.task.count({ where: { workspaceId: ws, completedAt: { gte: since } } }),
      db.task.count({ where: { workspaceId: ws, archivedAt: null, completedAt: null, dueDate: { lt: new Date() } } }),
      db.activityEvent.count({ where: { workspaceId: ws, name: "invite.sent", occurredAt: { gte: monthAgo } } }),
      db.activityEvent.count({ where: { workspaceId: ws, name: "membership.added", occurredAt: { gte: monthAgo } } }),
      copilotMetrics(ctx),
      usageSummary(ctx),
      db.feedbackItem.count({ where: { workspaceId: ws, state: { in: ["triage", "accepted", "in_progress"] } } }),
      db.feedbackItem.count({ where: { workspaceId: ws, respondedAt: null, respondBy: { lt: new Date() } } }),
    ]);

  return {
    windowDays: 7,
    activeMembers: members,
    weeklySuccessfulTeam: members >= 3 && tasksCompleted >= 10,
    tasksCreated,
    tasksCompleted,
    completionRatio: tasksCreated ? Number((tasksCompleted / tasksCreated).toFixed(2)) : null,
    overdueOpen,
    invitationAcceptance: invitesSent ? Number((invitesAccepted / invitesSent).toFixed(2)) : null,
    aiAcceptanceRate: ai.acceptanceRate,
    aiAvgEditDistance: ai.avgEditDistance,
    aiTrust: ai.avgTrust,
    aiCostUsd: usage.monthUsd,
    feedbackOpen,
    feedbackOverdue,
  };
}

const decisionSchema = z.object({
  decision: z.enum(["continue", "narrow", "remediate", "stop"]),
});

export async function recordBetaDecision(ctx: RequestContext, input: unknown) {
  requireOwner(ctx);
  const { decision } = decisionSchema.parse(input);
  const row = await ctx.db.betaEnrollment.update({
    where: { workspaceId: ctx.workspaceId },
    data: { decision, decidedAt: new Date() },
  });
  await recordAudit(ctx.db, ctx.workspaceId, "beta.decision", ctx.actor.membershipId, { decision }, ctx.correlationId);
  return row;
}
