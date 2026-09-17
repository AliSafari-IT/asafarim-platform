import { z } from "zod";
import { log } from "./observability/logger";

/**
 * ResuMatch environment contract.
 *
 * Three rules this module exists to enforce:
 *
 * 1. **Fail loudly, early.** A missing `RESUMATCH_DATABASE_URL` in staging or
 *    production must stop the process, not surface later as a connection
 *    error from inside a request handler.
 * 2. **No shared-database fallback.** ResuMatch has its own PostgreSQL
 *    instance. Silently falling back to `DATABASE_URL` would point CV and
 *    tailoring tables at the platform identity database — exactly the
 *    boundary this app is built to keep.
 * 3. **Never echo values.** Errors name the variable, never its contents,
 *    so a boot failure cannot leak a password into a log aggregator.
 *
 * Client bundles get nothing from here: this module is server-only, and the
 * only variables the browser sees are the `NEXT_PUBLIC_*` cross-app URLs
 * that Next.js inlines at build time.
 *
 * --- AI provider gate (JM-005, issue #255) ---------------------------
 *
 * `RESUMATCH_AI_PROVIDER` selects which model backend the CV-tailoring
 * pipeline talks to. It defaults to `fixture` — a deterministic,
 * network-free provider, the same shape as `APPBUILDER_AI_PROVIDER=fake` in
 * `.env.example`.
 *
 * The gate mirrors `apps/tasks-ai/lib/billing/gate.ts`'s inert-flag pattern
 * (`TASKSAI_COMMERCIAL_LICENSE_SIGNED=true` before paid plans open): a
 * feature stays off in every deployed environment until a named env var is
 * flipped, and the code never argues with that decision, it just checks the
 * flag. Here the flag is `RESUMATCH_AI_CLASSIFICATION_SIGNED_OFF` (JM-005),
 * and unlike the billing gate it is combined with "a key is present" — a
 * signed-off flag with no key would still be inert, but failing loud on
 * *either* missing piece surfaces a half-configured deploy at boot instead
 * of at first use.
 *
 * The gate only applies where `requiresExplicitSecrets` is true (staging /
 * production, using the same `RESUMATCH_ENVIRONMENT` resolution as the
 * database check above). Locally and in tests/CI, `fixture` is always free,
 * and — deliberately, so engineers can dev against a real provider without
 * touching deploy config — flipping to `openai`/`anthropic` locally is not
 * gated either. Local `.env` is not a deployed surface: nothing there ships
 * unsigned-off spend to production, and the sign-off's entire purpose is to
 * stop a deployed environment from spending money before JM-005 is closed.
 */

const LOCAL_DATABASE_URL = "postgresql://resumatch:resumatch_dev@localhost:55437/resumatch";
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
 * passes `NEXT_PUBLIC_RESUMATCH_URL` as a build arg, the built page had the
 * right value baked in, and the runtime check still saw `undefined` and
 * threw on every request that touched the workspace.
 */
const BUILD_TIME_APP_URL = process.env.NEXT_PUBLIC_RESUMATCH_URL;
const BUILD_TIME_HUB_URL = process.env.NEXT_PUBLIC_HUB_URL;

export type ResuMatchEnvironment = "development" | "test" | "staging" | "production";

export type ResuMatchAiProvider = "fixture" | "openai" | "anthropic";

