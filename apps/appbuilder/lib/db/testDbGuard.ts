/**
 * Pure, dependency-free guard for the integration-test database connection —
 * split out from testUtils.ts specifically so it is unit-testable without a
 * live Postgres connection, mirroring lib/backup/safety.ts's
 * `assertNotProduction` for the same class of risk.
 *
 * `resetTestDb()` runs `TRUNCATE ... CASCADE` on every app-owned table
 * (apps, generation_jobs, conversations, specifications, ...) before EVERY
 * test in the integration suite. Before this guard existed, with no
 * `APPBUILDER_TEST_DATABASE_URL` set, that function and `APPBUILDER_DATABASE_URL`
 * resolved to the byte-identical connection string — so `pnpm test:integration`
 * silently truncated a developer's real dev database on its very first test.
 * This guard makes that failure loud instead of silent: it throws unless a
 * test database was explicitly configured and is clearly not the dev/prod one.
 */

export type EnvLike = Record<string, string | undefined>;

const DEV_DATABASE_URL_DEFAULT =
  "postgres://appbuilder:appbuilder_dev@localhost:55436/appbuilder";

export function resolveDevDatabaseUrl(env: EnvLike = process.env): string {
  return env.APPBUILDER_DATABASE_URL ?? DEV_DATABASE_URL_DEFAULT;
}

/**
 * Returns the connection string integration tests should use, or throws.
 * Three independent, redundant checks — deliberately redundant, the same way
 * `assertNotProduction` is: a single mistaken env var must not be enough to
 * let a destructive suite run against real data.
 */
export function assertSafeTestDatabaseUrl(env: EnvLike = process.env): string {
  const testUrl = env.APPBUILDER_TEST_DATABASE_URL;
  const devUrl = resolveDevDatabaseUrl(env);

  if (!testUrl) {
    throw new Error(
      "Refusing to run integration tests: APPBUILDER_TEST_DATABASE_URL is not set. " +
        `resetTestDb() runs TRUNCATE ... CASCADE on every app-owned table (apps, generation_jobs, conversations, specifications, ...) before every test — without this variable it would resolve to "${devUrl}", the same database your dev server uses. ` +
        "Set APPBUILDER_TEST_DATABASE_URL to a distinctly named scratch database, e.g. postgres://appbuilder:appbuilder_dev@localhost:55436/appbuilder_test.",
    );
  }
  if (testUrl === devUrl) {
    throw new Error(
      `Refusing to run integration tests: APPBUILDER_TEST_DATABASE_URL is identical to the dev/prod database ("${devUrl}"). Point it at a distinctly named scratch database instead.`,
    );
  }
  const devDbName = new URL(devUrl).pathname.replace(/^\//, "");
  const testDbName = new URL(testUrl).pathname.replace(/^\//, "");
  if (devDbName === testDbName) {
    throw new Error(
      `Refusing to run integration tests: APPBUILDER_TEST_DATABASE_URL's database name ("${testDbName}") matches the dev/prod database name even though the connection strings differ — this looks like a mistake, not a deliberate scratch database.`,
    );
  }
  if (!testDbName.includes("test")) {
    throw new Error(
      `Refusing to run integration tests: APPBUILDER_TEST_DATABASE_URL's database name ("${testDbName}") doesn't look like a scratch database (expected it to contain "test") — this check exists specifically to prevent an accidental dev-database wipe.`,
    );
  }
  return testUrl;
}
