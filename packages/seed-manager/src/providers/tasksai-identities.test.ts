import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import {
  TASKSAI_IDENTITIES,
  tasksaiIdentityEmail,
  tasksaiIdentityId,
  tasksaiIdentitySecretNames,
} from "../definitions/tasksai-identities";
import type { SeedPrismaClient } from "../prisma-client";
import {
  DEV_PLATFORM_DB_PORTS,
  checkCanMarkDatabase,
  checkDatabaseMarker,
  ensureTasksaiIdentities,
  tasksaiIdentitiesGuard,
  tasksaiIdentitiesProvider,
  validateTasksaiIdentityDefinitions,
} from "./tasksai-identities";

describe("TasksAI test identities (#742)", () => {
  it("defines one valid identity per role, with synthetic markers", () => {
    expect(validateTasksaiIdentityDefinitions()).toEqual([]);
    for (const identity of TASKSAI_IDENTITIES) {
      expect(tasksaiIdentityId(identity.key)).toBe(`seed-tasksai-test-${identity.key}`);
      // .test is a reserved TLD: never a real mailbox.
      expect(tasksaiIdentityEmail(identity.key)).toMatch(/^tasksai-test\+[a-z0-9]+@asafarim\.test$/);
      expect(tasksaiIdentitySecretNames(identity.key).password).toMatch(/^TASKSAI_TEST_[A-Z0-9]+_PASSWORD$/);
    }
  });

  it("puts only the member in the production smoke baseline", () => {
    expect(TASKSAI_IDENTITIES.filter((i) => i.productionBaseline).map((i) => i.key)).toEqual(["member"]);
  });

  describe("CLI guard: static signals (fail closed)", () => {
    const devUrl = "postgresql://asafarim:pw@localhost:55435/asafarim";
    const laptop = { machineHostname: "dev-laptop", cwd: "C:/repos/asafarim-platform/packages/db" };

    it("allows loopback on the development port: all identities", () => {
      const decision = tasksaiIdentitiesGuard({ rawDatabaseUrl: devUrl, ...laptop });
      expect(decision).toMatchObject({ ok: true, environment: "development", production: false });
      expect(decision.ok && decision.identities.length).toBe(TASKSAI_IDENTITIES.length);
    });

    it("treats loopback on the default port as PRODUCTION (production host, or an SSH tunnel to it)", () => {
      for (const url of [
        "postgresql://asafarim:pw@localhost:5432/asafarim",
        "postgresql://asafarim:pw@127.0.0.1/asafarim",
        "postgresql://asafarim:pw@[::1]:6543/asafarim",
      ]) {
        const decision = tasksaiIdentitiesGuard({ rawDatabaseUrl: url, ...laptop });
        expect(decision.ok, url).toBe(false);
        expect(!decision.ok && decision.reason).toMatch(/PRODUCTION.*loopback/);
      }
    });

    it("refuses on the production host even with a development-looking URL", () => {
      for (const machine of [
        { machineHostname: "asafarim", cwd: "/home/x" },
        { machineHostname: "other", cwd: "/var/repos/asafarim-com/packages/db" },
      ]) {
        const decision = tasksaiIdentitiesGuard({ rawDatabaseUrl: devUrl, ...machine });
        expect(decision.ok).toBe(false);
        expect(!decision.ok && decision.reason).toMatch(/production host/);
      }
    });

    it("refuses the compose host and NODE_ENV=production without the owner flag", () => {
      for (const input of [
        { rawDatabaseUrl: "postgresql://asafarim:pw@postgres:5432/asafarim", ...laptop },
        { rawDatabaseUrl: devUrl, nodeEnv: "production", ...laptop },
      ]) {
        expect(tasksaiIdentitiesGuard(input).ok).toBe(false);
      }
    });

    it("with --allow-production-baseline, production gets the baseline identity only", () => {
      const decision = tasksaiIdentitiesGuard({ rawDatabaseUrl: "postgresql://asafarim:pw@localhost:5432/asafarim", allowProductionBaseline: true, ...laptop });
      expect(decision).toMatchObject({ ok: true, environment: "production" });
      expect(decision.ok && decision.identities.map((i) => i.key)).toEqual(["member"]);
    });

    it("rejects the owner flag against the development database", () => {
      expect(tasksaiIdentitiesGuard({ rawDatabaseUrl: devUrl, allowProductionBaseline: true, ...laptop }).ok).toBe(false);
    });

    it("requires --confirm-host for a remote test database", () => {
      const remote = "postgresql://u:pw@db.tasks-test.example:5432/asafarim";
      expect(tasksaiIdentitiesGuard({ rawDatabaseUrl: remote, ...laptop }).ok).toBe(false);
      expect(tasksaiIdentitiesGuard({ rawDatabaseUrl: remote, confirmHost: "db.tasks-test.example", ...laptop })).toMatchObject({ ok: true, environment: "test" });
    });

    it("pins the development port to docker-compose.yml (fails if the dev port changes)", () => {
      const compose = readFileSync(path.resolve(__dirname, "../../../../docker-compose.yml"), "utf8");
      const postgres = compose.slice(compose.indexOf("\n  postgres:"), compose.indexOf("\n  testora-postgres:"));
      const published = [...postgres.matchAll(/-\s*"(?:127\.0\.0\.1:)?(\d+):5432"/g)].map((m) => m[1]);
      expect(published).toEqual([...DEV_PLATFORM_DB_PORTS]);
    });
  });

  describe("CLI guard: the database's own marker", () => {
    it("development/test need their marker; a missing or other marker refuses", () => {
      expect(checkDatabaseMarker("development", "development")).toEqual({ ok: true });
      expect(checkDatabaseMarker("development", null).ok).toBe(false);
      expect(checkDatabaseMarker("development", "test").ok).toBe(false);
      expect(checkDatabaseMarker("test", "test")).toEqual({ ok: true });
      expect(checkDatabaseMarker("test", "development").ok).toBe(false);
    });

    it("production refuses a database marked development/test (signals disagree)", () => {
      expect(checkDatabaseMarker("production", null)).toEqual({ ok: true });
      expect(checkDatabaseMarker("production", "development").ok).toBe(false);
      expect(checkDatabaseMarker("production", "test").ok).toBe(false);
    });
  });

  describe("the deploy's positive production marker (#747)", () => {
    const tunnelOntoDevPort = { rawDatabaseUrl: "postgresql://asafarim:pw@localhost:55435/asafarim", machineHostname: "dev-laptop", cwd: "C:/repos/x" };

    it("a dev-loopback URL on a database marked production is refused", () => {
      const decision = tasksaiIdentitiesGuard(tunnelOntoDevPort);
      expect(decision).toMatchObject({ ok: true, environment: "development" }); // URL + machine pass…
      const db = checkDatabaseMarker(decision.ok ? decision.environment : "development", "production");
      expect(db.ok).toBe(false); // …the database's own stamp refuses
      expect(!db.ok && db.reason).toMatch(/marked "production"/);
      expect(checkDatabaseMarker("test", "production").ok).toBe(false);
    });

    it("--mark-database never overwrites a production marker", () => {
      expect(checkCanMarkDatabase("production").ok).toBe(false);
      expect(checkCanMarkDatabase(null)).toEqual({ ok: true });
      expect(checkCanMarkDatabase("development")).toEqual({ ok: true });
    });

    it("baseline mode on a production-marked database: allowed, baseline identities only", () => {
      const decision = tasksaiIdentitiesGuard({ rawDatabaseUrl: "postgresql://asafarim:pw@postgres:5432/asafarim", allowProductionBaseline: true });
      expect(decision).toMatchObject({ ok: true, environment: "production" });
      expect(decision.ok && decision.identities.map((i) => i.key)).toEqual(["member"]);
      expect(checkDatabaseMarker("production", "production")).toEqual({ ok: true });
    });
  });

  it("creates accounts with no platform role grants (default RBAC: none)", async () => {
    const calls: string[] = [];
    const users = new Map<string, { id: string; password: string | null }>();
    const record = (model: string) =>
      new Proxy({}, { get: (_t, op: string) => async (args: { where?: { email?: string }; data?: { id: string; email: string; password?: string } }) => {
        calls.push(`${model}.${op}`);
        if (model === "user" && op === "findUnique") return users.get(args.where!.email!) ?? null;
        if (model === "user" && op === "create") users.set(args.data!.email, { id: args.data!.id, password: args.data!.password ?? null });
        return null;
      } });
    const prisma = new Proxy({}, { get: (_t, model: string) => record(model) }) as unknown as SeedPrismaClient;

    const ensured = await ensureTasksaiIdentities(prisma, { generatePassword: () => "x".repeat(32) });
    expect(ensured.map((e) => e.key)).toEqual(TASKSAI_IDENTITIES.map((i) => i.key));
    expect(calls.every((c) => c.startsWith("user."))).toBe(true);
    expect(calls.some((c) => /userRole|role|permission|tester/i.test(c.split(".")[0]!))).toBe(false);
  });

  it("is status-only in the Admin Console: no seed/reconcile/remove, execute refuses", async () => {
    expect(tasksaiIdentitiesProvider.supports).toEqual({ validate: true, status: true, seed: false, reconcile: false, remove: false });
    await expect(tasksaiIdentitiesProvider.execute({} as never, {} as never)).rejects.toThrow(/CLI/);
  });
});
