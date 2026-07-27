import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { ROLES } from "@asafarim/auth/roles";
import {
  closeTestDb,
  getTestDb,
  migrateTestDb,
  resetTestDb,
} from "../db/testUtils";
import { createApp } from "../repositories/apps";
import { ForbiddenError } from "../errors";
import { QuotaExceededError } from "./errors";
import { checkQuotaSnapshot } from "./enforce";
import { countActiveAppsForOwner } from "./usage";
import {
  resolveQuotaLimit,
  revokeQuotaOverride,
  setQuotaOverride,
} from "./overrides";

const db = getTestDb();

const owner = { principalId: "quota-owner", roles: [] };
const otherOwner = { principalId: "quota-owner-2", roles: [] };
const superadmin = {
  principalId: "quota-superadmin",
  roles: [ROLES.SUPERADMIN],
};

beforeAll(async () => {
  await migrateTestDb();
});

beforeEach(async () => {
  await resetTestDb();
});

afterAll(async () => {
  await closeTestDb();
});

/**
 * These tests exercise the REAL `createApp` repository function (not a toy
 * reimplementation of `withQuota`) against a real Postgres instance, firing
 * genuinely concurrent requests — the scenario a bare `SELECT count(*)`
 * check cannot survive (see lib/quotas/enforce.ts's docstring). This is the
 * M12 acceptance criterion "quota enforcement is race-safe and cannot be
 * bypassed by retries" being verified directly, not just asserted.
 */
describe("quota race-safety (apps_per_owner via createApp)", () => {
  it("admits EXACTLY the overridden limit under real concurrent load, never more", async () => {
    await setQuotaOverride(db, superadmin, {
      scopeType: "owner",
      scopeId: owner.principalId,
      metric: "apps_per_owner",
      limitValue: 3,
      reason: "test: tight cap to observe race behavior",
    });

    const attempts = 10;
    const results = await Promise.allSettled(
      Array.from({ length: attempts }, (_, i) =>
        createApp(
          db,
          owner,
          { name: `Race App ${i}`, slug: `race-app-${i}` },
          `race-key-${i}`
        )
      )
    );

    const fulfilled = results.filter((r) => r.status === "fulfilled");
    const rejected = results.filter(
      (r) => r.status === "rejected"
    ) as PromiseRejectedResult[];

    expect(fulfilled).toHaveLength(3);
    expect(rejected).toHaveLength(attempts - 3);
    for (const r of rejected) {
      expect(r.reason).toBeInstanceOf(QuotaExceededError);
      expect((r.reason as QuotaExceededError).metric).toBe("apps_per_owner");
    }

    // The durable source of truth agrees with what the concurrent calls
    // observed — no "phantom" extra row snuck in past the lock.
    const finalCount = await countActiveAppsForOwner(db, owner.principalId);
    expect(finalCount).toBe(3);
  });

  it("never blocks a genuine retry of an already-completed request, even once the quota is fully exhausted", async () => {
    await setQuotaOverride(db, superadmin, {
      scopeType: "owner",
      scopeId: owner.principalId,
      metric: "apps_per_owner",
      limitValue: 1,
      reason: "test: retry-vs-quota",
    });

    const first = await createApp(
      db,
      owner,
      { name: "Only App", slug: "only-app" },
      "retry-key"
    );
    expect(first.slug).toBe("only-app");

    // Quota is now fully consumed (limit 1, 1 active app) — a genuinely NEW
    // request must be rejected...
    await expect(
      createApp(
        db,
        owner,
        { name: "Second App", slug: "second-app" },
        "different-key"
      )
    ).rejects.toBeInstanceOf(QuotaExceededError);

    // ...but retrying the ORIGINAL request (same idempotency key) must
    // still succeed by replaying the original row, never re-entering (and
    // therefore never re-failing) the quota check.
    const retried = await createApp(
      db,
      owner,
      { name: "Only App", slug: "only-app" },
      "retry-key"
    );
    expect(retried.id).toBe(first.id);

    expect(await countActiveAppsForOwner(db, owner.principalId)).toBe(1);
  });

  it("scopes the quota per owner — a different owner is unaffected by another owner's exhausted quota", async () => {
    await setQuotaOverride(db, superadmin, {
      scopeType: "owner",
      scopeId: owner.principalId,
      metric: "apps_per_owner",
      limitValue: 1,
      reason: "test: per-owner scoping",
    });

    await createApp(
      db,
      owner,
      { name: "Owner App", slug: "owner-app" },
      "owner-key"
    );
    await expect(
      createApp(
        db,
        owner,
        { name: "Owner App 2", slug: "owner-app-2" },
        "owner-key-2"
      )
    ).rejects.toBeInstanceOf(QuotaExceededError);

    // A different owner, no override set, uses the platform default and
    // succeeds normally.
    const otherApp = await createApp(
      db,
      otherOwner,
      { name: "Other Owner App", slug: "other-owner-app" },
      "other-key"
    );
    expect(otherApp.slug).toBe("other-owner-app");
  });
});

