import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));

vi.mock("@asafarim/db", () => ({
  prisma: {
    platformSetting: { findUnique: vi.fn(), upsert: vi.fn(), delete: vi.fn() },
    auditLog: { create: vi.fn() },
  },
  Prisma: {},
  encryptSecret: vi.fn((plaintext: string) => `encrypted(${plaintext})`),
}));

vi.mock("@asafarim/auth", () => ({
  ROLES: { SUPERADMIN: "superadmin", ADMIN: "admin" },
  getSession: vi.fn(),
  hasRole: vi.fn(() => true),
  hasPermission: vi.fn(async () => true),
}));

import { prisma, encryptSecret } from "@asafarim/db";
import { getSession } from "@asafarim/auth";
import { updatePlatformSetting } from "./actions";

const SECRET_KEY = "ai.openaiApiKey";

// A secret setting definition to exercise, added purely for this test's
// scope guard — settings.ts's own catalog is asserted separately.
vi.mock("../../../lib/settings", async () => {
  const actual = await vi.importActual<typeof import("../../../lib/settings")>(
    "../../../lib/settings"
  );
  return {
    ...actual,
    getSettingDefinition: (key: string) =>
      key === SECRET_KEY
        ? {
            key: SECRET_KEY,
            label: "OpenAI API key",
            description: "test",
            group: "operations",
            scope: "platform",
            type: "secret",
            defaultValue: "",
          }
        : actual.getSettingDefinition(key),
  };
});

beforeEach(() => {
  vi.mocked(getSession).mockResolvedValue({
    user: { id: "admin-1", isActive: true },
  } as never);
  vi.mocked(prisma.platformSetting.findUnique).mockReset();
  vi.mocked(prisma.platformSetting.upsert).mockReset().mockResolvedValue({} as never);
  vi.mocked(prisma.auditLog.create).mockReset().mockResolvedValue({} as never);
  vi.mocked(encryptSecret).mockClear();
});

describe("updatePlatformSetting — secret type", () => {
  it("encrypts the plaintext before writing to the database", async () => {
    vi.mocked(prisma.platformSetting.findUnique).mockResolvedValue(null);

    const result = await updatePlatformSetting({
      key: SECRET_KEY,
      value: "sk_live_abc123",
    });

    expect(result.ok).toBe(true);
    expect(encryptSecret).toHaveBeenCalledWith("sk_live_abc123");
    const upsertCall = vi.mocked(prisma.platformSetting.upsert).mock.calls[0]?.[0] as {
      create: { value: string };
    };
    expect(upsertCall.create.value).toBe("encrypted(sk_live_abc123)");
  });

  it("rejects an empty submit instead of clearing the stored secret", async () => {
    vi.mocked(prisma.platformSetting.findUnique).mockResolvedValue({
      value: "encrypted(existing)",
    } as never);

    const result = await updatePlatformSetting({ key: SECRET_KEY, value: "" });

    expect(result.ok).toBe(false);
    expect(prisma.platformSetting.upsert).not.toHaveBeenCalled();
  });

  it("never writes the plaintext secret into the audit log", async () => {
    vi.mocked(prisma.platformSetting.findUnique).mockResolvedValue(null);

    await updatePlatformSetting({ key: SECRET_KEY, value: "sk_live_abc123" });

    const auditCall = vi.mocked(prisma.auditLog.create).mock.calls[0]?.[0] as {
      data: { changes: unknown };
    };
    const serialized = JSON.stringify(auditCall.data.changes);
    expect(serialized).not.toContain("sk_live_abc123");
    expect(serialized).not.toContain("encrypted(sk_live_abc123)");
  });
});
