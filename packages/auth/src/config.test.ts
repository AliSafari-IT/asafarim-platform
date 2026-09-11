import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@asafarim/db", () => ({
  prisma: {
    role: { findUnique: vi.fn() },
    userRole: { upsert: vi.fn() },
  },
}));

import { prisma } from "@asafarim/db";
import { applySuperadminAllowlist } from "./config";

const mockPrisma = prisma as unknown as {
  role: { findUnique: ReturnType<typeof vi.fn> };
  userRole: { upsert: ReturnType<typeof vi.fn> };
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
