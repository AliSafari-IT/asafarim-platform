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
  timestamp: string;
}

export async function buildHealthPayload(
  now: Date = new Date(),
  checkDb: () => Promise<boolean> = defaultCheckDb,
  version: string = process.env.npm_package_version ?? "0.1.0",
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
    timestamp: now.toISOString(),
  };
}

async function defaultCheckDb(): Promise<boolean> {
  const { pingJobMatchDb } = await import("./db/readiness");
  return (await pingJobMatchDb()).ok;
}
