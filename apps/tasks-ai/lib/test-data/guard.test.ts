import { describe, expect, it } from "vitest";
import { DEV_TASKSAI_DB_PORTS, PRODUCTION_HOST, testDataGuard } from "./guard";

// The guard's rules are tested once, in @asafarim/db-env-guard (#749). These
// tests cover only the wiring: the TasksAI profile and the script's modes.
const dev = "postgres://tasksai:tasksai_dev@127.0.0.1:55438/tasksai";
const laptop = { machineHostname: "dev-laptop", cwd: "C:/repos/asafarim-platform/apps/tasks-ai" };

describe("test-data guard wiring (#742 slice 2b, #749)", () => {
  it("uses the TasksAI database profile", () => {
    expect([...DEV_TASKSAI_DB_PORTS]).toEqual(["55438"]);
    expect(PRODUCTION_HOST).toBe("tasksai-postgres");
    expect(testDataGuard({ rawDatabaseUrl: dev, ...laptop })).toMatchObject({ ok: true, mode: "full", environment: "development" });
    const prod = testDataGuard({ rawDatabaseUrl: "postgres://tasksai:x@127.0.0.1:5438/tasksai", ...laptop });
    expect(!prod.ok && prod.reason).toMatch(/PRODUCTION TasksAI database/);
  });

  it("a remote test database gets the full data set", () => {
    expect(testDataGuard({ rawDatabaseUrl: "postgres://t:x@db.tasks-test.example:5432/t", confirmHost: "db.tasks-test.example", ...laptop })).toMatchObject({
      ok: true,
      mode: "full",
      environment: "test",
    });
  });

  it("production, with the owner flag, gets the read-only baseline only", () => {
    expect(testDataGuard({ rawDatabaseUrl: "postgres://tasksai:x@tasksai-postgres:5432/tasksai", allowProductionBaseline: true, ...laptop })).toMatchObject({
      ok: true,
      mode: "production-baseline",
      environment: "production",
    });
  });

  it("passes the platform URL through, so the platform database is refused", () => {
    const platform = "postgresql://asafarim:pw@localhost:55435/asafarim";
    const decision = testDataGuard({ rawDatabaseUrl: platform, platformDatabaseUrl: platform, ...laptop });
    expect(!decision.ok && decision.reason).toMatch(/platform database/);
  });
});
