import { describe, expect, it } from "vitest";

import { PLAN_TTL_MS, planChecksum } from "./checksums";
import type { SeedPlan, SeedProvider } from "./contracts";
import { getProvider } from "./registry";
import {
  FRESH_SESSION_MAX_AGE_MS,
  NO_BACKUP_NOTICE,
  authorizeOperation,
  bulkConfirmationPhrase,
  confirmationMatches,
  confirmationPhrase,
  permissionForOperation,
  verifyApprovedPlan,
  type SeedActor,
} from "./safety";

const NOW = Date.UTC(2026, 7, 9, 12, 0, 0);

function actor(overrides: Partial<SeedActor> = {}): SeedActor {
  return {
    userId: "user-1",
    roles: ["admin"],
    permissions: ["seeds.view", "seeds.execute", "seeds.remove", "seeds.schedule"],
    sessionIssuedAtMs: NOW - 60_000,
    ...overrides,
  };
}

const timelineai = getProvider("timelineai") as SeedProvider;
const foundation = getProvider("platform-foundation") as SeedProvider;
const hub = getProvider("hub") as SeedProvider;

describe("permission mapping", () => {
  it("maps each operation to the permission the brief specifies", () => {
    expect(permissionForOperation("validate")).toBe("seeds.view");
    expect(permissionForOperation("status")).toBe("seeds.view");
    expect(permissionForOperation("seed")).toBe("seeds.execute");
    expect(permissionForOperation("reconcile")).toBe("seeds.execute");
    expect(permissionForOperation("remove")).toBe("seeds.remove");
  });
});

describe("authorizeOperation", () => {
  const base = { environment: "development" as const, now: NOW, env: {} };

  it("requires seeds.view even to read status", () => {
    const decision = authorizeOperation({
      ...base,
      actor: actor({ permissions: [] }),
      provider: timelineai,
      operation: "status",
    });
    expect(decision).toMatchObject({ allowed: false, code: "MISSING_VIEW" });
  });

  it("requires seeds.execute for seed and reconcile", () => {
    for (const operation of ["seed", "reconcile"] as const) {
      const decision = authorizeOperation({
        ...base,
        actor: actor({ permissions: ["seeds.view"] }),
        provider: timelineai,
        operation,
      });
      expect(decision).toMatchObject({ allowed: false, code: "MISSING_PERMISSION" });
    }
  });

  it("requires seeds.remove for removal, even with seeds.execute", () => {
    const decision = authorizeOperation({
      ...base,
      actor: actor({ permissions: ["seeds.view", "seeds.execute"] }),
      provider: timelineai,
      operation: "remove",
    });
    expect(decision).toMatchObject({ allowed: false, code: "MISSING_PERMISSION" });
  });

  it("allows a permitted non-production seed", () => {
    expect(
      authorizeOperation({ ...base, actor: actor(), provider: timelineai, operation: "seed" })
    ).toEqual({ allowed: true });
  });

  it("refuses every operation against an unconfigured provider", () => {
    for (const operation of ["validate", "status", "seed", "reconcile", "remove"] as const) {
      expect(
        authorizeOperation({ ...base, actor: actor(), provider: hub, operation })
      ).toMatchObject({ allowed: false, code: "NOT_CONFIGURED" });
    }
  });

  it("refuses an operation the provider does not support", () => {
    const testora = getProvider("testora") as SeedProvider;
    expect(
      authorizeOperation({ ...base, actor: actor(), provider: testora, operation: "seed" })
    ).toMatchObject({ allowed: false, code: "UNSUPPORTED" });
  });
});

