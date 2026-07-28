import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import { ROLES } from "@asafarim/auth/roles";
import {
  closeTestDb,
  getTestDb,
  migrateTestDb,
  resetTestDb,
} from "../db/testUtils";
import { createApp } from "../repositories/apps";
import { operationalEvents } from "../db/schema";
import { setQuotaOverride } from "../quotas/overrides";
import { QuotaExceededError } from "../quotas/errors";

const db = getTestDb();
const owner = { principalId: "events-owner", roles: [] };
const superadmin = {
  principalId: "events-superadmin",
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

describe("withQuotaRejectionLogging (via createApp)", () => {
  it("durably records a quota.rejected operational event even though the triggering transaction rolled back", async () => {
    await setQuotaOverride(db, superadmin, {
      scopeType: "owner",
      scopeId: owner.principalId,
      metric: "apps_per_owner",
      limitValue: 1,
      reason: "test: observe rejection event",
    });

    await createApp(
      db,
      owner,
      { name: "App One", slug: "events-app-one" },
      "events-key-1"
    );

    await expect(
      createApp(
        db,
        owner,
        { name: "App Two", slug: "events-app-two" },
        "events-key-2"
      )
    ).rejects.toBeInstanceOf(QuotaExceededError);

    // The rejected app's own INSERT never committed (the transaction rolled
    // back) — but the observability event about the rejection itself,
    // recorded on the outer `db` handle, did.
    const events = await db
      .select()
      .from(operationalEvents)
      .where(eq(operationalEvents.kind, "quota.rejected"));
    expect(events).toHaveLength(1);
    expect(events[0].category).toBe("runtime");
    expect(events[0].actorPrincipalId).toBe(owner.principalId);
    expect(events[0].detail).toMatchObject({
      metric: "apps_per_owner",
      limit: 1,
      current: 1,
    });
  });
});
