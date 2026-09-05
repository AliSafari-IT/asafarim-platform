import { getEnv } from "./env";

/**
 * Health payload for TasksAI. Pure over its dependencies (the database
 * check is injected) so the shape is unit-testable without booting Next.js
 * or a real database — matching the JobMatch / AppBuilder pattern.
 */
export interface HealthPayload {
  ok: boolean;
  service: "tasks-ai";
  version: string;
  checks: Record<string, boolean>;
  /** Non-fatal configuration problems. Names only, never values. */
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
    service: "tasks-ai",
    version,
    checks,
    warnings,
    timestamp: now.toISOString(),
  };
}

function defaultWarnings(): string[] {
  // Guarded: a health probe must answer even when the environment is the
  // thing that is broken — that is exactly when someone is reading it.
  try {
    return getEnv().warnings;
  } catch {
    return ["environment could not be resolved"];
  }
}

async function defaultCheckDb(): Promise<boolean> {
  const { pingTasksAiDb } = await import("./db/readiness");
  return (await pingTasksAiDb()).ok;
}