describe("platform foundation protection", () => {
  it("declares removal unsupported", () => {
    expect(foundation.protected).toBe(true);
    expect(foundation.supports.remove).toBe(false);
  });

  it("cannot be removed by a superadmin, in any environment, with production enabled", () => {
    for (const environment of ["development", "staging", "production"] as const) {
      const decision = authorizeOperation({
        actor: actor({ roles: ["superadmin"] }),
        provider: foundation,
        environment,
        operation: "remove",
        now: NOW,
        env: { SEED_MANAGER_PRODUCTION_ENABLED: "true" },
      });
      // Refused before permissions are even consulted.
      expect(decision.allowed).toBe(false);
    }
  });

  it("still allows seed and reconcile", () => {
    for (const operation of ["seed", "reconcile"] as const) {
      expect(
        authorizeOperation({
          actor: actor(),
          provider: foundation,
          environment: "development",
          operation,
          now: NOW,
          env: {},
        })
      ).toEqual({ allowed: true });
    }
  });

  it("throws from the provider itself if a removal ever reached it", async () => {
    const context = { environment: "development" as const, connectionString: "x", timeoutMs: 1000 };
    await expect(foundation.plan(context, "remove")).rejects.toThrow(/never be removed/i);
    await expect(
      foundation.execute(context, { operation: "remove" } as unknown as SeedPlan)
    ).rejects.toThrow(/never be removed/i);
  });
});

describe("production controls", () => {
  const production = { environment: "production" as const, operation: "seed" as const, now: NOW };

  it("is disabled by default", () => {
    expect(
      authorizeOperation({
        ...production,
        actor: actor({ roles: ["superadmin"] }),
        provider: timelineai,
        env: {},
      })
    ).toMatchObject({ allowed: false, code: "PRODUCTION_DISABLED" });
  });

  it("stays disabled for any value other than the exact opt-in string", () => {
    for (const value of ["1", "yes", "TRUE", "true "]) {
      expect(
        authorizeOperation({
          ...production,
          actor: actor({ roles: ["superadmin"] }),
          provider: timelineai,
          env: { SEED_MANAGER_PRODUCTION_ENABLED: value },
        })
      ).toMatchObject({ allowed: false, code: "PRODUCTION_DISABLED" });
    }
  });

  it("requires superadmin even when enabled and fully permissioned", () => {
    expect(
      authorizeOperation({
        ...production,
        actor: actor({ roles: ["admin"] }),
        provider: timelineai,
        env: { SEED_MANAGER_PRODUCTION_ENABLED: "true" },
      })
    ).toMatchObject({ allowed: false, code: "PRODUCTION_REQUIRES_SUPERADMIN" });
  });

  it("requires a fresh session", () => {
    expect(
      authorizeOperation({
        ...production,
        actor: actor({
          roles: ["superadmin"],
          sessionIssuedAtMs: NOW - FRESH_SESSION_MAX_AGE_MS - 1,
        }),
        provider: timelineai,
        env: { SEED_MANAGER_PRODUCTION_ENABLED: "true" },
      })
    ).toMatchObject({ allowed: false, code: "STALE_SESSION" });
  });

  it("allows a superadmin with a fresh session on an enabled server", () => {
    expect(
      authorizeOperation({
        ...production,
        actor: actor({ roles: ["superadmin"] }),
        provider: timelineai,
        env: { SEED_MANAGER_PRODUCTION_ENABLED: "true" },
      })
    ).toEqual({ allowed: true });
  });

  it("does not gate read-only operations behind production enablement", () => {
    expect(
      authorizeOperation({
        actor: actor({ roles: ["admin"] }),
        provider: timelineai,
        environment: "production",
        operation: "status",
        now: NOW,
        env: {},
      })
    ).toEqual({ allowed: true });
  });
});

describe("bulk destruction", () => {
  it("requires superadmin regardless of an explicit seeds.remove grant", () => {
    expect(
      authorizeOperation({
        actor: actor({ roles: ["admin"] }),
        provider: timelineai,
        environment: "development",
        operation: "remove",
        bulk: true,
        now: NOW,
        env: {},
      })
    ).toMatchObject({ allowed: false, code: "BULK_REQUIRES_SUPERADMIN" });
  });
});

