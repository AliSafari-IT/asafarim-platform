import { randomUUID } from "node:crypto";
import {
  buildIdempotencyKey,
  createPricingRegistry,
  estimateCost,
  parseCostEventWrite,
  perMillionTokens,
  perUnits,
  totalInputTokens,
  totalOutputTokens,
  type CostEventWriteInput,
  type CredentialSource,
  type Outcome,
  type PricingSnapshot,
  type UsageLine,
} from "@asafarim/ai-cost-ledger";
import { prisma, type Prisma } from "@asafarim/db";

/**
 * Vionto's writer for the platform AI cost-event contract (issue #588;
 * docs/adr/0003-ai-cost-event-contract.md).
 *
 * Instrumented stages — every one writes exactly one idempotent event per
 * provider call that returned billable usage:
 *
 * | operation        | where                                   | subject      |
 * |------------------|-----------------------------------------|--------------|
 * | `story`          | /api/story/generate, /regenerate        | script       |
 * | `vision_caption` | captioning inside /api/story/generate   | asset        |
 * | `tts`            | worker narration synthesis              | render_job   |
 * | `tts_preview`    | /api/audio/preview (voice picker)       | user         |
 * | `ai_motion_clip` | AI clip reaching `succeeded` (poll)     | ai_clip      |
 *
 * Documented as **not instrumented** (and therefore absent, not $0):
 * album analysis/image scoring run locally (no provider), Pixabay music is
 * free/licensed, FFmpeg rendering is our own compute, and a generative clip
 * that ends `failed` is not billed by fal/Kling so it writes nothing.
 */

// ── Pricing ─────────────────────────────────────────────────────────────

/** Bump whenever a rate below changes — the version is what makes snapshots comparable. */
export const VIONTO_PRICING_VERSION = "vionto-2026-09-24";

const text = (input: string, cached: string, output: string, cacheWrite?: string) => [
  perMillionTokens("input", input),
  perMillionTokens("cached_input", cached),
  perMillionTokens("output", output),
  perMillionTokens("reasoning_output", output),
  ...(cacheWrite ? [perMillionTokens("cache_write_input", cacheWrite)] : []),
];

/**
 * Rates are each provider's published list price when this was written —
 * `registry_estimate`, not a billed amount. ElevenLabs and Azure TTS bill
 * through credit/tier plans with no per-character list price we can hold
 * honestly, so they are deliberately left out: their calls record
 * `unknown`, not a guessed number.
 */
export const viontoPricing = createPricingRegistry(VIONTO_PRICING_VERSION, [
  { provider: "openai", model: "gpt-4o-mini*", rates: text("0.15", "0.075", "0.60") },
  { provider: "openai", model: "gpt-4o*", rates: text("2.50", "1.25", "10") },
  { provider: "openai", model: "gpt-4.1-nano*", rates: text("0.10", "0.025", "0.40") },
  { provider: "openai", model: "gpt-4.1-mini*", rates: text("0.40", "0.10", "1.60") },
  { provider: "openai", model: "gpt-4.1*", rates: text("2", "0.50", "8") },
  { provider: "openai", model: "tts-1-hd*", rates: [perUnits("tts_output", "characters", "30", 1_000_000)] },
  { provider: "openai", model: "tts-1*", rates: [perUnits("tts_output", "characters", "15", 1_000_000)] },
  { provider: "anthropic", model: "claude-3-haiku*", rates: text("0.25", "0.03", "1.25", "0.30") },
  { provider: "anthropic", model: "claude-haiku-4-5*", rates: text("1", "0.10", "5", "1.25") },
  { provider: "anthropic", model: "claude-sonnet-4*", rates: text("3", "0.30", "15", "3.75") },
]);

// ── Types ───────────────────────────────────────────────────────────────

export type ViontoCostOperation = "story" | "vision_caption" | "tts" | "tts_preview" | "ai_motion_clip";
export type ViontoSubjectType = "script" | "asset" | "render_job" | "ai_clip" | "user";

export interface ViontoCostInput {
  userId: string;
  operation: ViontoCostOperation;
  subjectType: ViontoSubjectType;
  subjectId: string;
  projectId?: string | null;
  versionId?: string | null;
  renderJobId?: string | null;
  workflowId?: string | null;
  provider: string;
  requestModel?: string | null;
  responseModel: string;
  providerRequestId?: string | null;
  promptVersion?: string | null;
  usage: UsageLine[];
  credentialSource: CredentialSource;
  outcome?: Outcome;
  latencyMs?: number | null;
  occurredAt?: Date;
  /** Stable per logical call. Defaults to the provider request id, else a fresh id. */
  stableId?: string;
  /** Pre-computed amount (AI clips copy their #352 snapshot rather than re-pricing). */
  preset?: { estimatedCostMicros: bigint | null; pricingSnapshot: PricingSnapshot | null };
  metadata?: Record<string, string | number | boolean | null>;
}

