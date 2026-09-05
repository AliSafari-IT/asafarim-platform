import { describe, expect, it } from "vitest";
import { hasTestDatabase } from "./test-database";

/**
 * Integration probe. Skipped unless TASKSAI_TEST_DATABASE_URL points at a
 * throwaway database — the dev/platform databases must never be a test
 * target. CI supplies an ephemeral Postgres.
 */
describe.skipIf(!hasTestDatabase())("pingTasksAiDb (integration)", () => {
  it("round-trips SELECT 1 against the test database", async () => {
    process.env.TASKSAI_DATABASE_URL = process.env.TASKSAI_TEST_DATABASE_URL;
    const { pingTasksAiDb } = await import("./readiness");
    const result = await pingTasksAiDb();
    expect(result.ok).toBe(true);
    expect(typeof result.latencyMs).toBe("number");
  });
});
