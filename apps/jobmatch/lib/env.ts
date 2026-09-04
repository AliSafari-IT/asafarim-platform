import { z } from "zod";

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
}

/** Build-time values, injectable so the contract stays testable. */
export interface BuildTimeUrls {
  appUrl?: string;
  hubUrl?: string;
}

const rawSchema = z.object({
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
  /** Set to "staging" on the staging deployment; production leaves it unset. */
  JOBMATCH_ENVIRONMENT: z.enum(["staging", "production"]).optional(),
  JOBMATCH_DATABASE_URL: z.string().min(1).optional(),
  NEXT_PUBLIC_JOBMATCH_URL: z.string().url().optional(),
  NEXT_PUBLIC_HUB_URL: z.string().url().optional(),
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
  cached ??= resolveEnv();
  return cached;
}

/** Test-only: drop the memoized value. */
export function resetEnvCache(): void {
  cached = undefined;
}
