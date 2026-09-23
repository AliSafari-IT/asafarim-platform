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
import { getSession, hasPermission } from "@asafarim/auth";
import { resetPlatformSetting, updatePlatformSetting } from "./actions";

const SECRET_KEY = "ai.openaiApiKey";
const JSON_KEY = "test.jsonSetting";
const SENSITIVE_KEY = "stripe.mode";
const PLAIN_KEY = "platform.tagline";

// Synthetic setting definitions to exercise, added purely for these tests —
// settings.ts's own catalog is asserted separately.
vi.mock("../../../lib/settings", async () => {
  const actual = await vi.importActual<typeof import("../../../lib/settings")>(
    "../../../lib/settings"
  );
  return {
    ...actual,
    getSettingDefinition: (key: string) => {
      if (key === SECRET_KEY) {
        return {
          key: SECRET_KEY,
          label: "OpenAI API key",
          description: "test",
          group: "operations",
          scope: "platform",
          type: "secret",
          defaultValue: "",
        };
      }
      if (key === JSON_KEY) {
        return {
          key: JSON_KEY,
          label: "Test JSON setting",
          description: "test",
          group: "operations",
          scope: "platform",
          type: "json",
          defaultValue: {},
        };
      }
      if (key === SENSITIVE_KEY) {
        return {
          key: SENSITIVE_KEY,
          label: "Stripe mode",
          description: "test",
          group: "operations",
          scope: "edumatch",
          type: "select",
          options: ["live", "test"],
          defaultValue: "test",
          sensitive: true,
        };
      }
      return actual.getSettingDefinition(key);
    },
  };
});

beforeEach(() => {
  vi.mocked(getSession).mockResolvedValue({
    user: { id: "admin-1", isActive: true },
  } as never);
  vi.mocked(prisma.platformSetting.findUnique).mockReset();
  vi.mocked(prisma.platformSetting.upsert).mockReset().mockResolvedValue({} as never);
  vi.mocked(prisma.platformSetting.delete).mockReset().mockResolvedValue({} as never);
  vi.mocked(prisma.auditLog.create).mockReset().mockResolvedValue({} as never);
  vi.mocked(encryptSecret).mockClear();
  vi.mocked(hasPermission).mockReset().mockResolvedValue(true);
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

  it("writes a masked, human-readable changes shape rather than the raw value", async () => {
    vi.mocked(prisma.platformSetting.findUnique).mockResolvedValue(null);

    await updatePlatformSetting({ key: SECRET_KEY, value: "sk_live_abc123" });

    const auditCall = vi.mocked(prisma.auditLog.create).mock.calls[0]?.[0] as {
      data: { changes: unknown };
    };
    expect(auditCall.data.changes).toEqual({ from: "(unset)", to: "(secret set)" });
  });

  it("resetPlatformSetting never writes the stored ciphertext into the audit log either", async () => {
    vi.mocked(prisma.platformSetting.findUnique).mockResolvedValue({
      value: "encrypted(sk_live_abc123)",
    } as never);

    await resetPlatformSetting({ key: SECRET_KEY });

    const auditCall = vi.mocked(prisma.auditLog.create).mock.calls[0]?.[0] as {
      data: { changes: unknown };
    };
    const serialized = JSON.stringify(auditCall.data.changes);
    expect(serialized).not.toContain("sk_live_abc123");
    expect(serialized).not.toContain("encrypted(");
    expect(auditCall.data.changes).toEqual({ from: "(secret set)", to: "(unset)" });
  });
});

