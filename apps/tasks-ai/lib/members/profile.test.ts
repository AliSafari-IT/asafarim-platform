import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  CLEARED_PROFILE,
  errorCode,
  memberLabel,
  profileSnapshot,
  resetReportedSyncFailures,
  syncMemberProfile,
  syncMemberProfileSafely,
} from "./profile";

/** A fake db that records membership updates (only what the module uses). */
function fakeDb(update: (args: unknown) => Promise<unknown> = async () => ({})) {
  const calls: unknown[] = [];
  const db = {
    membership: {
      update: vi.fn(async (args: unknown) => {
        calls.push(args);
        return update(args);
      }),
    },
  };
  // The module only touches db.membership.update.
  return { db: db as unknown as Parameters<typeof syncMemberProfile>[0], calls };
}

describe("profileSnapshot", () => {
  it("trims and bounds the name; keeps only http(s) avatars", () => {
    expect(profileSnapshot({ name: "  Ada Lovelace  ", image: "https://cdn.example/a.png" })).toEqual({
      displayName: "Ada Lovelace",
      avatarUrl: "https://cdn.example/a.png",
    });
    expect(profileSnapshot({ name: "x".repeat(500) }).displayName).toHaveLength(120);
    expect(profileSnapshot({ image: "javascript:alert(1)" }).avatarUrl).toBeNull();
    expect(profileSnapshot({ image: "data:image/png;base64,AAAA" }).avatarUrl).toBeNull();
    expect(profileSnapshot({ image: `https://e.x/${"a".repeat(2000)}` }).avatarUrl).toBeNull();
    expect(profileSnapshot({ name: "   ", image: null })).toEqual({ displayName: null, avatarUrl: null });
  });
});

describe("memberLabel", () => {
  it("shows the snapshot name, otherwise 'Member ·' + a membership-id suffix — never the platform id", () => {
    expect(memberLabel({ id: "mem_abcdef1234", displayName: "Ada" })).toBe("Ada");
    expect(memberLabel({ id: "mem_abcdef1234", displayName: "  " })).toBe("Member ·1234");
    expect(memberLabel({ id: "mem_abcdef1234" })).toBe("Member ·1234");
    const member = { id: "mem_0001", displayName: null, platformUserId: "seed-tasksai-test-owner" };
    expect(memberLabel(member)).not.toContain(member.platformUserId);
  });
});

describe("syncMemberProfile", () => {
  it("writes when the session's name or image changed", async () => {
    const { db, calls } = fakeDb();
    const wrote = await syncMemberProfile(db, { id: "m1", displayName: "Old", avatarUrl: null }, { name: "New" });
    expect(wrote).toBe(true);
    expect(calls).toEqual([
      { where: { id: "m1" }, data: { displayName: "New", avatarUrl: null, profileSyncedAt: expect.any(Date) } },
    ]);
  });

  it("doesn't write when nothing changed", async () => {
    const { db, calls } = fakeDb();
    const m = { id: "m1", displayName: "Ada", avatarUrl: "https://cdn.example/a.png" };
    expect(await syncMemberProfile(db, m, { name: " Ada ", image: "https://cdn.example/a.png" })).toBe(false);
    expect(calls).toHaveLength(0);
  });

  it("doesn't erase a stored snapshot when the session carries nothing", async () => {
    const { db, calls } = fakeDb();
    expect(await syncMemberProfile(db, { id: "m1", displayName: "Ada" }, { name: null, image: null })).toBe(false);
    expect(calls).toHaveLength(0);
  });
});

describe("syncMemberProfileSafely", () => {
  beforeEach(() => resetReportedSyncFailures());

  it("returns the sync result when it works, and logs nothing", async () => {
    const { db } = fakeDb();
    const log = { warn: vi.fn() };
    expect(await syncMemberProfileSafely(db, { id: "m1" }, { name: "Ada" }, log)).toBe(true);
    expect(log.warn).not.toHaveBeenCalled();
  });

  it("never throws; logs once per membership with the id and error code only — no personal data", async () => {
    const failure = Object.assign(new Error('update failed for displayName "Ada Lovelace"'), { code: "P2025" });
    const { db } = fakeDb(async () => {
      throw failure;
    });
    const log = { warn: vi.fn() };
    const m = { id: "m1", displayName: null };
    expect(await syncMemberProfileSafely(db, m, { name: "Ada Lovelace", image: "https://cdn.example/a.png" }, log)).toBe(false);
    expect(await syncMemberProfileSafely(db, m, { name: "Ada Lovelace" }, log)).toBe(false);
    expect(log.warn).toHaveBeenCalledTimes(1);
    expect(log.warn).toHaveBeenCalledWith({ membershipId: "m1", error: "P2025" }, "member profile snapshot refresh failed");
    const logged = JSON.stringify(log.warn.mock.calls);
    expect(logged).not.toContain("Ada");
    expect(logged).not.toContain("cdn.example");
    // Another membership is reported separately.
    await syncMemberProfileSafely(db, { id: "m2" }, { name: "Grace" }, log);
    expect(log.warn).toHaveBeenCalledTimes(2);
  });

  it("reduces any error to a code or name", () => {
    expect(errorCode(Object.assign(new Error("x"), { code: "P1001" }))).toBe("P1001");
    expect(errorCode(new TypeError("boom"))).toBe("TypeError");
    expect(errorCode("a string")).toBe("unknown");
    expect(errorCode(null)).toBe("unknown");
  });
});

describe("CLEARED_PROFILE", () => {
  it("empties every snapshot field", () => {
    expect(CLEARED_PROFILE).toEqual({ displayName: null, avatarUrl: null, profileSyncedAt: null });
  });
});
