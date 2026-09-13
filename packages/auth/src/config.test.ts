import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@asafarim/db", () => ({
  prisma: {
    role: { findUnique: vi.fn() },
    userRole: { upsert: vi.fn() },
    auditLog: { create: vi.fn() },
  },
}));

import { prisma } from "@asafarim/db";
import { applySuperadminAllowlist, recordSignInEvent } from "./config";

const mockPrisma = prisma as unknown as {
  role: { findUnique: ReturnType<typeof vi.fn> };
  userRole: { upsert: ReturnType<typeof vi.fn> };
  auditLog: { create: ReturnType<typeof vi.fn> };
};

const ORIGINAL_ENV = process.env.SUPERADMIN_EMAILS;

describe("applySuperadminAllowlist", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    process.env.SUPERADMIN_EMAILS = '["admin@asafarim.com","asafarim+sa@gmail.com"]';
    mockPrisma.role.findUnique.mockResolvedValue({ id: "role-superadmin" });
  });

  afterEach(() => {
    if (ORIGINAL_ENV === undefined) {
      delete process.env.SUPERADMIN_EMAILS;
    } else {
      process.env.SUPERADMIN_EMAILS = ORIGINAL_ENV;
    }
  });

  it("upserts the superadmin role for an allowlisted email", async () => {
    await applySuperadminAllowlist("user-1", "admin@asafarim.com");

    expect(mockPrisma.role.findUnique).toHaveBeenCalledWith({
      where: { name: "superadmin" },
      select: { id: true },
    });
    expect(mockPrisma.userRole.upsert).toHaveBeenCalledWith({
      where: { userId_roleId: { userId: "user-1", roleId: "role-superadmin" } },
      update: {},
      create: { userId: "user-1", roleId: "role-superadmin" },
    });
  });

  it("resolves an alternative allowlisted email to the same superadmin grant", async () => {
    await applySuperadminAllowlist("user-2", "asafarim+sa@gmail.com");

    expect(mockPrisma.userRole.upsert).toHaveBeenCalledWith({
      where: { userId_roleId: { userId: "user-2", roleId: "role-superadmin" } },
      update: {},
      create: { userId: "user-2", roleId: "role-superadmin" },
    });
  });

  it("is case-insensitive and trims whitespace", async () => {
    await applySuperadminAllowlist("user-3", "  Admin@Asafarim.com  ");

    expect(mockPrisma.userRole.upsert).toHaveBeenCalledTimes(1);
  });

  it("does nothing for an email not on the allowlist", async () => {
    await applySuperadminAllowlist("user-4", "someone-else@example.com");

    expect(mockPrisma.role.findUnique).not.toHaveBeenCalled();
    expect(mockPrisma.userRole.upsert).not.toHaveBeenCalled();
  });

  it("does nothing when SUPERADMIN_EMAILS is unset", async () => {
    delete process.env.SUPERADMIN_EMAILS;

    await applySuperadminAllowlist("user-5", "admin@asafarim.com");

    expect(mockPrisma.userRole.upsert).not.toHaveBeenCalled();
  });

  it("does nothing when SUPERADMIN_EMAILS is not valid JSON", async () => {
    process.env.SUPERADMIN_EMAILS = "not-json";

    await applySuperadminAllowlist("user-6", "admin@asafarim.com");

    expect(mockPrisma.userRole.upsert).not.toHaveBeenCalled();
  });

  it("does nothing when there is no email", async () => {
    await applySuperadminAllowlist("user-7", null);

    expect(mockPrisma.role.findUnique).not.toHaveBeenCalled();
  });

  it("calls upsert (idempotent via DB constraint), not create, so repeat sign-ins never duplicate", async () => {
    await applySuperadminAllowlist("user-1", "admin@asafarim.com");
    await applySuperadminAllowlist("user-1", "admin@asafarim.com");

    expect(mockPrisma.userRole.upsert).toHaveBeenCalledTimes(2);
    expect(mockPrisma.userRole.upsert.mock.calls[0][0].update).toEqual({});
    expect(mockPrisma.userRole.upsert.mock.calls[1][0].update).toEqual({});
  });
});

describe("recordSignInEvent", () => {
  beforeEach(() => {
    mockPrisma.auditLog.create.mockReset();
  });

  it("writes a sign_in AuditLog row with the provider", async () => {
    await recordSignInEvent("user-1", "google", { userAgentRaw: null, ipAddress: null });

    expect(mockPrisma.auditLog.create).toHaveBeenCalledWith({
      data: {
        userId: "user-1",
        action: "sign_in",
        entity: "auth",
        changes: { provider: "google", device: null, userAgentRaw: null },
        ipAddress: null,
      },
    });
  });

  it("defaults the provider to 'credentials' when none is given (email/password and email-OTP sign-ins)", async () => {
    await recordSignInEvent("user-2", undefined, { userAgentRaw: null, ipAddress: null });

    expect(mockPrisma.auditLog.create).toHaveBeenCalledWith({
      data: {
        userId: "user-2",
        action: "sign_in",
        entity: "auth",
        changes: { provider: "credentials", device: null, userAgentRaw: null },
        ipAddress: null,
      },
    });
  });

  it("parses a recognizable user-agent into normalized browser/OS fields", async () => {
    await recordSignInEvent("user-3", "credentials", {
      userAgentRaw:
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0.0.0 Safari/537.36",
      ipAddress: "203.0.113.9",
    });

    const call = mockPrisma.auditLog.create.mock.calls[0]![0];
    expect(call.data.ipAddress).toBe("203.0.113.9");
    expect(call.data.changes.device).toMatchObject({
      browserFamily: "Chrome",
      osFamily: "Windows",
    });
  });

  it("stores device: null for an unparseable or missing user-agent, never a fabricated value", async () => {
    await recordSignInEvent("user-4", "credentials", { userAgentRaw: "", ipAddress: null });

    const call = mockPrisma.auditLog.create.mock.calls[0]![0];
    expect(call.data.changes.device).toBeNull();
  });

  it("never throws when the write fails — a broken audit log must not block sign-in", async () => {
    mockPrisma.auditLog.create.mockRejectedValueOnce(new Error("db unreachable"));

    await expect(
      recordSignInEvent("user-5", "google", { userAgentRaw: null, ipAddress: null })
    ).resolves.toBeUndefined();
  });
});
