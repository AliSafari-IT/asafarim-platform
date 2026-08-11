import { describe, expect, it, vi, beforeEach } from "vitest";

// parent.ts pulls in profiles.ts (for assignRoleIfMissing), which imports
// getAuthedUser from ./auth — and that module chain reaches next-auth,
// which doesn't resolve cleanly under vitest's node environment. Mock it
// out; nothing in these tests exercises request-scoped auth.
vi.mock("../auth", () => ({ getAuthedUser: vi.fn() }));

vi.mock("@asafarim/db", () => ({
  prisma: {
    user: { findUnique: vi.fn(), create: vi.fn(), update: vi.fn() },
    eduParentProfile: { upsert: vi.fn(), findUnique: vi.fn() },
    eduStudentProfile: { create: vi.fn(), findMany: vi.fn(), findFirst: vi.fn(), findUnique: vi.fn() },
    role: { findUnique: vi.fn() },
    userRole: { upsert: vi.fn() },
    $transaction: vi.fn(),
  },
  Prisma: { JsonNull: null },
}));

import { prisma } from "@asafarim/db";
import {
  addChildProfile,
  ensureParentProfile,
  getChildProfile,
  listChildren,
  ParentError,
} from "../parent";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const mockPrisma = prisma as any;

beforeEach(() => {
  vi.clearAllMocks();
  // $transaction just runs the callback against the same mocked client.
  mockPrisma.$transaction.mockImplementation(
    (fn: (tx: typeof mockPrisma) => unknown) => fn(mockPrisma),
  );
  mockPrisma.role.findUnique.mockResolvedValue(null); // role seed absent in tests: no-op
});

describe("ensureParentProfile", () => {
  it("is idempotent (upsert)", async () => {
    mockPrisma.eduParentProfile.upsert.mockResolvedValue({ userId: "p-1" });
    const result = await ensureParentProfile("p-1");
    expect(result).toEqual({ userId: "p-1" });
    expect(mockPrisma.eduParentProfile.upsert).toHaveBeenCalledWith(
      expect.objectContaining({ where: { userId: "p-1" } }),
    );
  });
});

describe("addChildProfile", () => {
  const childInput = {
    name: "Alex",
    dateOfBirth: new Date("2015-01-01"),
    gradeLevel: "K12" as const,
    subjectsOfInterest: ["Mathematics"],
  };

  it("requires the caller to already be a registered parent", async () => {
    mockPrisma.user.findUnique.mockResolvedValue({ name: "Parent", email: "p@example.com" });
    mockPrisma.eduParentProfile.findUnique.mockResolvedValue(null);

    await expect(addChildProfile("p-1", childInput)).rejects.toThrow(ParentError);
    expect(mockPrisma.user.create).not.toHaveBeenCalled();
  });

  it("creates a child User + EduStudentProfile with parentUserId, isMinor, and guardian contact set", async () => {
    mockPrisma.user.findUnique.mockResolvedValue({
      name: "Parent Pat",
      email: "parent@example.com",
    });
    mockPrisma.eduParentProfile.findUnique.mockResolvedValue({ userId: "p-1" });
    mockPrisma.user.create.mockResolvedValue({ id: "child-user-1" });
    mockPrisma.eduStudentProfile.create.mockResolvedValue({
      userId: "child-user-1",
      parentUserId: "p-1",
      isMinor: true,
      guardianName: "Parent Pat",
      guardianEmail: "parent@example.com",
      dateOfBirth: childInput.dateOfBirth,
    });

    const child = await addChildProfile("p-1", childInput);

    expect(mockPrisma.eduStudentProfile.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          userId: "child-user-1",
          parentUserId: "p-1",
          isMinor: true,
          guardianName: "Parent Pat",
          guardianEmail: "parent@example.com",
          dateOfBirth: childInput.dateOfBirth,
        }),
      }),
    );
    expect(child.parentUserId).toBe("p-1");
    expect(child.isMinor).toBe(true);
  });
});

describe("listChildren", () => {
  it("returns only this parent's children, mapped to a display shape", async () => {
    mockPrisma.eduStudentProfile.findMany.mockResolvedValue([
      {
        userId: "child-1",
        gradeLevel: "K12",
        dateOfBirth: new Date("2015-01-01"),
        createdAt: new Date("2026-01-01"),
        user: { name: "Alex", image: null },
      },
    ]);

    const children = await listChildren("p-1");

    expect(mockPrisma.eduStudentProfile.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { parentUserId: "p-1" } }),
    );
    expect(children).toEqual([
      {
        userId: "child-1",
        name: "Alex",
        image: null,
        gradeLevel: "K12",
        dateOfBirth: new Date("2015-01-01"),
        createdAt: new Date("2026-01-01"),
      },
    ]);
  });
});

describe("getChildProfile", () => {
  it("404s (not 403s) when the child doesn't belong to this parent", async () => {
    mockPrisma.eduStudentProfile.findFirst.mockResolvedValue(null);
    await expect(getChildProfile("p-1", "someone-elses-child")).rejects.toThrow(
      ParentError,
    );
    expect(mockPrisma.eduStudentProfile.findFirst).toHaveBeenCalledWith({
      where: { userId: "someone-elses-child", parentUserId: "p-1" },
    });
  });

  it("returns the profile when it belongs to this parent", async () => {
    mockPrisma.eduStudentProfile.findFirst.mockResolvedValue({
      userId: "child-1",
      parentUserId: "p-1",
    });
    const profile = await getChildProfile("p-1", "child-1");
    expect(profile.userId).toBe("child-1");
  });
});