/** Map Vionto's ResolvedCredential.source onto the contract's payer vocabulary. */
export function credentialSourceOf(source: "user" | "env" | "none" | null | undefined): CredentialSource {
  if (source === "user") return "user_byok";
  if (source === "env") return "platform";
  return "none";
}

export function buildViontoCostEvent(input: ViontoCostInput): CostEventWriteInput {
  const stableId = input.stableId ?? (input.providerRequestId ? `req_${input.providerRequestId}` : `call_${randomUUID()}`);
  const base = {
    idempotencyKey: buildIdempotencyKey("vionto", input.operation, stableId),
    app: "vionto",
    ownerType: "user" as const,
    ownerId: input.userId,
    actorId: input.userId,
    operation: input.operation,
    outcome: input.outcome ?? "succeeded",
    subjectType: input.subjectType,
    subjectId: input.subjectId,
    parentSubjectType: input.projectId && input.subjectType !== "user" ? "project" : null,
    parentSubjectId: input.projectId && input.subjectType !== "user" ? input.projectId : null,
    workflowId: input.workflowId ?? null,
    provider: input.provider,
    requestModel: input.requestModel ?? input.responseModel,
    responseModel: input.responseModel,
    providerRequestId: input.providerRequestId ?? null,
    promptVersion: input.promptVersion ?? null,
    usage: input.usage,
    credentialSource: input.credentialSource,
    latencyMs: input.latencyMs ?? null,
    occurredAt: input.occurredAt ?? new Date(),
    metadata: input.metadata ?? {},
  };

  if (input.preset) {
    const known = input.preset.estimatedCostMicros !== null && input.preset.pricingSnapshot !== null;
    return known
      ? {
          ...base,
          costSource: "registry_estimate",
          estimatedCostMicros: input.preset.estimatedCostMicros,
          pricingSnapshot: input.preset.pricingSnapshot,
        }
      : { ...base, costSource: "unknown" };
  }

  const snapshot = viontoPricing.lookup(input.provider, input.responseModel);
  const estimate = snapshot ? estimateCost(input.usage, snapshot) : null;
  if (!snapshot || !estimate || estimate.costMicros === null) {
    return { ...base, costSource: "unknown" };
  }
  return {
    ...base,
    costSource: "registry_estimate",
    estimatedCostMicros: estimate.costMicros,
    pricingSnapshot: snapshot,
    pricingTier: snapshot.tier,
  };
}

const WRITE_ATTEMPTS = 3;

/**
 * Append one event. Retried with the same idempotency key on a transient
 * database error; **never throws** — a ledger hiccup must not fail (or,
 * worse, re-run) a provider call the user has already paid for. A write
 * that still fails is logged loudly with its key and amount for backfill.
 */
export async function recordViontoCost(input: ViontoCostInput): Promise<{ written: boolean; idempotencyKey: string }> {
  const e = parseCostEventWrite(buildViontoCostEvent(input));
  for (let attempt = 1; ; attempt++) {
    try {
      const result = await prisma.viontoAiCostEvent.createMany({
        skipDuplicates: true,
        data: [
          {
            idempotencyKey: e.idempotencyKey,
            schemaVersion: e.schemaVersion,
            entryType: e.entryType,
            userId: input.userId,
            actorId: e.actorId,
            operation: e.operation,
            outcome: e.outcome,
            finality: e.finality,
            subjectType: e.subjectType,
            subjectId: e.subjectId,
            parentSubjectType: e.parentSubjectType,
            parentSubjectId: e.parentSubjectId,
            projectId: input.projectId ?? null,
            versionId: input.versionId ?? null,
            renderJobId: input.renderJobId ?? null,
            workflowId: e.workflowId,
            traceId: e.traceId,
            provider: e.provider,
            requestModel: e.requestModel,
            responseModel: e.responseModel,
            providerRequestId: e.providerRequestId,
            promptVersion: e.promptVersion,
            pricingTier: e.pricingTier,
            usage: e.usage as unknown as Prisma.InputJsonValue,
            inputTokens: totalInputTokens(e.usage),
            outputTokens: totalOutputTokens(e.usage),
            currency: e.currency,
            estimatedCostMicros: e.estimatedCostMicros,
            actualCostMicros: e.actualCostMicros,
            adjustmentDeltaMicros: e.adjustmentDeltaMicros,
            costSource: e.costSource,
            credentialSource: e.credentialSource,
            pricingSnapshot: (e.pricingSnapshot ?? undefined) as Prisma.InputJsonValue | undefined,
            fixture: e.fixture,
            supersedesEventId: e.supersedesEventId,
            latencyMs: e.latencyMs,
            metadata: e.metadata as Prisma.InputJsonValue,
            occurredAt: e.occurredAt,
            finalizedAt: e.finalizedAt,
          },
        ],
      });
      return { written: result.count === 1, idempotencyKey: e.idempotencyKey };
    } catch (err) {
      if (attempt >= WRITE_ATTEMPTS) {
        console.error("[ai-cost] record_failed", {
          idempotencyKey: e.idempotencyKey,
          operation: e.operation,
          estimatedCostMicros: e.estimatedCostMicros?.toString() ?? null,
          error: err instanceof Error ? err.message : String(err),
        });
        return { written: false, idempotencyKey: e.idempotencyKey };
      }
      await new Promise((resolve) => setTimeout(resolve, 100 * attempt));
    }
  }
}

