import { z } from "zod";
import { log } from "./observability/logger";

/**
 * JobMatch environment contract (JM-013).
 *
 * Three rules this module exists to enforce:
 *
 * 1. **Fail loudly, early.** A missing `JOBMATCH_DATABASE_URL` in staging or
 *    production must stop the process, not surface later as a connection
 *    error from inside a request handler.
 * 2. **No shared-database fallback.** JobMatch has its own PostgreSQL
 *    instance. Silently falling back to `DATABASE_URL` would point CV and
 *    ingestion tables at the platform identity database — exactly the
 *    boundary this app is built to keep.
 * 3. **Never echo values.** Errors name the variable, never its contents,
 *    so a boot failure cannot leak a password into a log aggregator.
 *
 * Client bundles get nothing from here: this module is server-only, and the
 * only variables the browser sees are the `NEXT_PUBLIC_*` cross-app URLs
 * that Next.js inlines at build time.
 *
 * --- AI provider gate (M5 / JM-005, issue #255) ---------------------------
 *
 * `JOBMATCH_AI_PROVIDER` / `JOBMATCH_AI_EVAL_PROVIDER` select which model
 * backend the (not-yet-built) classification and eval layers talk to. Both
 * default to `fixture` — a deterministic, network-free provider, the same
 * shape as `APPBUILDER_AI_PROVIDER=fake` in `.env.example`.
 *
 * The gate mirrors `apps/tasks-ai/lib/billing/gate.ts`'s inert-flag pattern
 * (`TASKSAI_COMMERCIAL_LICENSE_SIGNED=true` before paid plans open): a
 * feature stays off in every deployed environment until a named env var is
 * flipped, and the code never argues with that decision, it just checks the
 * flag. Here the flag is `JOBMATCH_AI_CLASSIFICATION_SIGNED_OFF` (JM-005),
 * and unlike the billing gate it is combined with "a key is present" — a
 * signed-off flag with no key would still be inert, but failing loud on
 * *either* missing piece surfaces a half-configured deploy at boot instead
 * of at first use.
 *
 * The gate only applies where `requiresExplicitSecrets` is true (staging /
 * production, using the same `JOBMATCH_ENVIRONMENT` resolution as the
 * database check above). Locally and in tests/CI, `fixture` is always free,
 * and — deliberately, so engineers can dev against a real provider without
 * touching deploy config — flipping to `openai`/`anthropic` locally is not
 * gated either. Local `.env` is not a deployed surface: nothing there ships
 * unsigned-off spend to production, and the sign-off's entire purpose is to
 * stop a deployed environment from spending money before JM-005 is closed.
 */

const LOCAL_DATABASE_URL = "postgresql://jobmatch:jobmatch_dev@localhost:55437/jobmatch";
const LOCAL_APP_URL = "http://localhost:3012";
const LOCAL_HUB_URL = "http://localhost:3001";

/**
 * `NEXT_PUBLIC_*` values, read as literal member expressions.
 *
 * This looks redundant next to the schema below and is not. Next.js inlines
 * `process.env.NEXT_PUBLIC_FOO` at build time by substituting the literal
 * expression; a dynamic lookup like `source["NEXT_PUBLIC_FOO"]` is left
 * alone, so it resolves against the *server's* environment at runtime —
 * where a build-arg-only variable does not exist.
 *
 * Reading them dynamically is what took production down: the compose stack
 * passes `NEXT_PUBLIC_JOBMATCH_URL` as a build arg, the built page had the
 * right value baked in, and the runtime check still saw `undefined` and
 * threw on every request that touched the workspace.
 */
const BUILD_TIME_APP_URL = process.env.NEXT_PUBLIC_JOBMATCH_URL;
const BUILD_TIME_HUB_URL = process.env.NEXT_PUBLIC_HUB_URL;

export type JobMatchEnvironment = "development" | "test" | "staging" | "production";

export type JobMatchAiProvider = "fixture" | "openai" | "anthropic";

