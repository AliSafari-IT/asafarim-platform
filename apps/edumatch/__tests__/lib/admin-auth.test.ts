import { describe, expect, it, vi } from "vitest";

vi.mock("@asafarim/auth", () => ({
  auth: () => Promise.resolve(null),
}));

vi.mock("@asafarim/db", () => ({
  prisma: {
    eduStudentProfile: { findUnique: vi.fn().mockResolvedValue(null) },
    eduTutorProfile: { findUnique: vi.fn().mockResolvedValue(null) },
    role: { findUnique: vi.fn().mockResolvedValue(null) },
    userRole: { upsert: vi.fn() },
  },
  Prisma: { JsonNull: null },
}));

import { isAdmin } from "@/lib/server/profiles";
import type { AuthedUser } from "@/lib/server/auth";

function mockUser(roles: string[]): AuthedUser {
  return { id: "u1", email: "test@example.com", tenantId: null, roles };
}

describe("isAdmin", () => {
  it("returns true for global admin role", () => {
    expect(isAdmin(mockUser(["admin"]))).toBe(true);
  });

  it("returns true for superadmin role", () => {
    expect(isAdmin(mockUser(["superadmin"]))).toBe(true);
  });

  it("returns true for edumatch_admin role", () => {
    expect(isAdmin(mockUser(["edumatch_admin"]))).toBe(true);
  });

  it("returns true when edumatch_admin is among other roles", () => {
    expect(isAdmin(mockUser(["edumatch_student", "edumatch_admin"]))).toBe(true);
  });

  it("returns false for student-only user", () => {
    expect(isAdmin(mockUser(["edumatch_student"]))).toBe(false);
  });

  it("returns false for tutor-only user", () => {
    expect(isAdmin(mockUser(["edumatch_tutor"]))).toBe(false);
  });

  it("returns false for user with no roles", () => {
    expect(isAdmin(mockUser([]))).toBe(false);
  });
});
