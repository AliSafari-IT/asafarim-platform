import "server-only";
import type {
  FlakeDetectedData,
  RegressionDetectedData,
  RunArtifactBundle,
  TimelineStep,
} from "@asafarim/testora-tasksai-contract";
import type { Prisma, PrismaClient } from "../db/generated";
import { getTasksAiDb } from "../db/client";
import { getEnv } from "../env";
import { logger } from "../observability/logger";
import { emitActivity, recordAudit } from "../events/emit";
import { EVENT } from "../events/names";
import { redact } from "./redact";
import { renderPrompt } from "./prompts";
import { guardDraft, GuardError } from "./guard";
import { getProvider } from "./registry";
import { DEFAULT_AI_SETTINGS } from "./settings";
import { ProviderError } from "./provider";

/**
 * The `test_diagnosis` pipeline (issue #264), run from the worker for a
 * Testora `regression.detected` / `flake.detected` delivery.
 *
 *   resolve integration/settings → (AI off? deterministic templated task)
 *   → build an UNTRUSTED bundle summary → redact → versioned prompt
 *   → provider call (retry, degraded fallback to fixture) → guard against
 *   the op allowlist + blast radius → persist AiJob + usage + a Proposal in
 *   `draft` state. Nothing is applied; rejecting the proposal changes
 *   nothing. Guard failure falls back to a deterministic templated task so
 *   the loop still produces a ticket.
 */

export interface TestoraDiagnosePayload {
  deliveryId: string;
  eventType: "regression.detected" | "flake.detected";
  workspaceId: string;
  projectId: string;
  appId: string;
  causationId: string | null;
  data: RegressionDetectedData | FlakeDetectedData;
}

const MAX_ATTEMPTS = 3;
const DOM_EXCERPT_CHARS = 4000;