describe("typed confirmation", () => {
  it("is specific to the operation, provider and environment", () => {
    expect(confirmationPhrase("seed", timelineai, "staging")).toBe("SEED TIMELINEAI STAGING");
    expect(confirmationPhrase("reconcile", getProvider("testora")!, "production")).toBe(
      "RECONCILE TESTORA PRODUCTION"
    );
    expect(confirmationPhrase("remove", getProvider("edumatch")!, "development")).toBe(
      "REMOVE EDUMATCH DEVELOPMENT"
    );
  });

  it("uses a stronger phrase for bulk removal", () => {
    expect(bulkConfirmationPhrase("remove", "staging")).toBe(
      "REMOVE ALL SEEDED DATA FROM STAGING"
    );
  });

  it("does not accept a phrase for a different target", () => {
    const expected = confirmationPhrase("remove", timelineai, "production");
    expect(confirmationMatches(confirmationPhrase("remove", timelineai, "staging"), expected)).toBe(
      false
    );
  });

  it("tolerates only casing and whitespace differences", () => {
    const expected = confirmationPhrase("seed", timelineai, "staging");
    expect(confirmationMatches("  seed   timelineai staging ", expected)).toBe(true);
    expect(confirmationMatches("seed timelineai", expected)).toBe(false);
  });

  it("states that no backup or restore point is created", () => {
    expect(NO_BACKUP_NOTICE).toBe(
      "No automatic backup or restore point will be created."
    );
  });
});

describe("approved plan revalidation", () => {
  function plan(overrides: Partial<SeedPlan> = {}): SeedPlan {
    const changes = [
      { seedKey: "timelineai.timelines", entity: "Demo timelines", action: "insert" as const, count: 3 },
    ];
    return {
      providerId: "timelineai",
      environment: "development",
      operation: "seed",
      planId: "plan-1",
      checksum: planChecksum({
        providerId: "timelineai",
        environment: "development",
        operation: "seed",
        definitionChecksum: "abc",
        changes,
      }),
      definitionVersion: "1.1.0",
      definitionChecksum: "abc",
      changes,
      inserts: 3,
      updates: 0,
      deletes: 0,
      retained: 0,
      blocked: [],
      warnings: [],
      createdAt: new Date(NOW).toISOString(),
      expiresAt: new Date(NOW + PLAN_TTL_MS).toISOString(),
      ...overrides,
    };
  }

  it("accepts an unchanged plan inside its window", () => {
    expect(verifyApprovedPlan(plan(), plan(), NOW + 1000)).toEqual({ ok: true });
  });

  it("refuses an expired plan", () => {
    expect(verifyApprovedPlan(plan(), plan(), NOW + PLAN_TTL_MS + 1)).toMatchObject({
      ok: false,
      code: "EXPIRED",
    });
  });

  it("refuses when the recomputed plan differs", () => {
    const moved = plan({
      changes: [
        { seedKey: "timelineai.timelines", entity: "Demo timelines", action: "insert", count: 1 },
      ],
    });
    moved.checksum = planChecksum({
      providerId: "timelineai",
      environment: "development",
      operation: "seed",
      definitionChecksum: "abc",
      changes: moved.changes,
    });
    expect(verifyApprovedPlan(plan(), moved, NOW + 1000)).toMatchObject({
      ok: false,
      code: "CHECKSUM_MISMATCH",
    });
  });

  it("refuses a plan approved for a different target", () => {
    expect(
      verifyApprovedPlan(plan(), plan({ environment: "production" }), NOW + 1000)
    ).toMatchObject({ ok: false, code: "TARGET_MISMATCH" });
  });
});

describe("no backup or restore surface exists", () => {
  it("offers no backup or restore operation on any provider", () => {
    for (const provider of [foundation, timelineai, getProvider("edumatch")!]) {
      const keys = Object.keys(provider.supports);
      expect(keys.some((key) => /backup|restore|snapshot/i.test(key))).toBe(false);
    }
  });
});
