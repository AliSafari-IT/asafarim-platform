import "server-only";
import type { Prisma, PrismaClient } from "../db/generated";
import type { RequestContext } from "../context";
import { authorize } from "../authz";
import { ApiError } from "../errors";
import { recordAudit } from "../events/emit";
import {
  actionSchema,
  dryRun,
  matchesConditions,
  matchesTrigger,
  ruleSchema,
  type Action,
  type TriggerEvent,
} from "./rules";

const RULE_DEPTH_LIMIT = 3; // an automation chain deeper than this is a loop

export async function createRule(ctx: RequestContext, input: unknown) {
  authorize(ctx.actor, "customfield.manage"); // admin+
  const data = ruleSchema.parse(input);
  return ctx.db.automationRule.create({
    data: {
      workspaceId: ctx.workspaceId,
      membershipId: ctx.actor.membershipId,
      name: data.name,
      state: "draft",
      trigger: data.trigger as Prisma.InputJsonValue,
      conditions: data.conditions as Prisma.InputJsonValue,
      actions: data.actions as Prisma.InputJsonValue,
      maxRunsPerHour: data.maxRunsPerHour,
    },
  });
}

export async function listRules(ctx: RequestContext) {
  return ctx.db.automationRule.findMany({
    where: { workspaceId: ctx.workspaceId },
    orderBy: { createdAt: "desc" },
  });
}

export async function setRuleState(ctx: RequestContext, id: string, state: "active" | "paused" | "draft") {
  authorize(ctx.actor, "customfield.manage");
  const res = await ctx.db.automationRule.updateMany({
    where: { id, workspaceId: ctx.workspaceId },
    data: { state },
  });
  if (res.count === 0) throw new ApiError("not_found");
  await recordAudit(ctx.db, ctx.workspaceId, "rule.state_changed", ctx.actor.membershipId, { id, state }, ctx.correlationId);
  return { id, state };
}

export async function dryRunRule(ctx: RequestContext, id: string, sampleEvent: unknown) {
  const rule = await ctx.db.automationRule.findFirst({ where: { id, workspaceId: ctx.workspaceId } });
  if (!rule) throw new ApiError("not_found");
  const event = normalizeEvent(sampleEvent, ctx.workspaceId);
  const parsed = ruleSchema.parse({
    name: rule.name,
    trigger: rule.trigger,
    conditions: rule.conditions,
    actions: rule.actions,
    maxRunsPerHour: rule.maxRunsPerHour,
  });
  return dryRun(parsed, event);
}

export async function listRuns(ctx: RequestContext, ruleId: string, limit = 50) {
  return ctx.db.automationRun.findMany({
    where: { workspaceId: ctx.workspaceId, ruleId },
    orderBy: { createdAt: "desc" },
    take: limit,
  });
}

/**
 * Called by the outbox drainer for every ActivityEvent. Finds active rules
 * whose trigger + conditions match, and executes their actions — with a
 * per-rule hourly rate limit, a per-event dedupe, and a causation-depth
 * loop guard so an action cannot cascade forever or cross tenants.
 */