export async function runTestoraDiagnosis(
  payload: TestoraDiagnosePayload,
  dbOverride?: PrismaClient,
): Promise<{ ignored?: string; proposalId?: string; taskId?: string; degraded?: boolean }> {
  const db = dbOverride ?? getTasksAiDb();
  const { deliveryId, workspaceId, projectId, eventType } = payload;
  const externalId = `testora:${deliveryId}`;

  const marker = await db.integrationEvent.findUnique({
    where: { provider_externalId: { provider: "testora", externalId } },
  });
  if (marker?.taskId || marker?.kind === "diagnosed") {
    return { ignored: "already processed" };
  }

  const { scenarioTitle, input: untrusted } = await buildDiagnosisInput(payload);

  const settings =
    (await db.aiSettings.findUnique({ where: { workspaceId } })) ??
    ({ workspaceId, ...DEFAULT_AI_SETTINGS } as const);

  const membershipId = await resolveMembershipId(db, workspaceId);
  const projectName = (
    await db.project.findFirst({ where: { id: projectId, workspaceId }, select: { name: true } })
  )?.name;

  // ── AI off: deterministic templated task, same intent as Testora's own
  //    buildIssueDraft fallback. No AiJob, no Proposal.
  if (!settings.enabled) {
    return createTemplatedTask(db, payload, scenarioTitle, untrusted, "ai_disabled");
  }

  const { text: redactedInput, counts: redactionCounts } = redact(untrusted);
  const prompt = renderPrompt(
    { kind: "test_diagnosis", input: redactedInput, context: { projectName } },
    redactedInput,
  );

  const cached = await db.aiJob.findFirst({
    where: { workspaceId, cacheKey: prompt.cacheKey, state: "succeeded", kind: "test_diagnosis" },
    include: { proposal: true },
    orderBy: { createdAt: "desc" },
  });
  if (cached?.proposal) {
    await markDiagnosed(db, externalId);
    return { proposalId: cached.proposal.id };
  }

  const job = await db.aiJob.create({
    data: {
      workspaceId,
      membershipId,
      kind: "test_diagnosis",
      state: "running",
      provider: settings.provider,
      model: settings.model,
      promptVersion: prompt.version,
      cacheKey: prompt.cacheKey,
    },
  });

  const started = Date.now();
  let output: Awaited<ReturnType<Awaited<ReturnType<typeof getProvider>>["generate"]>> | undefined;
  let usedProvider = settings.provider;
  let degraded = false;

  for (let attempt = 1; ; attempt++) {
    try {
      const provider = await getProvider(usedProvider);
      output = await provider.generate({
        kind: "test_diagnosis",
        prompt,
        model: usedProvider === settings.provider ? settings.model : provider.models[0],
      });
      break;
    } catch (err) {
      const retryable = err instanceof ProviderError ? err.retryable : true;
      if (attempt >= MAX_ATTEMPTS || !retryable) {
        if (usedProvider !== "fixture") {
          usedProvider = "fixture";
          degraded = true;
          continue;
        }
        await db.aiJob.update({
          where: { id: job.id },
          data: { state: "failed", error: errText(err) },
        });
        // Provider unusable even offline → still produce a ticket.
        return createTemplatedTask(db, payload, scenarioTitle, untrusted, "provider_failed");
      }
      await new Promise((r) => setTimeout(r, 250 * attempt));
    }
  }

  let guard;
  try {
    guard = guardDraft(output.draft, settings.maxBlastRadius ?? 50);
  } catch (err) {
    await db.aiJob.update({
      where: { id: job.id },
      data: { state: "failed", error: err instanceof GuardError ? err.reasons.join("; ").slice(0, 500) : errText(err) },
    });
    return createTemplatedTask(db, payload, scenarioTitle, untrusted, "guard_rejected");
  }

  const latencyMs = Date.now() - started;
  const [, proposal] = await db.$transaction([
    db.aiJob.update({
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
    db.proposal.create({
      data: {
        workspaceId,
        aiJobId: job.id,
        membershipId,
        kind: "test_diagnosis",
        state: "draft",
        operations: guard.draft.operations as Prisma.InputJsonValue,
        summary: guard.draft.summary,
      },
    }),
    db.aiUsageLedger.create({
      data: {
        workspaceId,
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

  await markDiagnosed(db, externalId);
  await recordAudit(
    db,
    workspaceId,
    "proposal.generated",
    membershipId,
    {
      source: "testora",
      eventType,
      aiJobId: job.id,
      kind: "test_diagnosis",
      provider: usedProvider,
      promptVersion: prompt.version,
      opCount: guard.operationCount,
      groundedRatio: Number(guard.groundedRatio.toFixed(2)),
      redactionCounts,
      degraded,
    },
    payload.causationId ?? undefined,
  );

  logger.info(
    { proposalId: proposal.id, deliveryId, eventType, degraded },
    "testora.diagnosis.proposed",
  );
  return { proposalId: proposal.id, degraded };
}

// ── helpers ──────────────────────────────────────────────────────────────

async function createTemplatedTask(
  db: ReturnType<typeof getTasksAiDb>,
  payload: TestoraDiagnosePayload,
  scenarioTitle: string,
  untrusted: string,
  reason: string,
): Promise<{ taskId: string; degraded: true }> {
  const { workspaceId, projectId, deliveryId, eventType } = payload;
  const task = await db.task.create({
    data: {
      workspaceId,
      projectId,
      title: `Investigate failing test: ${scenarioTitle}`.slice(0, 500),
      description: [
        `Automated ${eventType} from Testora (app ${payload.appId}).`,
        `Triage was not AI-generated (${reason}); review the evidence below manually.`,
        "",
        untrusted,
      ]
        .join("\n")
        .slice(0, 20000),
      source: "import",
    },
  });
  await db.integrationEvent.updateMany({
    where: { provider: "testora", externalId: `testora:${deliveryId}` },
    data: { taskId: task.id, kind: "diagnosed_fallback" },
  });
  await emitActivity(db, workspaceId, deliveryId, {
    name: EVENT.taskCreated,
    targetType: "task",
    targetId: task.id,
    actorType: "system",
    data: { source: "testora", eventType, fallbackReason: reason },
  });
  logger.info({ taskId: task.id, deliveryId, reason }, "testora.diagnosis.templated_task");
  return { taskId: task.id, degraded: true };
}

async function markDiagnosed(db: ReturnType<typeof getTasksAiDb>, externalId: string): Promise<void> {
  await db.integrationEvent.updateMany({
    where: { provider: "testora", externalId },
    data: { kind: "diagnosed" },
  });
}

async function resolveMembershipId(
  db: ReturnType<typeof getTasksAiDb>,
  workspaceId: string,
): Promise<string> {
  const owner = await db.membership.findFirst({
    where: { workspaceId, role: "owner", archivedAt: null },
    orderBy: { createdAt: "asc" },
    select: { id: true },
  });
  if (owner) return owner.id;
  const any = await db.membership.findFirst({ where: { workspaceId }, select: { id: true } });
  return any?.id ?? "system";
}

async function loadBundle(
  data: RegressionDetectedData | FlakeDetectedData,
): Promise<RunArtifactBundle | null> {
  const ref = "bundle" in data ? data.bundle : undefined;
  if (!ref) return null;
  if (ref.inline) return ref.inline;
  if (!ref.url) return null;
  try {
    const res = await fetchWithToken(ref.url, 4000);
    if (!res?.ok) return null;
    return (await res.json()) as RunArtifactBundle;
  } catch {
    return null;
  }
}

async function fetchWithToken(url: string, timeoutMs: number): Promise<Response | null> {
  const token = getEnv().testoraBundleReadToken;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(url, {
      headers: token ? { authorization: `Bearer ${token}` } : {},
      signal: controller.signal,
    });
  } finally {
    clearTimeout(timer);
  }
}

async function fetchDomExcerpt(bundle: RunArtifactBundle | null): Promise<string> {
  const dom = bundle?.artifacts.find((a) => a.kind === "dom_snapshot");
  if (!dom) return "(not available)";
  try {
    const res = await fetchWithToken(dom.url, 3000);
    if (!res?.ok) return "(fetch failed)";
    const text = await res.text();
    return text.slice(0, DOM_EXCERPT_CHARS);
  } catch {
    return "(fetch failed)";
  }
}

function renderTimeline(steps: TimelineStep[]): string {
  if (steps.length === 0) return "(no step timeline)";
  return steps
    .slice(0, 60)
    .map((s) => `  ${s.index} [${s.status}] ${s.label}`)
    .join("\n");
}

/**
 * The UNTRUSTED bundle summary handed to the model (fenced + redacted by the
 * caller). Test artifacts only — never application source.
 */
function buildBundleSummary(
  payload: TestoraDiagnosePayload,
  bundle: RunArtifactBundle | null,
): string {
  const d = payload.data;
  const lines: string[] = [`Scenario: ${d.scenarioTitle || d.scenarioId}`];

  if (payload.eventType === "regression.detected") {
    const r = d as RegressionDetectedData;
    lines.push(
      `Event: regression.detected (was ${r.previousStatus}; ${r.runsSinceLastPass} run(s) since last pass)`,
    );
  } else {
    const f = d as FlakeDetectedData;
    lines.push(
      `Event: flake.detected (pass rate ${f.passRate} over ${f.sampleSize} run(s)${f.quarantined ? "; quarantined in Testora" : ""})`,
    );
  }

  if (bundle) {
    lines.push(`Run status: ${bundle.status}, attempt ${bundle.attempt}`);
    if (bundle.errorClass) lines.push(`Error class: ${bundle.errorClass}`);
    if (bundle.errorMessage) lines.push(`Error: ${bundle.errorMessage}`);
    lines.push("Step timeline:", renderTimeline(bundle.steps));
    const prev = bundle.context?.previousPass;
    lines.push(
      `Fail-vs-pass: ${prev ? `last passing run recorded ${prev.createdAt}` : "no prior passing run recorded"}`,
    );
  } else {
    lines.push("Run bundle: (not available)");
  }

  return lines.join("\n");
}

/** Public for the worker: assemble the full input incl. a DOM excerpt. */
export async function buildDiagnosisInput(
  payload: TestoraDiagnosePayload,
): Promise<{ scenarioTitle: string; input: string }> {
  const bundle = await loadBundle(payload.data);
  const summary = buildBundleSummary(payload, bundle);
  const dom = await fetchDomExcerpt(bundle);
  return {
    scenarioTitle: payload.data.scenarioTitle || payload.data.scenarioId,
    input: `${summary}\nDOM excerpt:\n${dom}`,
  };
}

function errText(err: unknown): string {
  return (err instanceof Error ? err.message : "unknown").slice(0, 500);
}
