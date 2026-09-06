import "server-only";
import { z } from "zod";
import type { Prisma } from "../db/generated";
import type { RequestContext } from "../context";
import { ApiError } from "../errors";
import { recordAudit } from "../events/emit";
import { AI_KINDS, type AiKind } from "./types";
import { renderPrompt } from "./prompts";
import { redact } from "./redact";
import { guardDraft } from "./guard";
import { getProvider } from "./registry";
import { getAiSettings } from "./settings";
import { assertCanRunAiJob } from "./quota";
import { ProviderError } from "./provider";

export const runJobSchema = z.object({
  kind: z.enum(AI_KINDS),
  input: z.string().min(1).max(50_000),
  projectId: z.string().optional(),
});

const MAX_ATTEMPTS = 3;

/**
 * The AI job pipeline (docs/adr/0004, M06 scope):
 *   kill-switch + quota → redact → render versioned prompt → cache lookup
 *   → provider call (retry, degraded fallback to fixture) → guard against
 *   the operation allowlist + blast radius → persist AiJob + usage ledger
 *   + a Proposal in `draft` state. NOTHING is applied here.
 */
export async function runAiJob(ctx: RequestContext, input: unknown) {
  const { kind, input: rawInput, projectId } = runJobSchema.parse(input);
  await assertCanRunAiJob(ctx);
  // Billing gates — no-op until the commercial license is signed (M14).
  const { assertFeature, assertAllowance, recordUsage } = await import("../billing/service");
  await assertFeature(ctx, "ai");
  await assertAllowance(ctx, "ai_proposals");
  const settings = await getAiSettings(ctx);

  const { text: redactedInput, counts: redactionCounts } = redact(rawInput);

  const context = projectId
    ? await buildContext(ctx, projectId)
    : {};
  const prompt = renderPrompt({ kind: kind as AiKind, input: redactedInput, context }, redactedInput);

  // Cache: an identical redacted prompt in this workspace → reuse its draft.
  const cached = await ctx.db.aiJob.findFirst({
    where: { workspaceId: ctx.workspaceId, cacheKey: prompt.cacheKey, state: "succeeded" },
    include: { proposal: true },
    orderBy: { createdAt: "desc" },
  });
  if (cached?.proposal) {
    return { job: publicJob(cached), proposal: cached.proposal, cached: true };
  }

  const job = await ctx.db.aiJob.create({
    data: {
      workspaceId: ctx.workspaceId,
      membershipId: ctx.actor.membershipId,
      kind,
      state: "running",
      provider: settings.provider,
      model: settings.model,
      promptVersion: prompt.version,
      cacheKey: prompt.cacheKey,
    },
  });

  const started = Date.now();
  let output;
  let usedProvider = settings.provider;
  let degraded = false;

  for (let attempt = 1; ; attempt++) {
    try {
      const provider = await getProvider(usedProvider);
      output = await provider.generate({
        kind: kind as AiKind,
        prompt,
        model: usedProvider === settings.provider ? settings.model : provider.models[0],
      });
      break;
    } catch (err) {
      const retryable = err instanceof ProviderError ? err.retryable : true;
      if (attempt >= MAX_ATTEMPTS || !retryable) {
        if (usedProvider !== "fixture") {
          // Degraded mode: fall back to the offline provider so the user
          // still gets an (assumption-heavy) draft instead of an error.
          usedProvider = "fixture";
          degraded = true;
          continue;
        }
        await ctx.db.aiJob.update({
          where: { id: job.id },
          data: { state: "failed", error: err instanceof Error ? err.message.slice(0, 500) : "unknown" },
        });
        throw new ApiError("internal", { reason: "AI provider failed" });
      }
      await new Promise((r) => setTimeout(r, 250 * attempt));
    }
  }

  let guard;
  try {
    guard = guardDraft(output.draft, settings.maxBlastRadius);
  } catch (err) {
    await ctx.db.aiJob.update({
      where: { id: job.id },
      data: { state: "failed", error: err instanceof Error ? err.message.slice(0, 500) : "guard" },
    });
    throw new ApiError("validation_failed", { reason: "AI output failed the safety guard" });
  }

  const latencyMs = Date.now() - started;

  const [updatedJob, proposal] = await ctx.db.$transaction([
    ctx.db.aiJob.update({
      where: { id: job.id },
      data: {
        state: degraded ? "degraded" : "succeeded",
        provider: usedProvider,
        inputTokens: output.inputTokens,
        outputTokens: output.outputTokens,
        costUsd: output.costUsd,
        latencyMs,
      },
    }),
    ctx.db.proposal.create({
      data: {
        workspaceId: ctx.workspaceId,
        aiJobId: job.id,
        membershipId: ctx.actor.membershipId,
        kind,
        state: "draft",
        operations: guard.draft.operations as Prisma.InputJsonValue,
        summary: guard.draft.summary,
      },
    }),
    ctx.db.aiUsageLedger.create({
      data: {
        workspaceId: ctx.workspaceId,
        aiJobId: job.id,
        provider: usedProvider,
        model: output.fixture ? "fixture-1" : settings.model,
        inputTokens: output.inputTokens,
        outputTokens: output.outputTokens,
        costUsd: output.costUsd,
        fixture: output.fixture,
      },
    }),
  ]);

  await recordAudit(ctx.db, ctx.workspaceId, "proposal.generated", ctx.actor.membershipId, {
    aiJobId: job.id,
    kind,
    provider: usedProvider,
    promptVersion: prompt.version,
    opCount: guard.operationCount,
    groundedRatio: Number(guard.groundedRatio.toFixed(2)),
    redactionCounts,
    degraded,
  }, ctx.correlationId);

  await recordUsage(ctx, "ai_proposals");
  return { job: publicJob(updatedJob), proposal, degraded, groundedRatio: guard.groundedRatio };
}

async function buildContext(ctx: RequestContext, projectId: string) {
  const project = await ctx.db.project.findFirst({
    where: { id: projectId, workspaceId: ctx.workspaceId },
    select: { name: true },
  });
  const titles = await ctx.db.task.findMany({
    where: { workspaceId: ctx.workspaceId, projectId, archivedAt: null },
    select: { title: true },
    take: 30,
    orderBy: { createdAt: "desc" },
  });
  return { projectName: project?.name, existingTaskTitles: titles.map((t) => t.title) };
}

function publicJob(j: {
  id: string;
  kind: string;
  state: string;
  provider: string;
  model: string;
  promptVersion: string;
  costUsd: number | null;
  latencyMs: number | null;
}) {
  return {
    id: j.id,
    kind: j.kind,
    state: j.state,
    provider: j.provider,
    model: j.model,
    promptVersion: j.promptVersion,
    costUsd: j.costUsd,
    latencyMs: j.latencyMs,
  };
}
