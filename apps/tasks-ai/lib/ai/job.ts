import "server-only";
import { randomUUID } from "node:crypto";
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
import { ProviderError, type ProviderDelta } from "./provider";
import { buildAiCostEvent, legacyUsd, recordStandaloneAiCost, type CostAttribution } from "./cost/ledger";
import { billedUsageOf } from "./cost/meta";
import { getProject } from "../repositories/projects";

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

/** Thrown when a streaming caller's signal aborts mid-provider-call (issue
 *  #236) — a Stop button or a dropped connection. The AiJob row is marked
 *  `cancelled` for the record, but nothing else is persisted: no guard run,
 *  no Proposal, no usage-ledger row. Distinct from ApiError so the stream
 *  route can tell "the user stopped this" apart from a real failure and
 *  skip the `error` SSE event for it. */
export class AiJobCancelledError extends Error {
  constructor(public readonly jobId: string) {
    super("AI job cancelled");
    this.name = "AiJobCancelledError";
  }
}

/**
 * The AI job pipeline (docs/adr/0004, M06 scope):
 *   kill-switch + quota → redact → render versioned prompt → cache lookup
 *   → provider call (retry, degraded fallback to fixture) → guard against
 *   the operation allowlist + blast radius → persist AiJob + usage ledger
 *   + a Proposal in `draft` state. NOTHING is applied here.
 *
 * `streamOpts` (issue #236) is only ever set by the streaming route
 * (app/api/.../ai/jobs/stream): `onDelta` is forwarded to the provider for
 * incremental token/operation events, and `signal` lets a Stop button or a
 * dropped connection cancel the in-flight provider call — see
 * AiJobCancelledError above. Every other caller (the non-streaming route,
 * regenerateProposal, the Testora/brief-delivery integrations, every
 * existing test) omits it and is completely unaffected: this parameter
 * changes nothing about the canonical, single persistence path below.
 */