export interface ResuMatchEnv {
  environment: ResuMatchEnvironment;
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
  /** Model backend for CV tailoring (JM-005 gated). Default `fixture`. */
  aiProvider: ResuMatchAiProvider;
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
  RESUMATCH_ENVIRONMENT: z.enum(["staging", "production"]).optional(),
  RESUMATCH_DATABASE_URL: z.string().min(1).optional(),
  NEXT_PUBLIC_RESUMATCH_URL: z.string().url().optional(),
  NEXT_PUBLIC_HUB_URL: z.string().url().optional(),
  /** Tailoring model backend (JM-005). Never `openai`/`anthropic` in a
   *  deployed environment unless the gate below is satisfied. */
  RESUMATCH_AI_PROVIDER: AI_PROVIDER_ENUM.default("fixture"),
  /** JM-005 sign-off. Only "true" counts; anything else (including unset) is false. */
  RESUMATCH_AI_CLASSIFICATION_SIGNED_OFF: z
    .string()
    .optional()
    .transform((value) => value === "true"),
  /** JM-047 monthly spend ceiling in USD; "0" freezes spend. */
  RESUMATCH_AI_MONTHLY_BUDGET_USD: z
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
      `ResuMatch is missing required environment variables: ${variables.join(", ")}. ` +
        "Values are intentionally not shown. See apps/resumatch/README.md#environment.",
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
): ResuMatchEnv {
  const parsed = rawSchema.safeParse(source);
  if (!parsed.success) {
    const variables = parsed.error.issues.map((issue) => String(issue.path[0]));
    throw new EnvValidationError([...new Set(variables)]);
  }

  const raw = parsed.data;
  const environment: ResuMatchEnvironment =
    raw.RESUMATCH_ENVIRONMENT ?? (raw.NODE_ENV === "production" ? "production" : raw.NODE_ENV);
  const requiresExplicitSecrets = environment === "staging" || environment === "production";

  // The database URL is the one thing worth refusing to start over: pointing
  // CV and tailoring tables at the wrong database is unrecoverable in a way
  // that a wrong link is not.
  if (requiresExplicitSecrets && !raw.RESUMATCH_DATABASE_URL) {
    throw new EnvValidationError(["RESUMATCH_DATABASE_URL"]);
  }

  // JM-005 gate: a non-fixture provider may not be selected on a deployed
  // environment until sign-off is recorded AND the matching key is present.
  // Mirrors apps/tasks-ai/lib/billing/gate.ts's inert-flag pattern — the
  // flag decides, the code just enforces it. Local/test/dev is intentionally
  // ungated (see the module doc comment above).
  if (requiresExplicitSecrets && raw.RESUMATCH_AI_PROVIDER !== "fixture") {
    const key = raw.RESUMATCH_AI_PROVIDER === "openai" ? raw.OPENAI_API_KEY : raw.ANTHROPIC_API_KEY;
    if (!raw.RESUMATCH_AI_CLASSIFICATION_SIGNED_OFF || !key) {
      throw new EnvValidationError(["RESUMATCH_AI_CLASSIFICATION_SIGNED_OFF"]);
    }
  }

  // Runtime value first (a real env var overrides), then the value Next
  // inlined at build, then the local default.
  const appUrl = raw.NEXT_PUBLIC_RESUMATCH_URL ?? buildTime.appUrl ?? LOCAL_APP_URL;
  const hubUrl = raw.NEXT_PUBLIC_HUB_URL ?? buildTime.hubUrl ?? LOCAL_HUB_URL;

  // A loopback URL in a deployed environment means a broken sign-in link or a
  // wrong canonical URL. Both are worth shouting about; neither is worth
  // refusing to serve the whole app over, which is precisely the mistake an
  // earlier version of this file made.
  const warnings: string[] = [];
  if (requiresExplicitSecrets) {
    if (isLoopback(appUrl)) warnings.push("NEXT_PUBLIC_RESUMATCH_URL is unset or points at localhost");
    if (isLoopback(hubUrl)) warnings.push("NEXT_PUBLIC_HUB_URL is unset or points at localhost");
  }

  return {
    environment,
    databaseUrl: raw.RESUMATCH_DATABASE_URL ?? LOCAL_DATABASE_URL,
    appUrl,
    hubUrl,
    requiresExplicitSecrets,
    warnings,
    aiProvider: raw.RESUMATCH_AI_PROVIDER,
    aiClassificationSignedOff: raw.RESUMATCH_AI_CLASSIFICATION_SIGNED_OFF ?? false,
    aiMonthlyBudgetUsd: raw.RESUMATCH_AI_MONTHLY_BUDGET_USD ?? DEFAULT_AI_MONTHLY_BUDGET_USD,
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

let cached: ResuMatchEnv | undefined;

/** Memoized accessor for request handlers. */
export function getEnv(): ResuMatchEnv {
  if (!cached) {
    cached = resolveEnv();
    // Boot-time visibility only: provider name and a boolean, never a key.
    // Fires once per process (Next.js server and the standalone worker each
    // get their own), the moment this module is first consulted.
    log.info("env.ai_provider", {
      provider: cached.aiProvider,
      classificationSignedOff: cached.aiClassificationSignedOff,
    });
  }
  return cached;
}

/** Test-only: drop the memoized value. */
export function resetEnvCache(): void {
  cached = undefined;
}
