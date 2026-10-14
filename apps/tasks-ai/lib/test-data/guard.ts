/**
 * Which TasksAI databases the test-data script may write (#742 slice 2b).
 * The fail-closed rules (URL, machine, the database's own asafarim-env marker)
 * live in @asafarim/db-env-guard (#749), shared with the platform-side
 * identities CLI; this file only maps them onto the script's modes.
 */
import {
  TASKSAI_DATABASE,
  decideDatabaseEnvironment,
  type DatabaseEnvironment,
  type GuardInput,
} from "@asafarim/db-env-guard";

export {
  DATABASE_MARKER_PREFIX,
  checkCanMarkDatabase,
  checkDatabaseMarker,
  checkMarkRequest,
  parseDatabaseMarker,
  type DatabaseEnvironment,
} from "@asafarim/db-env-guard";

/** TasksAI's development port (docker-compose.yml "127.0.0.1:55438:5432"); pinned by @asafarim/db-env-guard's tests. */
export const DEV_TASKSAI_DB_PORTS = TASKSAI_DATABASE.devPorts;
export const PRODUCTION_HOST = TASKSAI_DATABASE.productionComposeHost;

export type TestDataMode = "full" | "production-baseline";

export type GuardDecision =
  | { ok: true; mode: TestDataMode; environment: DatabaseEnvironment; host: string }
  | { ok: false; reason: string };

/** Production gets the read-only remote-smoke baseline only; everything else the full data set. */
export function testDataGuard(input: GuardInput): GuardDecision {
  const decision = decideDatabaseEnvironment(TASKSAI_DATABASE, input);
  if (!decision.ok) return decision;
  return { ...decision, mode: decision.environment === "production" ? "production-baseline" : "full" };
}
