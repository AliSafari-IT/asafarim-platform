import { describe, expect, it } from "vitest";
import { testDataGuard } from "./guard";

const local = "postgres://tasksai:tasksai_dev@127.0.0.1:55438/tasksai";
const prod = "postgres://tasksai:x@tasksai-postgres:5432/tasksai";

describe("test-data production guard (#742 slice 2b)", () => {
  it("refuses the production TasksAI database without the owner flag", () => {
    for (const input of [{ rawDatabaseUrl: prod }, { rawDatabaseUrl: local, nodeEnv: "production" }]) {
      const decision = testDataGuard(input);
      expect(decision.ok).toBe(false);
      expect(!decision.ok && decision.reason).toMatch(/PRODUCTION/);
    }
  });

  it("with --allow-production-baseline, production gets the read-only baseline only", () => {
    expect(testDataGuard({ rawDatabaseUrl: prod, allowProductionBaseline: true })).toMatchObject({ ok: true, mode: "production-baseline" });
  });

  it("rejects the owner flag on a non-production database", () => {
    expect(testDataGuard({ rawDatabaseUrl: local, allowProductionBaseline: true }).ok).toBe(false);
  });

  it("never writes the platform database", () => {
    const platform = "postgresql://asafarim:pw@localhost:55435/asafarim";
    const decision = testDataGuard({ rawDatabaseUrl: platform, platformDatabaseUrl: platform });
    expect(decision.ok).toBe(false);
    expect(!decision.ok && decision.reason).toMatch(/platform database/);
  });

  it("needs --confirm-host for a remote test environment", () => {
    const remote = "postgres://tasksai:x@db.tasks-test.example:5432/tasksai";
    expect(testDataGuard({ rawDatabaseUrl: remote }).ok).toBe(false);
    expect(testDataGuard({ rawDatabaseUrl: remote, confirmHost: "db.tasks-test.example" })).toMatchObject({ ok: true, mode: "full" });
  });

  it("allows a local database in full mode", () => {
    expect(testDataGuard({ rawDatabaseUrl: local })).toMatchObject({ ok: true, mode: "full" });
  });
});