export async function runAiJob(
  ctx: RequestContext,
  input: unknown,
  streamOpts?: { onDelta?: (delta: ProviderDelta) => void; signal?: AbortSignal },
) {
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
        select: { id: true, title: true, projectId: true },
      })
    : null;
  if (taskId && !targetTask) throw new ApiError("not_found", { field: "taskId" });

  // Cost attribution is decided here, once (issue #590). A project id is
  // only honoured when the actor can see that project (guests: projects
  // they belong to) — a foreign or guessed id is refused rather than
  // silently attributing spend to someone else's project.
  if (projectId && !targetTask && !(await getProject(ctx, projectId))) {
    throw new ApiError("not_found", { field: "projectId" });
  }
  const scope: CostAttribution = targetTask
    ? { attribution: "task", projectId: targetTask.projectId, taskId: targetTask.id }
    : projectId
      ? { attribution: "project", projectId }
      : { attribution: "workspace" };

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
      projectId: scope.attribution === "workspace" ? null : scope.projectId,
      targetTaskId: scope.attribution === "task" ? scope.taskId : null,
    },
  });
  if (targetTask) {
    await ctx.db.aiJobTaskLink.create({ data: { aiJobId: job.id, taskId: targetTask.id, role: "target" } });
  }
  const costBase = {
    workspaceId: ctx.workspaceId,
    actorId: ctx.actor.membershipId,
    aiJobId: job.id,
    operation: kind,
    scope,
    promptVersion: prompt.version,
  };

  const started = Date.now();
  let output;
  let usedProvider = settings.provider;
  let degraded = false;

  let usedModel = settings.model;

  for (let attempt = 1; ; attempt++) {
    if (streamOpts?.signal?.aborted) {
      await ctx.db.aiJob.update({
        where: { id: job.id },
        data: { state: "cancelled", cancelledAt: new Date() },
      });
      throw new AiJobCancelledError(job.id);
    }
    try {
      const provider = await getProvider(usedProvider);
      usedModel = usedProvider === settings.provider ? settings.model : provider.models[0];
      output = await provider.generate({
        kind: kind as AiKind,
        prompt,
        model: usedModel,
        targetsExistingTask: targetTask !== null,
        signal: streamOpts?.signal,
        onDelta: streamOpts?.onDelta,
      });
      break;
    } catch (err) {
      // A cancellation surfaces as whatever error shape the provider's
      // fetch call throws on an aborted signal — never retried or degraded
      // to fixture like a real provider failure would be, since that would
      // both ignore the Stop button and still end up persisting a Proposal
      // the user asked to not generate.
      if (streamOpts?.signal?.aborted) {
        await ctx.db.aiJob.update({
          where: { id: job.id },
          data: { state: "cancelled", cancelledAt: new Date() },
        });
        // Cancelled mid-call: a real provider may still bill the tokens it
        // generated but reports no usage for an aborted request → one
        // cancelled event with UNKNOWN cost (issue #590 rule). Nothing for
        // the free fixture.
        if (usedProvider !== "fixture") {
          await recordStandaloneAiCost(ctx.db, {
            ...costBase,
            provider: usedProvider,
            requestModel: usedModel,
            inputTokens: 0,
            outputTokens: 0,
            fixture: false,
            outcome: "cancelled",
            usageUnknown: true,
            latencyMs: Date.now() - started,
            suffix: "cancelled",
          });
        }
        throw new AiJobCancelledError(job.id);
      }
      // A response that came back but could not be used (bad JSON, schema
      // failure) was still billed — record it before retrying/degrading.
      const billed = billedUsageOf(err);
      if (billed && usedProvider !== "fixture") {
        await recordStandaloneAiCost(ctx.db, {
          ...costBase,
          provider: usedProvider,
          requestModel: usedModel,
          inputTokens: 0,
          outputTokens: 0,
          meta: billed,
          fixture: false,
          outcome: "failed",
          latencyMs: Date.now() - started,
          suffix: `attempt_${usedProvider}_${attempt}`,
        });
      }
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
    // The provider answered and billed; the guard rejected the draft.
    await recordStandaloneAiCost(ctx.db, {
      ...costBase,
      provider: usedProvider,
      requestModel: output.fixture ? "fixture-1" : usedModel,
      inputTokens: output.inputTokens,
      outputTokens: output.outputTokens,
      meta: output,
      fixture: output.fixture,
      outcome: "failed",
      latencyMs: Date.now() - started,
      suffix: "final",
    });
    throw new ApiError("validation_failed", { reason: "AI output failed the safety guard" });
  }

  const latencyMs = Date.now() - started;
  const cost = buildAiCostEvent({
    ...costBase,
    provider: usedProvider,
    requestModel: output.fixture ? "fixture-1" : usedModel,
    inputTokens: output.inputTokens,
    outputTokens: output.outputTokens,
    meta: output,
    fixture: output.fixture,
    outcome: degraded ? "degraded" : "succeeded",
    latencyMs,
    suffix: "final",
  });
  // The legacy float columns now carry the same registry estimate as the
  // canonical event (0 when unknown — the budget can only sum what is known).
  const legacyCostUsd = legacyUsd(cost.estimatedCostMicros);
  // Minted up front so the cost event can name the proposal it produced.
  const proposalId = randomUUID();

  const [updatedJob, proposal] = await ctx.db.$transaction([
    ctx.db.aiJob.update({
      where: { id: job.id },
      data: {
        state: degraded ? "degraded" : "succeeded",
        provider: usedProvider,
        inputTokens: output.inputTokens,
        outputTokens: output.outputTokens,
        costUsd: legacyCostUsd,
        latencyMs,
      },
    }),
    ctx.db.proposal.create({
      data: {
        id: proposalId,
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
        costUsd: legacyCostUsd,
        fixture: output.fixture,
      },
    }),
    // Canonical, attributed, append-only (issue #590). Same transaction as
    // the job/proposal, so a job is never "succeeded" without its event.
    ctx.db.aiCostEvent.createMany({ data: [{ ...cost.row, proposalId }], skipDuplicates: true }),
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
