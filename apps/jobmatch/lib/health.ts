import { getEnv } from "./env";
/**
 * Health payload for JobMatch.
 *
 * Pure over its dependencies (the database check is injected) so the shape
 * is unit-testable without booting Next.js or a real database, matching the
 * AppBuilder pattern in apps/appbuilder/lib/health.ts.
 */

export interface HealthPayload {
  ok: boolean;
  service: "jobmatch";
  version: string;
  checks: Record<string, boolean>;
  /**
   * Configuration problems that do not stop the app serving — a loopback
   * sign-in URL in production, say. Reported rather than thrown, so they are
   * visible to an operator without being an outage. Names only; never values.
   */
  warnings: string[];
  timestamp: string;
}

export async function buildHealthPayload(
  now: Date = new Date(),
  checkDb: () => Promise<boolean> = defaultCheckDb,
  version: string = process.env.npm_package_version ?? "0.1.0",
  warnings: string[] = defaultWarnings(),
): Promise<HealthPayload> {
  const checks = {
    process: true,
    database: await checkDb(),
  };

  return {
    ok: Object.values(checks).every(Boolean),
    service: "jobmatch",
    version,
    checks,
    warnings,
    timestamp: now.toISOString(),
  };
}

function defaultWarnings(): string[] {
  // Guarded because a health probe must still answer when the environment is
  // the thing that is broken — that is exactly when someone is reading it.
  try {
    return getEnv().warnings;
  } catch {
    return ["environment could not be resolved"];
  }
}

async function defaultCheckDb(): Promise<boolean> {
  const { pingJobMatchDb } = await import("./db/readiness");
  return (await pingJobMatchDb()).ok;
}
