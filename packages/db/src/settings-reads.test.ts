import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("./client", () => ({
  prisma: {
    platformSetting: { findUnique: vi.fn(), findMany: vi.fn() },
    user: { findUnique: vi.fn(), findMany: vi.fn() },
  },
}));

import { prisma } from "./client";
import {
  getBooleanSetting,
  getEffectiveSetting,
  getNumberSetting,
  getSetting,
  getSettingOverrides,
} from "./settings";

beforeEach(() => {
  vi.mocked(prisma.platformSetting.findUnique).mockReset();
  vi.mocked(prisma.user.findUnique).mockReset();
});

describe("getEffectiveSetting", () => {
  it("returns undefined for a key not in the catalog", async () => {
    expect(await getEffectiveSetting("not.a.real.key")).toBeUndefined();
    expect(prisma.platformSetting.findUnique).not.toHaveBeenCalled();
  });

  it("falls back to the catalog default when no row exists", async () => {
    vi.mocked(prisma.platformSetting.findUnique).mockResolvedValue(null);

    const effective = await getEffectiveSetting("registration.open");

    expect(effective?.value).toBe(true); // catalog default
    expect(effective?.overridden).toBe(false);
  });

  it("uses the stored row when present and valid", async () => {
    vi.mocked(prisma.platformSetting.findUnique).mockResolvedValue({
      value: false,
      updatedAt: new Date("2026-01-01"),
      updatedBy: "user-1",
    } as never);
    vi.mocked(prisma.user.findUnique).mockResolvedValue({ email: "a@b.com" } as never);

    const effective = await getEffectiveSetting("registration.open");

    expect(effective?.value).toBe(false);
    expect(effective?.overridden).toBe(true);
    expect(effective?.updatedByEmail).toBe("a@b.com");
  });
});

describe("getSetting", () => {
  it("throws for an unknown key", async () => {
    await expect(getSetting("not.a.real.key")).rejects.toThrow(/Unknown setting key/);
  });

  it("resolves the catalog default when unset", async () => {
    vi.mocked(prisma.platformSetting.findUnique).mockResolvedValue(null);
    expect(await getSetting("registration.open")).toBe(true);
  });
});

describe("getBooleanSetting", () => {
  it("returns the stored value when it matches", async () => {
    vi.mocked(prisma.platformSetting.findUnique).mockResolvedValue({
      value: false,
      updatedAt: new Date(),
      updatedBy: null,
    } as never);
    expect(await getBooleanSetting("registration.open", true)).toBe(false);
  });

  it("returns the fallback for an unknown key instead of throwing", async () => {
    expect(await getBooleanSetting("not.a.real.key", true)).toBe(true);
  });

  it("returns the fallback when the stored/catalog value isn't a boolean", async () => {
    vi.mocked(prisma.platformSetting.findUnique).mockResolvedValue(null);
    // platform.tagline is a string-typed setting.
    expect(await getBooleanSetting("platform.tagline", false)).toBe(false);
  });

  it("returns the fallback when the database call rejects", async () => {
    vi.mocked(prisma.platformSetting.findUnique).mockRejectedValue(new Error("db down"));
    expect(await getBooleanSetting("registration.open", false)).toBe(false);
  });
});

describe("getNumberSetting", () => {
  it("returns the stored value when it matches", async () => {
    vi.mocked(prisma.platformSetting.findUnique).mockResolvedValue({
      value: 50,
      updatedAt: new Date(),
      updatedBy: null,
    } as never);
    expect(await getNumberSetting("console.pageSize", 20)).toBe(50);
  });

  it("returns the fallback when the database call rejects", async () => {
    vi.mocked(prisma.platformSetting.findUnique).mockRejectedValue(new Error("db down"));
    expect(await getNumberSetting("console.pageSize", 20)).toBe(20);
  });
});

describe("getSettingOverrides", () => {
  it("returns only rows an admin set, one query for all keys", async () => {
    vi.mocked(prisma.platformSetting.findMany).mockResolvedValue([
      { key: "email.smtp.from", value: "Console <a@b.com>" },
      { key: "email.smtp.port", value: 587 },
    ] as never);
    const map = await getSettingOverrides(["email.smtp.from", "email.smtp.port", "email.smtp.host"]);
    expect(prisma.platformSetting.findMany).toHaveBeenCalledTimes(1);
    expect(Object.fromEntries(map)).toEqual({ "email.smtp.from": "Console <a@b.com>", "email.smtp.port": 587 });
    expect(map.has("email.smtp.host")).toBe(false); // unset: absent, not the catalog default
  });

  it("drops rows that no longer match their definition, and unknown keys", async () => {
    vi.mocked(prisma.platformSetting.findMany).mockResolvedValue([
      { key: "email.smtp.port", value: "not-a-number" },
      { key: "not.in.catalog", value: 1 },
    ] as never);
    expect((await getSettingOverrides(["email.smtp.port", "not.in.catalog"])).size).toBe(0);
  });

  it("drops a secret whose stored value isn't an encrypted envelope", async () => {
    vi.mocked(prisma.platformSetting.findMany).mockResolvedValue([
      { key: "email.smtp.password", value: "plaintext-should-never-be-stored" },
    ] as never);
    expect((await getSettingOverrides(["email.smtp.password"])).size).toBe(0);
  });
});
