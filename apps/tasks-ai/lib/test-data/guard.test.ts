import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { DEV_TASKSAI_DB_PORTS, checkDatabaseMarker, parseDatabaseMarker, testDataGuard } from "./guard";

const dev = "postgres://tasksai:tasksai_dev@127.0.0.1:55438/tasksai";
const laptop = { machineHostname: "dev-laptop", cwd: "C:/repos/asafarim-platform/apps/tasks-ai" };

describe("test-data production guard: static signals (#742 slice 2b, fail closed)", () => {
  it("allows loopback on the development port", () => {
    expect(testDataGuard({ rawDatabaseUrl: dev, ...laptop })).toMatchObject({ ok: true, mode: "full", environment: "development" });
  });

  it("treats loopback on any other port as PRODUCTION (production host, or an SSH tunnel to it)", () => {
    for (const url of [
      "postgres://tasksai:x@127.0.0.1:5438/tasksai",
      "postgres://tasksai:x@localhost:5432/tasksai",
      "postgres://tasksai:x@localhost/tasksai",
    ]) {
      const decision = testDataGuard({ rawDatabaseUrl: url, ...laptop });
      expect(decision.ok, url).toBe(false);
      expect(!decision.ok && decision.reason).toMatch(/PRODUCTION.*loopback/);
    }
  });

  it("refuses on the production host even with the development URL", () => {
    for (const machine of [
      { machineHostname: "asafarim", cwd: "/home/x" },
      { machineHostname: "other", cwd: "/var/repos/asafarim-com/apps/tasks-ai" },
    ]) {
      const decision = testDataGuard({ rawDatabaseUrl: dev, ...machine });
      expect(decision.ok).toBe(false);
      expect(!decision.ok && decision.reason).toMatch(/production host/);
    }
  });

  it("refuses the compose host and NODE_ENV=production without the owner flag", () => {
    for (const input of [
      { rawDatabaseUrl: "postgres://tasksai:x@tasksai-postgres:5432/tasksai", ...laptop },
      { rawDatabaseUrl: dev, nodeEnv: "production", ...laptop },
    ]) {
      expect(testDataGuard(input).ok).toBe(false);
    }
  });

  it("with --allow-production-baseline, production gets the read-only baseline only", () => {
    expect(testDataGuard({ rawDatabaseUrl: "postgres://tasksai:x@tasksai-postgres:5432/tasksai", allowProductionBaseline: true, ...laptop })).toMatchObject({
      ok: true,
      mode: "production-baseline",
      environment: "production",
    });
  });

  it("rejects the owner flag on the development database", () => {
    expect(testDataGuard({ rawDatabaseUrl: dev, allowProductionBaseline: true, ...laptop }).ok).toBe(false);
  });

  it("never writes the platform database", () => {
    const platform = "postgresql://asafarim:pw@localhost:55435/asafarim";
    const decision = testDataGuard({ rawDatabaseUrl: platform, platformDatabaseUrl: platform, ...laptop });
    expect(decision.ok).toBe(false);
    expect(!decision.ok && decision.reason).toMatch(/platform database/);
  });

  it("needs --confirm-host for a remote test environment", () => {
    const remote = "postgres://tasksai:x@db.tasks-test.example:5432/tasksai";
    expect(testDataGuard({ rawDatabaseUrl: remote, ...laptop }).ok).toBe(false);
    expect(testDataGuard({ rawDatabaseUrl: remote, confirmHost: "db.tasks-test.example", ...laptop })).toMatchObject({ ok: true, environment: "test" });
  });

  it("pins the development port to docker-compose.yml (fails if it changes)", () => {
    const compose = readFileSync(path.resolve(__dirname, "../../../../docker-compose.yml"), "utf8");
    const start = compose.indexOf("\n  tasksai-postgres:");
    const next = compose.slice(start + 1).search(/\n {2}[a-z][a-z0-9-]*:\n/);
    const service = compose.slice(start, next === -1 ? undefined : start + 1 + next);
    const published = [...service.matchAll(/-\s*"(?:127\.0\.0\.1:)?(\d+):5432"/g)].map((m) => m[1]);
    expect(published).toEqual([...DEV_TASKSAI_DB_PORTS]);
  });
});

describe("test-data production guard: the database's own marker", () => {
  it("parses the marker from the database comment", () => {
    expect(parseDatabaseMarker("asafarim-env=development")).toBe("development");
    expect(parseDatabaseMarker("notes; asafarim-env=test")).toBe("test");
    expect(parseDatabaseMarker(null)).toBeNull();
  });

  it("development/test need their marker; a missing or other marker refuses", () => {
    expect(checkDatabaseMarker("development", "development")).toEqual({ ok: true });
    expect(checkDatabaseMarker("development", null).ok).toBe(false);
    expect(checkDatabaseMarker("test", "development").ok).toBe(false);
  });

  it("production refuses a database marked development/test (signals disagree)", () => {
    expect(checkDatabaseMarker("production", null)).toEqual({ ok: true });
    expect(checkDatabaseMarker("production", "development").ok).toBe(false);
  });
});
