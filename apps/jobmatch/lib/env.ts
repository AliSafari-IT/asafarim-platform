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

export type JobMatchEnvironment = "development" | "test" | "staging" | "production";

export interface JobMatchEnv {
  environment: JobMatchEnvironment;
  databaseUrl: string;
  appUrl: string;
  hubUrl: string;
  /** True when secrets must be supplied explicitly rather than defaulted. */
  requiresExplicitSecrets: boolean;
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
export function resolveEnv(source: Record<string, string | undefined> = process.env): JobMatchEnv {
  const parsed = rawSchema.safeParse(source);
  if (!parsed.success) {
    const variables = parsed.error.issues.map((issue) => String(issue.path[0]));
    throw new EnvValidationError([...new Set(variables)]);
  }

  const raw = parsed.data;
  const environment: JobMatchEnvironment =
    raw.JOBMATCH_ENVIRONMENT ?? (raw.NODE_ENV === "production" ? "production" : raw.NODE_ENV);
  const requiresExplicitSecrets = environment === "staging" || environment === "production";

  const missing: string[] = [];
  if (requiresExplicitSecrets) {
    if (!raw.JOBMATCH_DATABASE_URL) missing.push("JOBMATCH_DATABASE_URL");
    // Without this, proxy.ts would send deployed users to a loopback
    // sign-in page — a broken auth flow that only shows up in production.
    if (!raw.NEXT_PUBLIC_HUB_URL) missing.push("NEXT_PUBLIC_HUB_URL");
    if (!raw.NEXT_PUBLIC_JOBMATCH_URL) missing.push("NEXT_PUBLIC_JOBMATCH_URL");
  }
  if (missing.length > 0) throw new EnvValidationError(missing);

  return {
    environment,
    databaseUrl: raw.JOBMATCH_DATABASE_URL ?? LOCAL_DATABASE_URL,
    appUrl: raw.NEXT_PUBLIC_JOBMATCH_URL ?? "http://localhost:3012",
    hubUrl: raw.NEXT_PUBLIC_HUB_URL ?? "http://localhost:3001",
    requiresExplicitSecrets,
  };
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
