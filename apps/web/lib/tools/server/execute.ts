import "server-only";
import { randomUUID } from "node:crypto";
import { z } from "zod";
import { getTool } from "../catalogue";
import {
  TOOL_ENVELOPE_VERSION,
  TOOL_ERROR_STATUS,
  toolError,
  type ToolErrorCode,
  type ToolRunEnvelope,
  type ToolRunSuccess,
} from "../envelope";
import type { ToolDefinition } from "../types";
import type { ToolAdapter } from "./adapter";
import type { ToolRuntimeConfig } from "./config";
import { buildCostEvent, worstCaseCostMicros, type CostEventSink, type LiveAttempt } from "./cost";
import { hashInput, type IdempotencyStore } from "./idempotency";
import type { ToolLogger } from "./log";
import { ProviderError, type LiveCompletionResult, type LiveProvider } from "./providers/types";

/**
 * The single server-side execution path for every public AI tool.
 *
 * Order matters and is tested:
 *   request shape → tool exists → input size → input schema   (no spend)
 *   → example? serve fixture                                    (no spend)
 *   → paused / disabled / fixture mode / live off               (no spend)
 *   → idempotency → spend ceiling                               (no spend)
 *   → admission: rate limits, concurrency, daily budget (#680)  (no spend)
 *   → provider (timeout)                                        (spend)
 *   → cost event → output size → JSON → output schema → envelope
 *
 * Nothing here logs or returns input/output text, prompts, keys, or raw
 * provider errors.
 */
export interface ExecuteDeps {
  config: ToolRuntimeConfig;
  createProvider: (provider: NonNullable<ToolRuntimeConfig["provider"]>, timeoutMs: number) => LiveProvider;
  store: IdempotencyStore;
  sink: CostEventSink;
  log: ToolLogger;
  /**
   * Live-run admission (#680): rate limits, concurrency, daily budget.
   * Called once per fresh live execution (never for replays), with the
   * run's worst-case cost. A granted lease is released after the call with
   * the recorded estimate, or null when the cost is unknown.
   */
  admit?: (slug: string, worstCaseMicros: bigint) => Promise<Admission> | Admission;
  /** Aborted when the client disconnects. */
  signal?: AbortSignal;
  now?: () => number;
  newRunId?: () => string;
  /** Override for tests; defaults to process.env.NODE_ENV. */
  nodeEnv?: string;
  /** Override for tests; defaults to the validated catalogue. */
  resolveTool?: (slug: string) => ToolDefinition | undefined;
}

export type Admission =
  | { ok: true; release(recordedMicros: bigint | null): void }
  | { ok: false; code: "rate_limited" | "quota_exceeded"; retryAfterSeconds?: number };

export interface ExecuteResult {
  status: number;
  envelope: ToolRunEnvelope;
}

const RequestSchema = z.object({
  input: z.unknown(),
  idempotencyKey: z.string().regex(/^[A-Za-z0-9_-]{16,128}$/),
  mode: z.enum(["example", "live"]),
});

