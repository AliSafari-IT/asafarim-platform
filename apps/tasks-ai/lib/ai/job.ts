import "server-only";
import { z } from "zod";
import type { Prisma } from "../db/generated";
import type { RequestContext } from "../context";
import { ApiError } from "../errors";
import { recordAudit } from "../events/emit";
import { AI_KINDS, type AiKind } from "./types";
import { renderPrompt } from "./prompts";
import { mapCitationSpans, redact } from "./redact";
import { guardDraft } from "./guard";
import { retrieveContext } from "./retrieval";
import { getProvider } from "./registry";
import { getAiSettings } from "./settings";
import { assertCanRunAiJob } from "./quota";
import { ProviderError } from "./provider";

export const runJobSchema = z.object({
  kind: z.enum(AI_KINDS),
  input: z.string().min(1).max(50_000),
  projectId: z.string().optional(),
  /**
   * The existing task a task-scoped intent was launched from ("break this
   * down", "draft acceptance criteria for this"). Membership-scoped: an id
   * outside this workspace resolves to nothing and the job is refused.
   */
  taskId: z.string().optional(),
});

/** Proposal states a cached draft may still be reviewed and applied from. */
const REVIEWABLE_STATES = ["draft", "previewed"] as const;

const MAX_ATTEMPTS = 3;

/**
 * The AI job pipeline (docs/adr/0004, M06 scope):
 *   kill-switch + quota → redact → render versioned prompt → cache lookup
 *   → provider call (retry, degraded fallback to fixture) → guard against
 *   the operation allowlist + blast radius → persist AiJob + usage ledger
 *   + a Proposal in `draft` state. NOTHING is applied here.
 */
export async function runAiJob(ctx: RequestContext, input: unknown) {
  const { kind, input: rawInput, projectId, taskId } = runJobSchema.parse(input);
  await assertCanRunAiJob(ctx);
  // Billing gates — no-op until the commercial license is signed (M14).
  const { assertFeature, assertAllowance, recordUsage } = await import("../billing/service");
  await assertFeature(ctx, "ai");
  await assertAllowance(ctx, "ai_proposals");
  const settings = await getAiSettings(ctx);

  const { text: redactedInput, counts: redactionCounts, edits } = redact(rawInput);

  // The task a task-scoped draft targets. Resolved through the workspace so a
  // guessed id reveals nothing and can never be written to.
  const targetTask = taskId
    ? await ctx.db.task.findFirst({
        where: { id: taskId, workspaceId: ctx.workspaceId, archivedAt: null },
        select: { id: true, title: true },
      })
    : null;
  if (taskId && !targetTask) throw new ApiError("not_found", { field: "taskId" });

  // Grounded context retrieval (issue #232): an authorization-scoped set of
  // the most relevant existing tasks/comments/project brief, derived from
  // the already-redacted input so nothing unredacted reaches the query
  // builder. Only reached once assertCanRunAiJob() above has confirmed AI
  // is enabled for this workspace — a disabled workspace never queries for
  // retrieval context, let alone calls a provider with it.
  const retrieved = await retrieveContext(ctx, {
    kind: kind as AiKind,
    redactedInput,
    projectId,
  });
  const retrievedIds = new Set(retrieved.map((s) => s.id));

  const context = {
    ...(projectId ? await buildContext(ctx, projectId) : {}),
    ...(targetTask ? { targetTask: { id: targetTask.id, title: targetTask.title } } : {}),
    ...(retrieved.length ? { retrieved: retrieved.map(({ id, title, body }) => ({ id, title, body })) } : {}),
  };
  const prompt = renderPrompt({ kind: kind as AiKind, input: redactedInput, context }, redactedInput);

  // Cache: an identical redacted prompt in this workspace → reuse its draft,
  // but only while that draft is still reviewable. Handing back a proposal
  // the user already applied or rejected would put a terminal row behind a
  // fresh-looking review that can no longer be applied (PR #377 review).
  const cached = await ctx.db.aiJob.findFirst({
    where: {
      workspaceId: ctx.workspaceId,
      cacheKey: prompt.cacheKey,
      state: "succeeded",
      proposal: { is: { state: { in: [...REVIEWABLE_STATES] } } },
    },
    include: { proposal: true },
    orderBy: { createdAt: "desc" },
  });
  if (cached?.proposal) {
    return {
      job: publicJob(cached),
      proposal: cached.proposal,
      cached: true,
      retrieved: retrieved.map(({ id, title }) => ({ id, title })),
    };
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
      // Recorded for reproducibility (issue #232): exactly which entities
      // grounded this draft, independent of what the model chose to cite.
      retrievedIds: [...retrievedIds],
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
        targetsExistingTask: targetTask !== null,
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

  // The provider only ever saw the redacted input, so its citation offsets
  // index that string. Translate them back to the original before anything is
  // stored, or review quotes text shifted by every earlier redaction
  // ([EMAIL] is seven characters; the address it replaced rarely was).
  const grounded = {
    ...output.draft,
    operations: mapCitationSpans(output.draft.operations, edits, rawInput.length),
  };

  let guard;
  try {
    guard = guardDraft(grounded, settings.maxBlastRadius, {
      hasTargetTask: targetTask !== null,
      retrievedIds,
    });
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
        // Bound to the task this draft was scoped to, so apply can resolve
        // TARGET_TASK_REF from the server's own record rather than trusting
        // whatever the client sends back with the edited operations.
        targetTaskId: targetTask?.id ?? null,
        operations: guard.draft.operations as Prisma.InputJsonValue,
        summary: guard.draft.summary,
        // Kept rather than dropped: review has to be able to show what the
        // model could not resolve from the source (issue #368).
        openQuestions: guard.draft.openQuestions as Prisma.InputJsonValue,
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
  return {
    job: publicJob(updatedJob),
    proposal,
    degraded,
    groundedRatio: guard.groundedRatio,
    // So the review UI can render source-based citations as an evidence
    // link (id + title) without a second round-trip (issue #232).
    retrieved: retrieved.map(({ id, title }) => ({ id, title })),
  };
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
