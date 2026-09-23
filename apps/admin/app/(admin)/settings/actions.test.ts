import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));

const SECRET_KEY = "ai.openaiApiKey";
const JSON_KEY = "test.jsonSetting";
const SENSITIVE_KEY = "stripe.mode";
const PLAIN_KEY = "platform.tagline";

// @asafarim/db now owns both the Prisma client and the settings catalog
// (getSettingDefinition, etc. — see packages/db/src/settings.ts), so this
// single mock covers both: real catalog definitions pass through via
// importActual, with a few synthetic ones added purely for these tests.
vi.mock("@asafarim/db", async () => {
  const actual = await vi.importActual<typeof import("@asafarim/db")>("@asafarim/db");
  return {
    ...actual,
    prisma: {
      platformSetting: { findUnique: vi.fn(), upsert: vi.fn(), delete: vi.fn() },
      auditLog: { create: vi.fn() },
    },
    encryptSecret: vi.fn((plaintext: string) => `encrypted(${plaintext})`),
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

const sendMail = vi.fn();
vi.mock("@asafarim/auth/mailer", () => ({ createTransport: vi.fn() }));

vi.mock("@asafarim/auth", () => ({
  ROLES: { SUPERADMIN: "superadmin", ADMIN: "admin" },
  getSession: vi.fn(),
  hasRole: vi.fn(() => true),
  hasPermission: vi.fn(async () => true),
}));

import { prisma, encryptSecret } from "@asafarim/db";
import { getSession, hasPermission } from "@asafarim/auth";
import { createTransport } from "@asafarim/auth/mailer";
import { resetPlatformSetting, sendTestEmail, updatePlatformSetting } from "./actions";

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

describe("sendTestEmail", () => {
  const RELAY_PASSWORD = "relay-p4ss-TOKEN";
  function transport(sources: Record<string, "settings" | "env"> = {}) {
    vi.mocked(createTransport).mockResolvedValue({
      transporter: { sendMail },
      from: "ASafariM <noreply@asafarim.com>",
      config: {
        host: "smtp.example.com", port: 465, password: RELAY_PASSWORD,
        sources: { host: "env", port: "env", secure: "env", user: "env", password: "env", from: "env", replyTo: "env", ...sources },
      },
    } as never);
  }
  beforeEach(() => {
    sendMail.mockReset().mockResolvedValue({ response: "250 2.0.0 OK queued" });
    vi.mocked(createTransport).mockReset();
    transport();
  });

  it("requires settings.secrets.edit — settings.edit alone is not enough", async () => {
    vi.mocked(hasPermission).mockImplementation(async (_s, p) => p === "settings.edit");
    const result = await sendTestEmail({ to: "admin@asafarim.com" });
    expect(result.ok).toBe(false);
    expect(createTransport).not.toHaveBeenCalled();
  });

  it.each(["", "not-an-email", "a@b", "two@a.com, three@b.com", "x".repeat(321) + "@a.com"])(
    "rejects %j without touching the relay",
    async (to) => {
      const result = await sendTestEmail({ to });
      expect(result.ok).toBe(false);
      expect(createTransport).not.toHaveBeenCalled();
    },
  );

  it("sends through the resolved transport with a short timeout and reports the relay + sources", async () => {
    transport({ from: "settings", password: "settings" });
    const result = await sendTestEmail({ to: "  admin@asafarim.com " });
    expect(createTransport).toHaveBeenCalledWith({ timeoutMs: 15000 });
    expect(sendMail).toHaveBeenCalledWith(expect.objectContaining({ to: "admin@asafarim.com", from: "ASafariM <noreply@asafarim.com>" }));
    expect(result.ok).toBe(true);
    const message = (result as { message: string }).message;
    expect(message).toContain("smtp.example.com:465");
    expect(message).toContain("250 2.0.0 OK queued");
    expect(message).toMatch(/From console settings: (password, from|from, password);/);
    const audit = vi.mocked(prisma.auditLog.create).mock.calls[0]?.[0] as { data: { action: string } };
    expect(audit.data.action).toBe("settings.email.test.sent");
  });

  it("surfaces the real transport error, with the password scrubbed, and audits the failure", async () => {
    sendMail.mockRejectedValue(new Error(`Invalid login: 535 Authentication failed for pass=${RELAY_PASSWORD}`));
    const result = await sendTestEmail({ to: "admin@asafarim.com" });
    expect(result.ok).toBe(false);
    const error = (result as { error: string }).error;
    expect(error).toContain("535 Authentication failed");
    expect(error).toContain("smtp.example.com:465");
    expect(error).not.toContain(RELAY_PASSWORD);
    const audit = vi.mocked(prisma.auditLog.create).mock.calls[0]?.[0] as { data: { action: string; changes: unknown } };
    expect(audit.data.action).toBe("settings.email.test.failed");
    expect(JSON.stringify(audit.data.changes)).not.toContain(RELAY_PASSWORD);
  });

  it("surfaces an incomplete-config error instead of throwing", async () => {
    vi.mocked(createTransport).mockRejectedValue(new Error("SMTP configuration is incomplete."));
    const result = await sendTestEmail({ to: "admin@asafarim.com" });
    expect(result).toEqual({ ok: false, error: "Send failed: SMTP configuration is incomplete." });
  });
});
