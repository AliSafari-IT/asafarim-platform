/**
 * Health payload for AppBuilder.
 *
 * M01 has no database or external dependency of its own yet (that arrives in
 * M02), so the check is a liveness probe: the process is up and can respond.
 * Kept as a pure function so the route handler stays a thin wrapper and the
 * shape is unit-testable without booting Next.js.
 */

export interface HealthPayload {
  ok: boolean;
  service: "appbuilder";
  version: string;
  checks: Record<string, boolean>;
  timestamp: string;
}

export function buildHealthPayload(now: Date = new Date()): HealthPayload {
  const checks = {
    process: true,
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
