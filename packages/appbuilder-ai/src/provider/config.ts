import { z } from "zod";

/**
 * Server-only AI provider configuration, validated lazily (never at module
 * import time, so `next build`'s page-data collection and any test that
 * never calls a provider never needs these vars set — mirrors the
 * lazy-validation convention used by apps/vionto's REDIS_URL/encryption-key
 * readers). `loadAiProviderConfig()` must only ever be called from
 * server-only code (the worker process, or a route/server-action that
 * enqueues a job) — never from a client component or a shared isomorphic
 * module, so these values can never reach a client bundle.
 *
 * AppBuilder-specific `APPBUILDER_AI_*` vars take precedence; unset ones
 * fall back to the platform's already-reserved `OPENAI_*` vars
 * (.env.production's "AI providers (reserved)" section) so a single shared
 * key can be used without duplicating it, while still allowing AppBuilder
 * to run a different model/budget than any other app.
 */
/**
 * #64 — raised from 30s.
 *
 * 30 seconds was too short for this platform's flagship operation. Producing
 * a whole application specification through structured output regularly takes
 * longer than that, so a correctly configured install failed by default: the
 * client aborted mid-response, three job attempts in a row hit the same wall,
 * and the user was told the provider was unavailable when it had been
 * answering the entire time.
 *
 * 120s is chosen to clear the observed generation duration with headroom
 * while still bounding a hung request. It is not "no limit": a request that
 * genuinely goes nowhere still fails, just with `provider_timeout` now, which
 * says what actually happened. Tune per deployment with
 * APPBUILDER_AI_REQUEST_TIMEOUT_MS.
 */
export const DEFAULT_REQUEST_TIMEOUT_MS = 120_000;

const EnvSchema = z.object({
  APPBUILDER_AI_PROVIDER: z.enum(["openai", "fake"]).default("fake"),
  APPBUILDER_AI_OPENAI_API_KEY: z.string().min(1).optional(),
  OPENAI_API_KEY: z.string().min(1).optional(),
  APPBUILDER_AI_OPENAI_MODEL: z.string().min(1).optional(),
  OPENAI_MODEL: z.string().min(1).optional(),
  APPBUILDER_AI_REQUEST_TIMEOUT_MS: z.coerce
    .number()
    .int()
    .positive()
    .default(DEFAULT_REQUEST_TIMEOUT_MS),
  APPBUILDER_AI_MAX_RETRIES: z.coerce.number().int().min(0).max(10).default(2),
  APPBUILDER_AI_MAX_TOOL_CALLS: z.coerce.number().int().positive().max(100).default(40),
  APPBUILDER_AI_MAX_ITERATIONS: z.coerce.number().int().positive().max(10).default(4),
  APPBUILDER_AI_CONCURRENCY: z.coerce.number().int().positive().max(20).default(2),
  APPBUILDER_AI_MAX_OUTPUT_TOKENS: z.coerce.number().int().positive().optional(),
  OPENAI_MAX_OUTPUT_TOKENS: z.coerce.number().int().positive().optional(),
});

export interface AiProviderConfig {
  provider: "openai" | "fake";
  openaiApiKey?: string;
  openaiModel: string;
  requestTimeoutMs: number;
  maxRetries: number;
  maxToolCalls: number;
  maxIterations: number;
  concurrency: number;
  maxOutputTokens?: number;
}

export class AiProviderConfigError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "AiProviderConfigError";
  }
}

/**
 * Loads and validates provider configuration from `process.env`. Throws
 * `AiProviderConfigError` (never a raw Zod error carrying env values) when
 * `provider === "openai"` but no API key is available anywhere — this must
 * surface as the pipeline's `provider_configuration_error` classification,
 * not a generic 500.
 */
export function loadAiProviderConfig(env: NodeJS.ProcessEnv = process.env): AiProviderConfig {
  const parsed = EnvSchema.safeParse(env);
  if (!parsed.success) {
    throw new AiProviderConfigError(
      `Invalid AppBuilder AI provider configuration: ${parsed.error.issues.map((i) => i.path.join(".")).join(", ")}`,
    );
  }
  const e = parsed.data;

  const openaiApiKey = e.APPBUILDER_AI_OPENAI_API_KEY ?? e.OPENAI_API_KEY;
  if (e.APPBUILDER_AI_PROVIDER === "openai" && !openaiApiKey) {
    throw new AiProviderConfigError(
      "APPBUILDER_AI_PROVIDER=openai requires APPBUILDER_AI_OPENAI_API_KEY or OPENAI_API_KEY to be set.",
    );
  }

  return {
    provider: e.APPBUILDER_AI_PROVIDER,
    openaiApiKey,
    openaiModel: e.APPBUILDER_AI_OPENAI_MODEL ?? e.OPENAI_MODEL ?? "gpt-4o-mini",
    requestTimeoutMs: e.APPBUILDER_AI_REQUEST_TIMEOUT_MS,
    maxRetries: e.APPBUILDER_AI_MAX_RETRIES,
    maxToolCalls: e.APPBUILDER_AI_MAX_TOOL_CALLS,
    maxIterations: e.APPBUILDER_AI_MAX_ITERATIONS,
    concurrency: e.APPBUILDER_AI_CONCURRENCY,
    maxOutputTokens: e.APPBUILDER_AI_MAX_OUTPUT_TOKENS ?? e.OPENAI_MAX_OUTPUT_TOKENS,
  };
}

/**
 * The configured request timeout, in whole seconds, for use in a user-facing
 * failure message (#64).
 *
 * Read from the environment at call time rather than threaded down from the
 * provider instance: a `provider_timeout` failure is classified inside the
 * pipelines' pure error mappers (`classifyGenerationError` and friends),
 * which deliberately take only the thrown error and have no provider handle
 * to ask. Reading it here keeps those mappers pure while still letting the
 * message name the real number instead of a hardcoded one that would drift
 * the moment an operator tunes it.
 *
 * Falls back to the schema default if the env value is unparseable, so a
 * malformed override degrades the message rather than throwing while we are
 * already handling a failure.
 */
export function requestTimeoutSeconds(env: NodeJS.ProcessEnv = process.env): number {
  const raw = Number.parseInt(env.APPBUILDER_AI_REQUEST_TIMEOUT_MS ?? "", 10);
  const ms = Number.isFinite(raw) && raw > 0 ? raw : DEFAULT_REQUEST_TIMEOUT_MS;
  return Math.round(ms / 1000);
}

/** Redacted view safe to log/return in diagnostics — never includes the API key. */
export function safeConfigSummary(config: AiProviderConfig): Record<string, unknown> {
  return {
    provider: config.provider,
    openaiModel: config.openaiModel,
    openaiApiKeyConfigured: Boolean(config.openaiApiKey),
    requestTimeoutMs: config.requestTimeoutMs,
    maxRetries: config.maxRetries,
    maxToolCalls: config.maxToolCalls,
    maxIterations: config.maxIterations,
    concurrency: config.concurrency,
    maxOutputTokens: config.maxOutputTokens,
  };
}
