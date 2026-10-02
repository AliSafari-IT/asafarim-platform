import { describe, expect, it } from "vitest";
import {
  TASKSAI_IDENTITIES,
  tasksaiIdentityEmail,
  tasksaiIdentityId,
  tasksaiIdentitySecretNames,
} from "../definitions/tasksai-identities";
import {
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

  describe("CLI guard", () => {
    const local = "postgresql://asafarim:pw@localhost:5432/asafarim";

    it("allows a local database, all identities", () => {
      const decision = tasksaiIdentitiesGuard({ rawDatabaseUrl: local });
      expect(decision).toMatchObject({ ok: true, production: false });
      expect(decision.ok && decision.identities.length).toBe(TASKSAI_IDENTITIES.length);
    });

    it("refuses production (compose host or NODE_ENV) without the owner flag", () => {
      for (const input of [
        { rawDatabaseUrl: "postgresql://asafarim:pw@postgres:5432/asafarim" },
        { rawDatabaseUrl: local, nodeEnv: "production" },
      ]) {
        const decision = tasksaiIdentitiesGuard(input);
        expect(decision.ok).toBe(false);
        expect(!decision.ok && decision.reason).toMatch(/PRODUCTION/);
      }
    });

    it("with --allow-production-baseline, production gets the baseline identity only", () => {
      const decision = tasksaiIdentitiesGuard({
        rawDatabaseUrl: "postgresql://asafarim:pw@postgres:5432/asafarim",
        allowProductionBaseline: true,
      });
      expect(decision).toMatchObject({ ok: true, production: true });
      expect(decision.ok && decision.identities.map((i) => i.key)).toEqual(["member"]);
    });

    it("rejects the owner flag against a non-production database", () => {
      expect(tasksaiIdentitiesGuard({ rawDatabaseUrl: local, allowProductionBaseline: true }).ok).toBe(false);
    });

    it("requires --confirm-host for a remote (test-environment) database", () => {
      const remote = "postgresql://u:pw@db.tasks-test.example:5432/asafarim";
      expect(tasksaiIdentitiesGuard({ rawDatabaseUrl: remote }).ok).toBe(false);
      expect(tasksaiIdentitiesGuard({ rawDatabaseUrl: remote, confirmHost: "other.example" }).ok).toBe(false);
      expect(tasksaiIdentitiesGuard({ rawDatabaseUrl: remote, confirmHost: "db.tasks-test.example" })).toMatchObject({ ok: true });
    });
  });

  it("is status-only in the Admin Console: no seed/reconcile/remove, execute refuses", async () => {
    expect(tasksaiIdentitiesProvider.supports).toEqual({ validate: true, status: true, seed: false, reconcile: false, remove: false });
    await expect(tasksaiIdentitiesProvider.execute({} as never, {} as never)).rejects.toThrow(/CLI/);
  });
});
