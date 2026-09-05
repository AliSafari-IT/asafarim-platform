import { getEnv } from "./env";
/**
 * Health payload for JobMatch.
 *
 * Pure over its dependencies (the database and scanner checks are injected)
 * so the shape is unit-testable without booting Next.js, a real database, or
 * a real ClamAV daemon, matching the AppBuilder pattern in
 * apps/appbuilder/lib/health.ts.
 */

export interface ScannerHealthSummary {
  configured: boolean;
  reachable: boolean;
}

export interface HealthPayload {
  ok: boolean;
  service: "jobmatch";
  version: string;
  checks: Record<string, boolean>;
  /**
   * Malware-scanner reachability (issue #203), reported alongside the pass/
   * fail checks but deliberately not one of them: a ClamAV outage should be
   * visible and page someone, but it must not flip this endpoint's overall
   * `ok` (and therefore the container's own Docker healthcheck) to
   * unhealthy — that would restart the jobmatch app itself in a loop that
   * does nothing to fix the scanner sidecar.
   */
  scanner: ScannerHealthSummary;
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
  checkScanner: () => Promise<ScannerHealthSummary> = defaultCheckScanner,
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
    scanner: await checkScanner(),
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

async function defaultCheckScanner(): Promise<ScannerHealthSummary> {
  const { getScannerHealth } = await import("./documents/scanner");
  const health = await getScannerHealth();
  return { configured: health.configured, reachable: health.reachable };
}