describe("updatePlatformSetting — json type", () => {
  it("writes a valid object as-is", async () => {
    vi.mocked(prisma.platformSetting.findUnique).mockResolvedValue(null);

    const result = await updatePlatformSetting({
      key: JSON_KEY,
      value: { locale: "en", subject: "Welcome" },
    });

    expect(result.ok).toBe(true);
    const upsertCall = vi.mocked(prisma.platformSetting.upsert).mock.calls[0]?.[0] as {
      create: { value: unknown };
    };
    expect(upsertCall.create.value).toEqual({ locale: "en", subject: "Welcome" });
  });

  it("writes a valid array as-is", async () => {
    vi.mocked(prisma.platformSetting.findUnique).mockResolvedValue(null);

    const result = await updatePlatformSetting({ key: JSON_KEY, value: [1, 2, 3] });

    expect(result.ok).toBe(true);
    const upsertCall = vi.mocked(prisma.platformSetting.upsert).mock.calls[0]?.[0] as {
      create: { value: unknown };
    };
    expect(upsertCall.create.value).toEqual([1, 2, 3]);
  });

  it("rejects a bare primitive", async () => {
    vi.mocked(prisma.platformSetting.findUnique).mockResolvedValue(null);

    const result = await updatePlatformSetting({
      key: JSON_KEY,
      value: "not an object" as never,
    });

    expect(result.ok).toBe(false);
    expect(prisma.platformSetting.upsert).not.toHaveBeenCalled();
  });

  it("is a no-op when the submitted object is structurally identical to what's stored", async () => {
    vi.mocked(prisma.platformSetting.findUnique).mockResolvedValue({
      value: { locale: "en", subject: "Welcome" },
    } as never);

    const result = await updatePlatformSetting({
      key: JSON_KEY,
      value: { locale: "en", subject: "Welcome" },
    });

    expect(result.ok).toBe(true);
    expect(prisma.platformSetting.upsert).not.toHaveBeenCalled();
  });

  it("writes when the submitted object differs from what's stored", async () => {
    vi.mocked(prisma.platformSetting.findUnique).mockResolvedValue({
      value: { locale: "en", subject: "Welcome" },
    } as never);

    const result = await updatePlatformSetting({
      key: JSON_KEY,
      value: { locale: "en", subject: "Changed" },
    });

    expect(result.ok).toBe(true);
    expect(prisma.platformSetting.upsert).toHaveBeenCalledTimes(1);
  });
});

describe("permission tier — settings.secrets.{view,edit}", () => {
  it("checks settings.secrets.edit (not settings.edit) for a secret-typed setting", async () => {
    vi.mocked(prisma.platformSetting.findUnique).mockResolvedValue(null);
    vi.mocked(hasPermission).mockImplementation(async (_session, permission) => {
      // Only the base tier is granted — the secrets tier is withheld.
      return permission === "settings.edit";
    });

    const result = await updatePlatformSetting({ key: SECRET_KEY, value: "sk_live_x" });

    expect(result.ok).toBe(false);
    expect(prisma.platformSetting.upsert).not.toHaveBeenCalled();
  });

  it("checks settings.secrets.edit (not settings.edit) for a sensitive-flagged non-secret setting", async () => {
    vi.mocked(prisma.platformSetting.findUnique).mockResolvedValue(null);
    vi.mocked(hasPermission).mockImplementation(async (_session, permission) => {
      return permission === "settings.edit";
    });

    const result = await updatePlatformSetting({ key: SENSITIVE_KEY, value: "live" });

    expect(result.ok).toBe(false);
    expect(prisma.platformSetting.upsert).not.toHaveBeenCalled();
  });

  it("allows a sensitive-flagged setting when settings.secrets.edit is granted", async () => {
    vi.mocked(prisma.platformSetting.findUnique).mockResolvedValue(null);
    vi.mocked(hasPermission).mockImplementation(async (_session, permission) => {
      return permission === "settings.secrets.edit";
    });

    const result = await updatePlatformSetting({ key: SENSITIVE_KEY, value: "live" });

    expect(result.ok).toBe(true);
    expect(prisma.platformSetting.upsert).toHaveBeenCalledTimes(1);
  });

  it("only checks settings.edit (not settings.secrets.edit) for a non-sensitive setting", async () => {
    vi.mocked(prisma.platformSetting.findUnique).mockResolvedValue(null);
    vi.mocked(hasPermission).mockImplementation(async (_session, permission) => {
      return permission === "settings.edit";
    });

    const result = await updatePlatformSetting({ key: PLAIN_KEY, value: "New tagline" });

    expect(result.ok).toBe(true);
    expect(prisma.platformSetting.upsert).toHaveBeenCalledTimes(1);
  });

  it("gates resetPlatformSetting on settings.secrets.edit for a sensitive setting too", async () => {
    vi.mocked(prisma.platformSetting.findUnique).mockResolvedValue({
      value: "live",
    } as never);
    vi.mocked(hasPermission).mockImplementation(async (_session, permission) => {
      return permission === "settings.edit";
    });

    const result = await resetPlatformSetting({ key: SENSITIVE_KEY });

    expect(result.ok).toBe(false);
    expect(prisma.platformSetting.delete).not.toHaveBeenCalled();
  });
});