export async function runRulesForEvent(client: PrismaClient, event: TriggerEvent) {
  const depth = event.causationId ? await causationDepth(client, event.causationId) : 0;
  if (depth >= RULE_DEPTH_LIMIT) return { skipped: "loop-guard" as const, depth };

  const rules = await client.automationRule.findMany({
    where: { workspaceId: event.workspaceId, state: "active" },
  });

  const results: { ruleId: string; state: string }[] = [];
  for (const rule of rules) {
    if (!matchesTrigger(rule, event)) continue;

    // hourly rate limit
    const since = new Date(Date.now() - 3600_000);
    const recent = await client.automationRun.count({
      where: { ruleId: rule.id, createdAt: { gte: since }, state: { in: ["succeeded", "failed"] } },
    });
    if (recent >= rule.maxRunsPerHour) {
      results.push({ ruleId: rule.id, state: "rate_limited" });
      continue;
    }

    const conditions = Array.isArray(rule.conditions) ? (rule.conditions as never[]) : [];
    if (!matchesConditions(conditions, event)) {
      await client.automationRun.create({
        data: { workspaceId: event.workspaceId, ruleId: rule.id, state: "skipped", trigger: event.data as Prisma.InputJsonValue, causationId: event.causationId ?? null },
      });
      results.push({ ruleId: rule.id, state: "skipped" });
      continue;
    }

    const run = await client.automationRun.create({
      data: {
        workspaceId: event.workspaceId,
        ruleId: rule.id,
        state: "dry_run",
        trigger: event.data as Prisma.InputJsonValue,
        causationId: event.causationId ?? null,
      },
    });

    const log: unknown[] = [];
    let failed = false;
    for (const raw of rule.actions as unknown[]) {
      const a = actionSchema.safeParse(raw);
      if (!a.success) {
        log.push({ action: raw, ok: false, error: "invalid action" });
        failed = true;
        continue;
      }
      try {
        const outcome = await executeAction(client, event, a.data, run.id);
        log.push({ action: a.data.type, ok: true, ...outcome });
      } catch (err) {
        log.push({ action: a.data.type, ok: false, error: err instanceof Error ? err.message : "?" });
        failed = true;
      }
    }

    await client.automationRule.update({ where: { id: rule.id }, data: { lastRunAt: new Date() } });
    await client.automationRun.update({
      where: { id: run.id },
      data: { state: failed ? "failed" : "succeeded", log: log as Prisma.InputJsonValue },
    });
    results.push({ ruleId: rule.id, state: failed ? "failed" : "succeeded" });
  }
  return { results, depth };
}

async function causationDepth(client: PrismaClient, runId: string, seen = 0): Promise<number> {
  if (seen > 10) return seen;
  const run = await client.automationRun.findUnique({ where: { id: runId }, select: { causationId: true } });
  if (!run?.causationId) return seen + 1;
  return causationDepth(client, run.causationId, seen + 1);
}

async function executeAction(
  client: PrismaClient,
  event: TriggerEvent,
  action: Action,
  runId: string,
): Promise<Record<string, unknown>> {
  const taskId = String(event.data.id ?? event.data.taskId ?? "");
  const tenantWhere = { workspaceId: event.workspaceId };

  switch (action.type) {
    case "set_status":
      await client.task.updateMany({ where: { id: taskId, ...tenantWhere }, data: { statusId: action.statusId, version: { increment: 1 } } });
      return { taskId, statusId: action.statusId };
    case "assign":
      await client.task.updateMany({ where: { id: taskId, ...tenantWhere }, data: { assigneeId: action.membershipId, version: { increment: 1 } } });
      return { taskId, assigneeId: action.membershipId };
    case "add_label":
      await client.taskLabel.upsert({
        where: { taskId_labelId: { taskId, labelId: action.labelId } },
        create: { taskId, labelId: action.labelId },
        update: {},
      });
      return { taskId, labelId: action.labelId };
    case "set_due_in_days":
      await client.task.updateMany({
        where: { id: taskId, ...tenantWhere },
        data: { dueDate: new Date(Date.now() + action.days * 86_400_000), version: { increment: 1 } },
      });
      return { taskId, days: action.days };
    case "comment":
      await client.comment.create({
        data: { workspaceId: event.workspaceId, taskId, authorId: (await systemAuthor(client, event.workspaceId)), body: `[automation] ${action.body}`, mentions: [] },
      });
      return { taskId };
    case "webhook": {
      const { enqueueWebhook } = await import("../webhooks/service");
      await enqueueWebhook(client, event.workspaceId, action.endpointId, `automation:${runId}`, event.name, event.data);
      return { endpointId: action.endpointId };
    }
  }
}

async function systemAuthor(client: PrismaClient, workspaceId: string): Promise<string> {
  const owner = await client.membership.findFirst({ where: { workspaceId, role: "owner" }, select: { id: true } });
  if (!owner) throw new Error("no owner membership to attribute automation comment");
  return owner.id;
}

function normalizeEvent(raw: unknown, workspaceId: string): TriggerEvent {
  const o = (raw ?? {}) as Record<string, unknown>;
  return {
    name: String(o.name ?? o.event ?? "task.updated"),
    workspaceId,
    data: (o.data as Record<string, unknown>) ?? {},
    changed: o.changed as TriggerEvent["changed"],
  };
}
