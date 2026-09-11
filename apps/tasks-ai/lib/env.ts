import { z } from "zod";

/**
 * TasksAI environment contract.
 *
 * Rules this module enforces:
 *
 * 1. **Fail loudly, early.** A missing `TASKSAI_DATABASE_URL` in staging or
 *    production stops the process rather than surfacing later as a
 *    connection error inside a request handler.
 * 2. **No shared-database fallback.** TasksAI has its own PostgreSQL
 *    instance (docs/adr/0001-dedicated-database.md). Falling back to the
 *    platform `DATABASE_URL` would point the tenant work graph at the
 *    identity database — exactly the boundary this app exists to keep. The
 *    contract also refuses a `TASKSAI_DATABASE_URL` that is byte-identical
 *    to `DATABASE_URL`.
 * 3. **Never echo values.** Errors name the variable, never its contents.
 *
 * Server-only. The browser sees only the `NEXT_PUBLIC_*` URLs Next.js
 * inlines at build time.
 */

const LOCAL_DATABASE_URL = "postgres://tasksai:tasksai_dev@127.0.0.1:55438/tasksai";
const LOCAL_APP_URL = "http://localhost:3013";
const LOCAL_HUB_URL = "http://localhost:3001";
const LOCAL_TESTORA_URL = "http://localhost:3005";
const LOCAL_REDIS_URL = "redis://localhost:6390";

// Read as literal member expressions so Next.js inlines them at build time.
// A dynamic lookup would resolve against the server runtime env, where a
// build-arg-only variable does not exist. (This mirrors the JobMatch fix.)
const BUILD_TIME_APP_URL = process.env.NEXT_PUBLIC_TASKSAI_URL;
const BUILD_TIME_HUB_URL = process.env.NEXT_PUBLIC_HUB_URL;

export type TasksAiEnvironment = "development" | "test" | "staging" | "production";

export interface TasksAiEnv {
  environment: TasksAiEnvironment;
  databaseUrl: string;
  redisUrl: string;
  appUrl: string;
  hubUrl: string;
  /** Service token for reading Testora artifact bundles (issue #264); unset by default. */
  testoraBundleReadToken?: string;
  /** Testora's own server URL, for the provision-tests action (issue #266). */
  testoraAppUrl: string;
  /** Shared secret Testora's POST /api/provisions expects (issue #266). */
  testoraProvisionToken?: string;
  /** True when secrets must be supplied explicitly rather than defaulted. */
  requiresExplicitSecrets: boolean;
  /** Non-fatal misconfigurations, surfaced by /api/health. Names only. */
  warnings: string[];
}

export interface BuildTimeUrls {
  appUrl?: string;
  hubUrl?: string;
}

const rawSchema = z.object({
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
  /** "staging" on the staging deploy; production leaves it unset. */
  TASKSAI_ENVIRONMENT: z.enum(["staging", "production"]).optional(),
  TASKSAI_DATABASE_URL: z.string().min(1).optional(),
  TASKSAI_REDIS_URL: z.string().min(1).optional(),
  DATABASE_URL: z.string().min(1).optional(),
  NEXT_PUBLIC_TASKSAI_URL: z.string().url().optional(),
  NEXT_PUBLIC_HUB_URL: z.string().url().optional(),
  /** Service token to read a Testora run-artifact bundle machine-to-machine
   *  (issue #264). Optional — without it, only bundles delivered inline on
   *  the webhook are diagnosed. */
  TESTORA_BUNDLE_READ_TOKEN: z.string().min(1).optional(),
  /** Testora's own server URL (issue #266). Defaults to the local dev port. */
  TESTORA_APP_URL: z.string().url().optional(),
  /** Shared secret for POST {TESTORA_APP_URL}/api/provisions (issue #266). */
  TESTORA_PROVISION_TOKEN: z.string().min(1).optional(),
});

export class EnvValidationError extends Error {
  readonly variables: string[];
  constructor(variables: string[], detail?: string) {
    super(
      `TasksAI environment is invalid: ${variables.join(", ")}. ` +
        (detail ? `${detail} ` : "") +
        "Values are intentionally not shown. See apps/tasks-ai/README.md#environment.",
    );
    this.name = "EnvValidationError";
    this.variables = variables;
  }
}

/** Resolve and validate the environment. Pure over its input. */
export function resolveEnv(
  source: Record<string, string | undefined> = process.env,
  buildTime: BuildTimeUrls = { appUrl: BUILD_TIME_APP_URL, hubUrl: BUILD_TIME_HUB_URL },
): TasksAiEnv {
  const parsed = rawSchema.safeParse(source);
  if (!parsed.success) {
    const variables = parsed.error.issues.map((issue) => String(issue.path[0]));
    throw new EnvValidationError([...new Set(variables)]);
  }

  const raw = parsed.data;
  const environment: TasksAiEnvironment =
    raw.TASKSAI_ENVIRONMENT ?? (raw.NODE_ENV === "production" ? "production" : raw.NODE_ENV);
  const requiresExplicitSecrets = environment === "staging" || environment === "production";

  if (requiresExplicitSecrets && !raw.TASKSAI_DATABASE_URL) {
    throw new EnvValidationError(["TASKSAI_DATABASE_URL"]);
  }

  // The one boundary worth refusing to start over: TasksAI's database must
  // not be the platform database.
  if (
    raw.TASKSAI_DATABASE_URL &&
    raw.DATABASE_URL &&
    normalize(raw.TASKSAI_DATABASE_URL) === normalize(raw.DATABASE_URL)
  ) {
    throw new EnvValidationError(
      ["TASKSAI_DATABASE_URL"],
      "It must not equal the platform DATABASE_URL.",
    );
  }

  const appUrl = raw.NEXT_PUBLIC_TASKSAI_URL ?? buildTime.appUrl ?? LOCAL_APP_URL;
  const hubUrl = raw.NEXT_PUBLIC_HUB_URL ?? buildTime.hubUrl ?? LOCAL_HUB_URL;

  const warnings: string[] = [];
  if (requiresExplicitSecrets) {
    if (isLoopback(appUrl)) warnings.push("NEXT_PUBLIC_TASKSAI_URL is unset or points at localhost");
    if (isLoopback(hubUrl)) warnings.push("NEXT_PUBLIC_HUB_URL is unset or points at localhost");
    if (!raw.TASKSAI_REDIS_URL) warnings.push("TASKSAI_REDIS_URL is unset; worker will use the local default");
  }

  return {
    environment,
    databaseUrl: raw.TASKSAI_DATABASE_URL ?? LOCAL_DATABASE_URL,
    redisUrl: raw.TASKSAI_REDIS_URL ?? LOCAL_REDIS_URL,
    appUrl,
    hubUrl,
    testoraBundleReadToken: raw.TESTORA_BUNDLE_READ_TOKEN,
    testoraAppUrl: raw.TESTORA_APP_URL ?? LOCAL_TESTORA_URL,
    testoraProvisionToken: raw.TESTORA_PROVISION_TOKEN,
    requiresExplicitSecrets,
    warnings,
  };
}

function normalize(url: string): string {
  return url.trim().replace(/\/+$/, "");
}

function isLoopback(url: string): boolean {
  try {
    const { hostname } = new URL(url);
    return hostname === "localhost" || hostname === "127.0.0.1" || hostname === "::1";
  } catch {
    return true;
  }
}

let cached: TasksAiEnv | undefined;

export function getEnv(): TasksAiEnv {
  cached ??= resolveEnv();
  return cached;
}

export function resetEnvCache(): void {
  cached = undefined;
}
