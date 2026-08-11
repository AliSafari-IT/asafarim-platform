import { describe, expect, it, vi, beforeEach } from "vitest";

vi.mock("@asafarim/db", () => ({
  prisma: {
    eduStudentProfile: { findUnique: vi.fn() },
  },
}));

import { prisma } from "@asafarim/db";
import {
  authorizeBookingActor,
  canActIndependently,
  getPayerId,
  profileCanActIndependently,
  StudentGuardError,
} from "../student-guard";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const mockPrisma = prisma as any;

beforeEach(() => {
  vi.clearAllMocks();
});

function agedYears(years: number): Date {
  const d = new Date();
  d.setUTCFullYear(d.getUTCFullYear() - years);
  return d;
}

describe("profileCanActIndependently", () => {
  it("is true for a 16-year-old with no parent link", () => {
    expect(
      profileCanActIndependently({ dateOfBirth: agedYears(16), parentUserId: null }),
    ).toBe(true);
  });

  it("is false for a 15-year-old", () => {
    expect(
      profileCanActIndependently({ dateOfBirth: agedYears(15), parentUserId: null }),
    ).toBe(false);
  });

  it("is false for a 20-year-old who is still parent-managed", () => {
    expect(
      profileCanActIndependently({ dateOfBirth: agedYears(20), parentUserId: "parent-1" }),
    ).toBe(false);
  });

  it("treats a missing date of birth as under 16 (safest default)", () => {
    expect(
      profileCanActIndependently({ dateOfBirth: null, parentUserId: null }),
    ).toBe(false);
  });
});

describe("getPayerId", () => {
  it("is the parent's id when the profile is parent-managed", () => {
    expect(getPayerId({ userId: "child-1", parentUserId: "parent-1" })).toBe("parent-1");
  });

  it("is the student's own id when independent", () => {
    expect(getPayerId({ userId: "student-1", parentUserId: null })).toBe("student-1");
  });
});

describe("canActIndependently", () => {
  it("is false when no profile exists", async () => {
    mockPrisma.eduStudentProfile.findUnique.mockResolvedValue(null);
    expect(await canActIndependently("u-1")).toBe(false);
  });

  it("is true for an independent 16+ profile", async () => {
    mockPrisma.eduStudentProfile.findUnique.mockResolvedValue({
      dateOfBirth: agedYears(17),
      parentUserId: null,
    });
    expect(await canActIndependently("u-1")).toBe(true);
  });
});

describe("authorizeBookingActor", () => {
  it("lets an independent 16+ student book for themselves, payer = self", async () => {
    mockPrisma.eduStudentProfile.findUnique.mockResolvedValue({
      userId: "s-16",
      dateOfBirth: agedYears(16),
      parentUserId: null,
    });
    const result = await authorizeBookingActor("s-16", "s-16");
    expect(result.payerId).toBe("s-16");
  });

  it("blocks a 15-year-old from booking for themselves", async () => {
    mockPrisma.eduStudentProfile.findUnique.mockResolvedValue({
      userId: "s-15",
      dateOfBirth: agedYears(15),
      parentUserId: null,
    });
    await expect(authorizeBookingActor("s-15", "s-15")).rejects.toThrow(
      /parent or guardian/,
    );
  });

  it("lets the linked parent book on behalf of their child, payer = parent", async () => {
    mockPrisma.eduStudentProfile.findUnique.mockResolvedValue({
      userId: "child-1",
      dateOfBirth: agedYears(10),
      parentUserId: "parent-1",
    });
    const result = await authorizeBookingActor("parent-1", "child-1");
    expect(result.payerId).toBe("parent-1");
  });

  it("rejects a caller who is neither the student nor their parent", async () => {
    mockPrisma.eduStudentProfile.findUnique.mockResolvedValue({
      userId: "child-1",
      dateOfBirth: agedYears(10),
      parentUserId: "parent-1",
    });
    await expect(authorizeBookingActor("stranger", "child-1")).rejects.toThrow(
      StudentGuardError,
    );
  });

  it("throws 404-flavoured error when the student profile doesn't exist", async () => {
    mockPrisma.eduStudentProfile.findUnique.mockResolvedValue(null);
    await expect(authorizeBookingActor("caller-1", "ghost-student")).rejects.toThrow(
      /not found/,
    );
  });
});