export interface JobMatchEnv {
  environment: JobMatchEnvironment;
  databaseUrl: string;
  appUrl: string;
  hubUrl: string;
  /** True when secrets must be supplied explicitly rather than defaulted. */
  requiresExplicitSecrets: boolean;
  /**
   * Misconfigurations worth shouting about that are not worth refusing to
   * serve over. Surfaced by `/api/health` so they are visible without
   * turning a cosmetic mistake into an outage.
   */
  warnings: string[];
  /** Model backend for classification (JM-005 gated). Default `fixture`. */
  aiProvider: JobMatchAiProvider;
  /** Model backend for the eval runner. Default `fixture`. */
  aiEvalProvider: JobMatchAiProvider;
  /** JM-005 sign-off flag. Must be true before a real provider can be selected in a deployed environment. */
  aiClassificationSignedOff: boolean;
  /** JM-047 monthly spend ceiling in USD. `0` freezes AI spend entirely. */
  aiMonthlyBudgetUsd: number;
}

/** Build-time values, injectable so the contract stays testable. */
export interface BuildTimeUrls {
  appUrl?: string;
  hubUrl?: string;
}

const AI_PROVIDER_ENUM = z.enum(["fixture", "openai", "anthropic"]);
const DEFAULT_AI_MONTHLY_BUDGET_USD = 20;

const rawSchema = z.object({
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
  /** Set to "staging" on the staging deployment; production leaves it unset. */
  JOBMATCH_ENVIRONMENT: z.enum(["staging", "production"]).optional(),
  JOBMATCH_DATABASE_URL: z.string().min(1).optional(),
  NEXT_PUBLIC_JOBMATCH_URL: z.string().url().optional(),
  NEXT_PUBLIC_HUB_URL: z.string().url().optional(),
  /** Classification model backend (M5 / JM-005). Never `openai`/`anthropic`
   *  in a deployed environment unless the gate below is satisfied. */
  JOBMATCH_AI_PROVIDER: AI_PROVIDER_ENUM.default("fixture"),
  /** Eval runner's model backend; same gate as JOBMATCH_AI_PROVIDER. */
  JOBMATCH_AI_EVAL_PROVIDER: AI_PROVIDER_ENUM.default("fixture"),
  /** JM-005 sign-off. Only "true" counts; anything else (including unset) is false. */
  JOBMATCH_AI_CLASSIFICATION_SIGNED_OFF: z
    .string()
    .optional()
    .transform((value) => value === "true"),
  /** JM-047 monthly spend ceiling in USD; "0" freezes spend. */
  JOBMATCH_AI_MONTHLY_BUDGET_USD: z
    .string()
    .optional()
    .transform((value) => (value === undefined || value === "" ? undefined : Number(value)))
    .refine((value) => value === undefined || (Number.isFinite(value) && value >= 0), {
      message: "must be a non-negative number",
    }),
  /** Shared platform key (see .env.example). Unused unless a provider selects it. Never logged. */
  OPENAI_API_KEY: z.string().min(1).optional(),
  /** Shared platform key (see .env.example). Unused unless a provider selects it. Never logged. */
  ANTHROPIC_API_KEY: z.string().min(1).optional(),
});

export class EnvValidationError extends Error {
  readonly variables: string[];
  constructor(variables: string[]) {
    super(
      `JobMatch is missing required environment variables: ${variables.join(", ")}. ` +
        "Values are intentionally not shown. See apps/jobmatch/README.md#environment.",
    );
    this.name = "EnvValidationError";
    this.variables = variables;
  }
}

/**
 * Resolve and validate the environment. Pure over its input so the contract
 * is testable without mutating `process.env`.
 */
