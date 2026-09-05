/**
 * Guard for integration tests. TasksAI's dev database must never be a test
 * target: a test run that truncates tables would wipe local work. Integration
 * tests call `requireTestDatabaseUrl()` in a `beforeAll` and skip the suite
 * when it is unset.
 */
export class MissingTestDatabaseError extends Error {
  constructor() {
    super(
      "TASKSAI_TEST_DATABASE_URL is not set. Integration tests need a throwaway " +
        "database and refuse to run against the dev or platform database.",
    );
    this.name = "MissingTestDatabaseError";
  }
}

export function testDatabaseUrl(): string | undefined {
  return process.env.TASKSAI_TEST_DATABASE_URL;
}

export function requireTestDatabaseUrl(): string {
  const url = testDatabaseUrl();
  if (!url) throw new MissingTestDatabaseError();
  if (process.env.TASKSAI_DATABASE_URL && url === process.env.TASKSAI_DATABASE_URL) {
    throw new Error("TASKSAI_TEST_DATABASE_URL must not equal TASKSAI_DATABASE_URL");
  }
  if (process.env.DATABASE_URL && url === process.env.DATABASE_URL) {
    throw new Error("TASKSAI_TEST_DATABASE_URL must not equal the platform DATABASE_URL");
  }
  return url;
}

/** For `describe.skipIf(!hasTestDatabase())` in integration suites. */
export function hasTestDatabase(): boolean {
  return Boolean(testDatabaseUrl());
}