// ── Stage helpers ───────────────────────────────────────────────────────

/** Story events are keyed by the script they produced — one script, one event. */
export function storyStableId(scriptId: string): string {
  return `script_${scriptId}`;
}

/** Clip events are keyed by clip id, so repeated polls of a finished clip are no-ops. */
export function clipStableId(clipId: string): string {
  return clipId;
}

/**
 * Convert an AI clip's generation-time snapshot (#352) into a contract
 * pricing snapshot without re-pricing it: the registry's per-5s rate,
 * applied to the same requested seconds, yields the same amount.
 */
export function clipPricingSnapshot(clip: {
  provider: string;
  model: string;
  pricingSnapshot: unknown;
}): PricingSnapshot | null {
  const snap = clip.pricingSnapshot as { amount?: unknown; unit?: unknown } | null;
  if (!snap || typeof snap.amount !== "number" || snap.unit !== "per_5s_clip") return null;
  return {
    pricingVersion: "vionto-clip-registry",
    provider: clip.provider,
    model: clip.model,
    tier: null,
    currency: "USD",
    rates: [{ bucket: "video_output", unit: "seconds", rateMicros: String(Math.round(snap.amount * 1_000_000)), per: "5" }],
  };
}

/** Record the ledger event for a clip that just reached `succeeded`. Idempotent per clip. */
export async function recordClipCost(clip: {
  id: string;
  userId: string;
  projectId: string;
  versionId: string | null;
  provider: string;
  model: string;
  taskId: string | null;
  durationSeconds: number;
  estimatedCostUsdMicros: bigint | null;
  credentialSource: string | null;
  pricingSnapshot: unknown;
}) {
  const snapshot = clipPricingSnapshot(clip);
  return recordViontoCost({
    userId: clip.userId,
    operation: "ai_motion_clip",
    subjectType: "ai_clip",
    subjectId: clip.id,
    projectId: clip.projectId,
    versionId: clip.versionId,
    provider: clip.provider,
    responseModel: clip.model,
    providerRequestId: clip.taskId,
    usage: [{ bucket: "video_output", unit: "seconds", quantity: clip.durationSeconds }],
    credentialSource: credentialSourceOf(clip.credentialSource as "user" | "env" | "none" | null),
    stableId: clipStableId(clip.id),
    preset: { estimatedCostMicros: clip.estimatedCostUsdMicros, pricingSnapshot: snapshot },
  });
}

/** What a render actually consumed, carried from /api/render to the worker in the manifest. */
export interface ExportCostInputs {
  scriptId?: string;
  aiClipIds?: string[];
  assetIds?: string[];
}

/**
 * Freeze the exact cost events a new export consumed (issue #588):
 * the story that produced its script, the AI clips it rendered, captions
 * of the images it used, and the narration synthesized by *this* render
 * job. Resolved from ids captured at render time — never from whatever the
 * project looks like now — and written once.
 */
export async function snapshotExportCostEvents(args: {
  exportId: string;
  userId: string;
  renderJobId: string;
  inputs: ExportCostInputs | undefined;
}): Promise<number> {
  const inputs = args.inputs ?? {};
  const or: Prisma.ViontoAiCostEventWhereInput[] = [{ operation: "tts", renderJobId: args.renderJobId }];
  if (inputs.scriptId) or.push({ operation: "story", subjectType: "script", subjectId: inputs.scriptId });
  if (inputs.aiClipIds?.length) or.push({ operation: "ai_motion_clip", subjectType: "ai_clip", subjectId: { in: inputs.aiClipIds } });
  if (inputs.assetIds?.length) or.push({ operation: "vision_caption", subjectType: "asset", subjectId: { in: inputs.assetIds } });

  const events = await prisma.viontoAiCostEvent.findMany({
    where: { userId: args.userId, entryType: "usage", OR: or },
    select: { id: true, operation: true },
  });
  const roleOf: Record<string, string> = { story: "story", tts: "narration", ai_motion_clip: "ai_clip", vision_caption: "caption" };

  await prisma.$transaction([
    prisma.viontoExportCostEvent.createMany({
      skipDuplicates: true,
      data: events.map((e) => ({ exportId: args.exportId, costEventId: e.id, role: roleOf[e.operation] ?? e.operation })),
    }),
    prisma.viontoExport.update({ where: { id: args.exportId }, data: { costSnapshotAt: new Date() } }),
  ]);
  return events.length;
}