describe("quota overrides", () => {
  it("raises the effective limit once granted, and reverts to the default once revoked", async () => {
    const beforeOverride = await resolveQuotaLimit(
      db,
      "owner",
      owner.principalId,
      "apps_per_owner"
    );

    const granted = await setQuotaOverride(db, superadmin, {
      scopeType: "owner",
      scopeId: owner.principalId,
      metric: "apps_per_owner",
      limitValue: beforeOverride + 50,
      reason: "test: temporary capacity increase",
    });

    expect(
      await resolveQuotaLimit(db, "owner", owner.principalId, "apps_per_owner")
    ).toBe(beforeOverride + 50);

    await revokeQuotaOverride(db, superadmin, granted.id);
    expect(
      await resolveQuotaLimit(db, "owner", owner.principalId, "apps_per_owner")
    ).toBe(beforeOverride);
  });

  it("refuses a non-superadmin actor", async () => {
    await expect(
      setQuotaOverride(db, owner, {
        scopeType: "owner",
        scopeId: owner.principalId,
        metric: "apps_per_owner",
        limitValue: 999,
        reason: "self-granted — must be refused",
      })
    ).rejects.toBeInstanceOf(ForbiddenError);
  });

  it("an expired override is ignored", async () => {
    const beforeOverride = await resolveQuotaLimit(
      db,
      "owner",
      owner.principalId,
      "apps_per_owner"
    );
    await setQuotaOverride(db, superadmin, {
      scopeType: "owner",
      scopeId: owner.principalId,
      metric: "apps_per_owner",
      limitValue: beforeOverride + 100,
      reason: "test: already-expired override",
      expiresAt: new Date(Date.now() - 60_000),
    });

    expect(
      await resolveQuotaLimit(db, "owner", owner.principalId, "apps_per_owner")
    ).toBe(beforeOverride);
  });
});

describe("checkQuotaSnapshot", () => {
  it("reports current/limit/exceeded without mutating anything", async () => {
    await setQuotaOverride(db, superadmin, {
      scopeType: "owner",
      scopeId: owner.principalId,
      metric: "apps_per_owner",
      limitValue: 2,
      reason: "test: snapshot",
    });
    await createApp(
      db,
      owner,
      { name: "Snapshot App", slug: "snapshot-app" },
      "snapshot-key"
    );

    const snapshot = await checkQuotaSnapshot(
      db,
      owner.principalId,
      "apps_per_owner",
      () => countActiveAppsForOwner(db, owner.principalId)
    );
    expect(snapshot).toEqual({
      metric: "apps_per_owner",
      limit: 2,
      current: 1,
      exceeded: false,
    });

    await createApp(
      db,
      owner,
      { name: "Snapshot App 2", slug: "snapshot-app-2" },
      "snapshot-key-2"
    );
    const exhausted = await checkQuotaSnapshot(
      db,
      owner.principalId,
      "apps_per_owner",
      () => countActiveAppsForOwner(db, owner.principalId)
    );
    expect(exhausted.exceeded).toBe(true);
  });
});
