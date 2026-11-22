import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { ContactPreferences } from "./contract";

/**
 * Saving, reading and clearing contact preferences (#940) against a real
 * database, plus export and erasure. Guarded behind
 * `RESUMATCH_TEST_DATABASE_URL`; `pnpm test` never touches a database.
 */

const TEST_DB = process.env.RESUMATCH_TEST_DATABASE_URL;
if (TEST_DB) process.env.RESUMATCH_DATABASE_URL = TEST_DB;

const PREFS: ContactPreferences = {
  callWindows: [{ days: [1, 2, 3, 4, 5], start: "16:00", end: "18:00" }],
  timeZone: "Europe/Brussels",
  outsideHours: "arrange",
  unavailable: [],
  email: true,
  whatsapp: true,
};

describe.skipIf(!TEST_DB)("contact preferences store", () => {
  let db: import("../db/generated").PrismaClient;
  let store: typeof import("./store");
  let rights: typeof import("../profile/dataRights");
  const workspaceIds: string[] = [];

  async function workspace(): Promise<string> {
    const ws = await db.workspace.create({ data: { platformUserId: `contact-test-${randomUUID()}` }, select: { id: true } });
    workspaceIds.push(ws.id);
    return ws.id;
  }

  beforeAll(async () => {
    store = await import("./store");
    rights = await import("../profile/dataRights");
    db = (await import("../db/client")).getJobmatchDb();
  });

  afterAll(async () => {
    if (!db || workspaceIds.length === 0) return;
    await db.workspace.deleteMany({ where: { id: { in: workspaceIds } } });
  });

  it("is null until saved, then reads back, updates in place and clears", async () => {
    const id = await workspace();
    expect(await store.getContactPreferences(id)).toBeNull();

    await store.saveContactPreferences(id, PREFS);
    expect(await store.getContactPreferences(id)).toEqual(PREFS);

    const changed = { ...PREFS, whatsapp: false };
    await store.saveContactPreferences(id, changed);
    expect(await store.getContactPreferences(id)).toEqual(changed);
    expect(await db.contactPreferences.count({ where: { workspaceId: id } })).toBe(1);

    await store.saveContactPreferences(id, null);
    expect(await store.getContactPreferences(id)).toBeNull();
    // Clearing twice is harmless.
    await store.saveContactPreferences(id, null);
  });

  it("keeps each workspace's preferences to itself", async () => {
    const mine = await workspace();
    const theirs = await workspace();
    await store.saveContactPreferences(mine, PREFS);
    expect(await store.getContactPreferences(theirs)).toBeNull();
  });

  it("reads stored content that no longer parses as none", async () => {
    const id = await workspace();
    await db.contactPreferences.create({ data: { workspaceId: id, content: { callWindows: "nonsense" } } });
    expect(await store.getContactPreferences(id)).toBeNull();
  });

  it("is included in the data export and deleted on erasure", async () => {
    const id = await workspace();
    await store.saveContactPreferences(id, PREFS);

    const exported = await rights.exportWorkspaceData(id);
    expect(exported?.contactPreferences?.content).toEqual(PREFS);
    expect(exported?.emailDraftContacts).toEqual([]);

    await rights.eraseWorkspaceData(id);
    expect(await db.contactPreferences.count({ where: { workspaceId: id } })).toBe(0);
    expect((await rights.exportWorkspaceData(id))?.contactPreferences ?? null).toBeNull();
  });
});
