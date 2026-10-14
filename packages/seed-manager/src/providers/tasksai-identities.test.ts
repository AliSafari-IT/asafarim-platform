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
  markDatabase,
  readDatabaseMarker,
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

  // The guard's rules are tested once, in @asafarim/db-env-guard (#749).
  // These tests cover only the wiring: the platform profile and the identities.
  describe("CLI guard wiring (#749)", () => {
    const laptop = { machineHostname: "dev-laptop", cwd: "C:/repos/asafarim-platform/packages/db" };

    it("uses the platform database profile: all identities on the development database", () => {
      expect([...DEV_PLATFORM_DB_PORTS]).toEqual(["55435"]);
      const decision = tasksaiIdentitiesGuard({ rawDatabaseUrl: "postgresql://asafarim:pw@localhost:55435/asafarim", ...laptop });
      expect(decision).toMatchObject({ ok: true, environment: "development", production: false });
      expect(decision.ok && decision.identities.length).toBe(TASKSAI_IDENTITIES.length);
      const prod = tasksaiIdentitiesGuard({ rawDatabaseUrl: "postgresql://asafarim:pw@postgres:5432/asafarim", ...laptop });
      expect(!prod.ok && prod.reason).toMatch(/PRODUCTION platform database.*compose host "postgres"/);
    });

    it("a remote test database gets all identities", () => {
      const decision = tasksaiIdentitiesGuard({ rawDatabaseUrl: "postgresql://u:pw@db.tasks-test.example:5432/asafarim", confirmHost: "db.tasks-test.example", ...laptop });
      expect(decision).toMatchObject({ ok: true, environment: "test", production: false });
      expect(decision.ok && decision.identities.length).toBe(TASKSAI_IDENTITIES.length);
    });

    it("production, with the owner flag, gets the baseline identity only", () => {
      const decision = tasksaiIdentitiesGuard({ rawDatabaseUrl: "postgresql://asafarim:pw@postgres:5432/asafarim", allowProductionBaseline: true });
      expect(decision).toMatchObject({ ok: true, environment: "production", production: true });
      expect(decision.ok && decision.identities.map((i) => i.key)).toEqual(["member"]);
    });

    it("re-exports the marker checks the CLI uses", () => {
      expect(checkDatabaseMarker("development", "production").ok).toBe(false);
      expect(checkCanMarkDatabase("production").ok).toBe(false);
    });

    it("reads and sets the marker through Prisma with the shared SQL", async () => {
      const calls: string[] = [];
      const prisma = {
        $queryRawUnsafe: async (sql: string) => {
          calls.push(sql);
          return /shobj_description/.test(sql) ? [{ comment: "asafarim-env=test" }] : [{ db: "asafarim" }];
        },
        $executeRawUnsafe: async (sql: string) => {
          calls.push(sql);
          return 1;
        },
      } as unknown as SeedPrismaClient;
      expect(await readDatabaseMarker(prisma)).toBe("test");
      await markDatabase(prisma, "development");
      expect(calls.at(-1)).toBe(`COMMENT ON DATABASE "asafarim" IS 'asafarim-env=development'`);
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
