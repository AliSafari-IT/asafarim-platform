/**
 * Health payload for AppBuilder.
 *
 * M02 adds AppBuilder's own database, so the liveness check from M01 now
 * also reports a readiness check: can the process reach its own Postgres.
 * Kept as a pure function (db check injected) so the route handler stays a
 * thin wrapper and the shape is unit-testable without booting Next.js or a
 * real database.
 */

export interface HealthPayload {
  ok: boolean;
  service: "appbuilder";
  version: string;
  checks: Record<string, boolean>;
  timestamp: string;
}

export async function buildHealthPayload(
  now: Date = new Date(),
  checkDb: () => Promise<boolean> = defaultCheckDb,
): Promise<HealthPayload> {
  const checks = {
    process: true,
    database: await checkDb(),
  };
  const ok = Object.values(checks).every(Boolean);

  return {
    ok,
    service: "appbuilder",
    version: process.env.npm_package_version ?? "0.1.0",
    checks,
    timestamp: now.toISOString(),
  };
}

async function defaultCheckDb(): Promise<boolean> {
  const { pingDb } = await import("./db/readiness");
  return pingDb();
}
