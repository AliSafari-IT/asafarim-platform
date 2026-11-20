import { mkdtempSync, readdirSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { readFileSync } from "node:fs";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

/**
 * Races on the CV photo (saves from two tabs, a save during a delete or an
 * erasure) against a real database and local object storage. The rule:
 * however they interleave, every stored object is named by the row and no
 * row names a missing object. Guarded behind RESUMATCH_TEST_DATABASE_URL:
 *
 *   RESUMATCH_TEST_DATABASE_URL=postgresql://... \
 *     pnpm --filter @asafarim/resumatch exec vitest run --config vitest.integration.config.ts lib/profile/photoStore.race.integration.test.ts
 */

const TEST_DB = process.env.RESUMATCH_TEST_DATABASE_URL;
if (TEST_DB) process.env.RESUMATCH_DATABASE_URL = TEST_DB;
const STORAGE_DIR = mkdtempSync(join(tmpdir(), "rm-photo-race-"));
process.env.STORAGE_LOCAL_DIR = STORAGE_DIR;

const PHOTO = new Uint8Array(
  readFileSync(
    join(__dirname, "../../fixtures/photo/square-300-progressive.jpg")
  )
);

describe.skipIf(!TEST_DB)("CV photo races", () => {
  let db: import("../db/generated").PrismaClient;
  let store: typeof import("./photoStore");
  let eraseWorkspaceData: typeof import("./dataRights").eraseWorkspaceData;
  let workspaceId: string;

  /** Stored photo objects (local storage keeps a .json sidecar per object). */
  const objects = () =>
    readdirSync(STORAGE_DIR).filter(
      (name) => name.includes("profile-photos") && !name.endsWith(".json")
    );
  const rowKey = async () =>
    (
      await db.profilePhoto.findUnique({
        where: { workspaceId },
        select: { storageKey: true },
      })
    )?.storageKey ?? null;

  beforeAll(async () => {
    store = await import("./photoStore");
    ({ eraseWorkspaceData } = await import("./dataRights"));
    db = (await import("../db/client")).getJobmatchDb();
    workspaceId = (
      await db.workspace.create({
        data: { platformUserId: `photo-race-${Date.now()}` },
      })
    ).id;
  });

  afterAll(async () => {
    if (db && workspaceId)
      await db.workspace.deleteMany({ where: { id: workspaceId } });
  });

  it("parallel first uploads and replacements leave exactly one object, the one the row names", async () => {
    await Promise.all(
      [1, 2, 3, 4].map(() => store.saveProfilePhoto(workspaceId, PHOTO))
    );
    const key = await rowKey();
    expect(key).not.toBeNull();
    expect(objects()).toHaveLength(1);
    expect(objects()[0]).toContain(workspaceId);

    await Promise.all(
      [1, 2, 3].map(() => store.saveProfilePhoto(workspaceId, PHOTO))
    );
    expect(objects()).toHaveLength(1);
    expect(await rowKey()).not.toBe(key);
  });

  it("a save racing a delete never leaves an object without a row, or a row without its object", async () => {
    for (let round = 0; round < 5; round += 1) {
      await store.saveProfilePhoto(workspaceId, PHOTO);
      await Promise.all([
        store.deleteProfilePhoto(workspaceId),
        store.saveProfilePhoto(workspaceId, PHOTO),
      ]);
      const key = await rowKey();
      expect(objects().length, `round ${round}`).toBe(key ? 1 : 0);
    }
  });

  it("a save racing an erasure keeps storage and rows consistent", async () => {
    await store.saveProfilePhoto(workspaceId, PHOTO);
    await Promise.all([
      eraseWorkspaceData(workspaceId),
      store.saveProfilePhoto(workspaceId, PHOTO),
    ]);
    const key = await rowKey();
    expect(objects().length).toBe(key ? 1 : 0);
    await store.deleteProfilePhoto(workspaceId);
    expect(objects()).toHaveLength(0);
    expect(await rowKey()).toBeNull();
  });
});
