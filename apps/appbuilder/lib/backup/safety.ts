/**
 * Pure, dependency-free safety checks for the restore rehearsal script —
 * split out from lib/backup/runRestoreRehearsal.ts specifically so this
 * logic (the ONE guard standing between a rehearsal and an accidental
 * production restore) is unit-testable without spinning up Postgres or
 * shelling out to pg_restore. See docs/appbuilder-m12-backup-restore-runbook.md.
 */

export type EnvLike = Record<string, string | undefined>;

export function resolveSourceUrl(env: EnvLike = process.env): string {
  return (
    env.APPBUILDER_DATABASE_URL ??
    "postgres://appbuilder:appbuilder_dev@localhost:55436/appbuilder"
  );
}

export function resolveTargetUrl(
  sourceUrl: string,
  env: EnvLike = process.env
): string {
  const explicit = env.APPBUILDER_RESTORE_REHEARSAL_DATABASE_URL;
  if (explicit) return explicit;
  const parsed = new URL(sourceUrl);
  parsed.pathname = "/appbuilder_restore_rehearsal";
  return parsed.toString();
}

/**
 * Throws unless the target is CLEARLY a non-production scratch database:
 * different from the source connection string, a different database name,
 * AND a database name that looks like a scratch target. Three independent
 * checks, deliberately redundant — a single mistaken env var must not be
 * enough to let this script run against the real database.
 */
export function assertNotProduction(
  sourceUrl: string,
  targetUrl: string
): void {
  if (targetUrl === sourceUrl) {
    throw new Error(
      "Refusing to run: the resolved restore-rehearsal target is identical to APPBUILDER_DATABASE_URL."
    );
  }
  const sourceDbName = new URL(sourceUrl).pathname.replace(/^\//, "");
  const targetDbName = new URL(targetUrl).pathname.replace(/^\//, "");
  if (sourceDbName === targetDbName) {
    throw new Error(
      `Refusing to run: the restore-rehearsal target database name ("${targetDbName}") matches the production database name — set APPBUILDER_RESTORE_REHEARSAL_DATABASE_URL to a distinctly named scratch database.`
    );
  }
  if (
    !targetDbName.includes("rehearsal") &&
    !targetDbName.includes("restore") &&
    !targetDbName.includes("test")
  ) {
    throw new Error(
      `Refusing to run: the restore-rehearsal target database name ("${targetDbName}") doesn't look like a scratch database (expected it to contain "rehearsal", "restore", or "test") — this check exists specifically to prevent an accidental production restore.`
    );
  }
}