export function resolveEnv(
  source: Record<string, string | undefined> = process.env,
  buildTime: BuildTimeUrls = { appUrl: BUILD_TIME_APP_URL, hubUrl: BUILD_TIME_HUB_URL },
): JobMatchEnv {
  const parsed = rawSchema.safeParse(source);
  if (!parsed.success) {
    const variables = parsed.error.issues.map((issue) => String(issue.path[0]));
    throw new EnvValidationError([...new Set(variables)]);
  }

  const raw = parsed.data;
  const environment: JobMatchEnvironment =
    raw.JOBMATCH_ENVIRONMENT ?? (raw.NODE_ENV === "production" ? "production" : raw.NODE_ENV);
  const requiresExplicitSecrets = environment === "staging" || environment === "production";

  // The database URL is the one thing worth refusing to start over: pointing
  // CV and ingestion tables at the wrong database is unrecoverable in a way
  // that a wrong link is not.
  if (requiresExplicitSecrets && !raw.JOBMATCH_DATABASE_URL) {
    throw new EnvValidationError(["JOBMATCH_DATABASE_URL"]);
  }

  // JM-005 gate: a non-fixture provider may not be selected on a deployed
  // environment until sign-off is recorded AND the matching key is present.
  // Mirrors apps/tasks-ai/lib/billing/gate.ts's inert-flag pattern — the
  // flag decides, the code just enforces it. Local/test/dev is intentionally
  // ungated (see the module doc comment above).
  if (requiresExplicitSecrets) {
    for (const provider of [raw.JOBMATCH_AI_PROVIDER, raw.JOBMATCH_AI_EVAL_PROVIDER]) {
      if (provider === "fixture") continue;
      const key = provider === "openai" ? raw.OPENAI_API_KEY : raw.ANTHROPIC_API_KEY;
      if (!raw.JOBMATCH_AI_CLASSIFICATION_SIGNED_OFF || !key) {
        throw new EnvValidationError(["JOBMATCH_AI_CLASSIFICATION_SIGNED_OFF"]);
      }
    }
  }

  // Runtime value first (a real env var overrides), then the value Next
  // inlined at build, then the local default.
  const appUrl = raw.NEXT_PUBLIC_JOBMATCH_URL ?? buildTime.appUrl ?? LOCAL_APP_URL;
  const hubUrl = raw.NEXT_PUBLIC_HUB_URL ?? buildTime.hubUrl ?? LOCAL_HUB_URL;

  // A loopback URL in a deployed environment means a broken sign-in link or a
  // wrong canonical URL. Both are worth shouting about; neither is worth
  // refusing to serve the whole app over, which is precisely the mistake an
  // earlier version of this file made.
  const warnings: string[] = [];
  if (requiresExplicitSecrets) {
    if (isLoopback(appUrl)) warnings.push("NEXT_PUBLIC_JOBMATCH_URL is unset or points at localhost");
    if (isLoopback(hubUrl)) warnings.push("NEXT_PUBLIC_HUB_URL is unset or points at localhost");
  }

  return {
    environment,
    databaseUrl: raw.JOBMATCH_DATABASE_URL ?? LOCAL_DATABASE_URL,
    appUrl,
    hubUrl,
    requiresExplicitSecrets,
    warnings,
    aiProvider: raw.JOBMATCH_AI_PROVIDER,
    aiEvalProvider: raw.JOBMATCH_AI_EVAL_PROVIDER,
    aiClassificationSignedOff: raw.JOBMATCH_AI_CLASSIFICATION_SIGNED_OFF ?? false,
    aiMonthlyBudgetUsd: raw.JOBMATCH_AI_MONTHLY_BUDGET_USD ?? DEFAULT_AI_MONTHLY_BUDGET_USD,
  };
}

function isLoopback(url: string): boolean {
  try {
    const { hostname } = new URL(url);
    return hostname === "localhost" || hostname === "127.0.0.1" || hostname === "::1";
  } catch {
    return true;
  }
}

let cached: JobMatchEnv | undefined;

/** Memoized accessor for request handlers. */
export function getEnv(): JobMatchEnv {
  if (!cached) {
    cached = resolveEnv();
    // Boot-time visibility only: provider name and a boolean, never a key.
    // Fires once per process (Next.js server and the standalone worker each
    // get their own), the moment this module is first consulted.
    log.info("env.ai_provider", {
      provider: cached.aiProvider,
      evalProvider: cached.aiEvalProvider,
      classificationSignedOff: cached.aiClassificationSignedOff,
    });
  }
  return cached;
}

/** Test-only: drop the memoized value. */
export function resetEnvCache(): void {
  cached = undefined;
}