export async function executeTool(
  slug: string,
  body: unknown,
  adapters: Partial<Record<string, ToolAdapter<unknown, unknown>>>,
  deps: ExecuteDeps,
): Promise<ExecuteResult> {
  const now = deps.now ?? Date.now;
  const started = now();
  const tool = deps.resolveTool ? deps.resolveTool(slug) : getTool(slug, { nodeEnv: deps.nodeEnv ?? process.env.NODE_ENV });
  const adapter = tool ? adapters[tool.slug] : undefined;

  const request = RequestSchema.safeParse(body);
  const requestMode = request.success ? request.data.mode : "live";
  const baseLog = {
    event: "tool_run" as const,
    slug: tool?.slug ?? "unknown",
    toolVersion: adapter?.version ?? "unknown",
    requestMode,
  };
  const finish = (
    envelope: ToolRunEnvelope,
    extra: { replayed?: boolean; costRecorded?: boolean; fallbackUsed?: boolean } = {},
  ): ExecuteResult => {
    deps.log({
      ...baseLog,
      servedMode: envelope.ok ? envelope.mode : "none",
      outcome: envelope.ok ? envelope.status : envelope.error.code,
      durationMs: now() - started,
      replayed: extra.replayed ?? false,
      model: envelope.ok ? envelope.model : null,
      fallbackUsed: extra.fallbackUsed ?? false,
      costRecorded: extra.costRecorded ?? false,
    });
    return { status: envelope.ok ? 200 : TOOL_ERROR_STATUS[envelope.error.code], envelope };
  };
  const fail = (code: ToolErrorCode, extra?: Parameters<typeof toolError>[1]) => finish(toolError(code, extra));

  if (!tool || !adapter) return fail("tool_not_found");
  if (!request.success) return fail("invalid_request");
  const { mode, idempotencyKey } = request.data;

  // 1. Size before parsing, so an oversized body never reaches the schema.
  const inputBytes = Buffer.byteLength(JSON.stringify(request.data.input ?? null), "utf8");
  if (inputBytes > adapter.limits.maxInputBytes) return fail("input_too_large");
  const parsed = adapter.inputSchema.safeParse(request.data.input);
  if (!parsed.success) {
    return fail("invalid_input", { issues: parsed.error.issues.slice(0, 5).map((i) => i.message) });
  }
  const input = parsed.data;

  const fixtureEnvelope = (fixtureInput: unknown = input): ToolRunSuccess => {
    const output = adapter.outputSchema.parse(adapter.fixture(fixtureInput));
    return success(adapter, { mode: "fixture", output, model: null, promptVersion: null, durationMs: now() - started, costEventRef: null });
  };

  // 2. Examples: only the catalogue's own example, always from the fixture.
  if (mode === "example") {
    const exampleParsed = adapter.inputSchema.safeParse(adapter.exampleInput(tool.example.input));
    // Line endings are normalized so a CRLF client still matches the example.
    const sameAsExample =
      exampleParsed.success &&
      JSON.stringify(exampleParsed.data).replace(/\\r\\n/g, "\\n") === JSON.stringify(input).replace(/\\r\\n/g, "\\n");
    if (!sameAsExample) {
      return fail("invalid_request");
    }
    return finish(fixtureEnvelope(exampleParsed.data));
  }

  // 3. Live request gates — all before any spend.
  const { config } = deps;
  if (tool.lifecycle === "paused" || config.disabledTools.has(tool.slug)) return fail("tool_paused");
  if (config.mode === "fixture") return finish(fixtureEnvelope());
  if (!config.liveEnabled || !config.provider || !adapter.live || !tool.liveGeneration) {
    if (config.notes.length) deps.log({ event: "tool_config", slug: tool.slug, notes: config.notes });
    return fail("provider_disabled");
  }
  // 4. Idempotent live execution.
  const live = adapter.live;
  const providerConfig = config.provider;
  let costRecorded = false;
  let fallbackUsed = false;
  const outcome = await deps.store.run(`${tool.slug}:${idempotencyKey}`, hashInput(slug, input), async () => {
    const prompt = live.buildPrompt(input);
    const promptBytes = Buffer.byteLength(prompt.system + prompt.user, "utf8");
    const ceiling = worstCaseCostMicros(providerConfig.name, providerConfig.model, promptBytes, adapter.limits.maxOutputTokens);
    if (!ceiling || ceiling.micros > adapter.limits.maxEstimatedCostMicros) {
      deps.log({
        event: "tool_config",
        slug: tool.slug,
        notes: [ceiling ? "worst-case estimate exceeds maxEstimatedCostMicros" : `model ${providerConfig.model} is unpriced`],
      });
      return toolError("provider_disabled");
    }

    let admission: Admission | null;
    try {
      admission = deps.admit ? await deps.admit(tool.slug, ceiling.micros) : null;
    } catch {
      // A broken limiter fails closed: no admission, no spend.
      return toolError("rate_limited");
    }
    if (admission && !admission.ok) return toolError(admission.code, { retryAfterSeconds: admission.retryAfterSeconds });
    let recordedMicros: bigint | null = null;

    const callProvider = async (): Promise<ToolRunEnvelope> => {
      const runId = (deps.newRunId ?? randomUUID)();
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort("timeout"), adapter.limits.timeoutMs);
      const onClientAbort = () => controller.abort("client");
      deps.signal?.addEventListener("abort", onClientAbort, { once: true });
      const callStarted = now();
      const attempt = (result: LiveCompletionResult | null, outcomeKind: LiveAttempt["outcome"]): LiveAttempt => ({
        runId,
        slug: tool.slug,
        toolVersion: adapter.version,
        promptVersion: live.promptVersion,
        provider: providerConfig.name,
        requestModel: providerConfig.model,
        responseModel: result?.responseModel ?? null,
        providerRequestId: result?.providerRequestId ?? null,
        usage: result?.usage ?? null,
        outcome: outcomeKind,
        latencyMs: now() - callStarted,
        occurredAt: new Date(callStarted),
        fallbackUsed: result?.fallbackUsed ?? false,
      });
      const record = async (a: LiveAttempt): Promise<string | null> => {
        try {
          const event = buildCostEvent(a);
          if (event.estimatedCostMicros !== null) recordedMicros = (recordedMicros ?? BigInt(0)) + BigInt(event.estimatedCostMicros);
          const ref = await deps.sink.record(event);
          costRecorded = true;
          return ref;
        } catch {
          deps.log({ event: "tool_config", slug: tool.slug, notes: ["cost event write failed"] });
          return null;
        }
      };

      let result: LiveCompletionResult;
      try {
        result = await deps.createProvider(providerConfig, adapter.limits.timeoutMs).complete({
          model: providerConfig.model,
          system: prompt.system,
          user: prompt.user,
          outputJsonSchema: live.outputJsonSchema,
          maxOutputTokens: adapter.limits.maxOutputTokens,
          effort: live.effort ?? "medium",
          signal: controller.signal,
        });
      } catch (error) {
        const kind = error instanceof ProviderError ? error.kind : "unavailable";
        const timedOut = kind === "timeout" || controller.signal.reason === "timeout";
        // Billing is unknown when the request may have reached the provider
        // before we gave up: record it so reconciliation can account for it.
        if (timedOut || kind === "cancelled") await record(attempt(null, "cancelled"));
        if (timedOut) return toolError("timeout");
        if (kind === "rate_limited") {
          return toolError("provider_error", { retryAfterSeconds: error instanceof ProviderError ? error.retryAfterSeconds : undefined });
        }
        if (kind === "unavailable") return toolError("provider_error");
        // auth / bad_request / cancelled: configuration or caller problems — final.
        if (kind === "auth" || kind === "bad_request") {
          deps.log({ event: "tool_config", slug: tool.slug, notes: [`provider rejected request: ${kind}`] });
        }
        return toolError("internal");
      } finally {
        clearTimeout(timer);
        deps.signal?.removeEventListener("abort", onClientAbort);
      }
      fallbackUsed = result.fallbackUsed;

      // 5. Validate after the call. Billed usage is recorded either way.
      if (result.stop === "refusal") {
        await record(attempt(result, "failed"));
        return toolError("declined");
      }
      const parsed = result.stop === "complete" ? parseOutput(result.text, input, adapter) : null;
      if (parsed === null) {
        await record(attempt(result, "failed"));
        return toolError("invalid_output");
      }
      const degraded = parsed.dropped.length > 0;
      const costEventRef = await record(attempt(result, degraded ? "degraded" : "succeeded"));
      return success(adapter, {
        mode: "live",
        output: parsed.output,
        model: result.responseModel,
        promptVersion: live.promptVersion,
        durationMs: now() - started,
        costEventRef,
        warnings: parsed.dropped,
      });
    };
    try {
      return await callProvider();
    } finally {
      if (admission) admission.release(recordedMicros);
    }
  });

  if (outcome.kind === "conflict") return fail("idempotency_conflict");
  return finish(outcome.envelope, { replayed: outcome.kind === "replayed", costRecorded, fallbackUsed });
}

function parseOutput<TOutput>(
  text: string,
  input: unknown,
  adapter: ToolAdapter<unknown, TOutput>,
): { output: TOutput; dropped: string[] } | null {
  if (!text || Buffer.byteLength(text, "utf8") > adapter.limits.maxOutputBytes) return null;
  let json: unknown;
  try {
    json = JSON.parse(text);
  } catch {
    return null;
  }
  let candidate: unknown = json;
  let dropped: string[] = [];
  if (adapter.live?.toOutput) {
    const shaped = adapter.live.toOutput(input, json);
    if (!shaped) return null;
    candidate = shaped.output;
    dropped = shaped.dropped;
  }
  const parsed = adapter.outputSchema.safeParse(candidate);
  return parsed.success ? { output: parsed.data, dropped } : null;
}

function success(
  adapter: ToolAdapter<unknown, unknown>,
  fields: Pick<ToolRunSuccess, "mode" | "output" | "model" | "promptVersion" | "costEventRef"> & {
    durationMs: number;
    warnings?: string[];
  },
): ToolRunSuccess {
  return {
    ok: true,
    envelopeVersion: TOOL_ENVELOPE_VERSION,
    status: fields.warnings?.length ? "degraded" : "succeeded",
    tool: { slug: adapter.slug, version: adapter.version, schemaVersion: adapter.schemaVersion },
    mode: fields.mode,
    output: fields.output,
    warnings: fields.warnings ?? [],
    model: fields.model,
    promptVersion: fields.promptVersion,
    timing: { durationMs: fields.durationMs },
    costEventRef: fields.costEventRef,
  };
}
