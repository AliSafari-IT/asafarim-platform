import { describe, it, expect, vi, beforeEach } from "vitest";
import {
  EduAuthError,
  getEduRoles,
  isAdmin,
  requireRole,
  requireStudent,
  requireTutor,
  upsertStudentProfile,
} from "../profiles";
import { StudentGuardError } from "../student-guard";
import type { AuthedUser } from "../auth";

// Mock the upstream package so we never load next-auth in the test runner.
vi.mock("@asafarim/auth", () => ({
  auth: vi.fn(),
}));

vi.mock("@asafarim/db", () => ({
  prisma: {
    eduStudentProfile: { findUnique: vi.fn(), upsert: vi.fn() },
    eduTutorProfile: { findUnique: vi.fn() },
    role: { findUnique: vi.fn() },
    userRole: { upsert: vi.fn() },
    userLocation: { findFirst: vi.fn() },
    user: { findUnique: vi.fn(), update: vi.fn() },
  },
  Prisma: { JsonNull: null },
}));

vi.mock("../auth", () => ({
  getAuthedUser: vi.fn(),
}));

import { prisma } from "@asafarim/db";
import { getAuthedUser } from "../auth";

const studentUser: AuthedUser = { id: "u-student", email: "student@example.com", tenantId: null, roles: [] };
const tutorUser: AuthedUser = { id: "u-tutor", email: "tutor@example.com", tenantId: null, roles: [] };
const adminUser: AuthedUser = { id: "u-admin", email: "admin@example.com", tenantId: null, roles: ["admin"] };
const anonUser = null;

const studentProfile = { userId: "u-student" } as never;
const tutorProfile = { userId: "u-tutor" } as never;

beforeEach(() => {
  vi.mocked(prisma.eduStudentProfile.findUnique).mockReset();
  vi.mocked(prisma.eduTutorProfile.findUnique).mockReset();
  vi.mocked(prisma.role.findUnique).mockReset();
  vi.mocked(prisma.userRole.upsert).mockReset();
  vi.mocked(prisma.role.findUnique).mockResolvedValue(null);
  vi.mocked(getAuthedUser).mockReset();
});

describe("isAdmin", () => {
  it("returns true for users with admin role", () => {
    expect(isAdmin(adminUser)).toBe(true);
    expect(isAdmin({ ...adminUser, roles: ["superadmin"] })).toBe(true);
  });

  it("returns false for users without admin role", () => {
    expect(isAdmin(studentUser)).toBe(false);
    expect(isAdmin({ ...studentUser, roles: ["editor"] })).toBe(false);
  });
});

describe("getEduRoles", () => {
  it("returns STUDENT when only the student profile exists", async () => {
    vi.mocked(prisma.eduStudentProfile.findUnique).mockResolvedValue(studentProfile);
    vi.mocked(prisma.eduTutorProfile.findUnique).mockResolvedValue(null);

    expect(await getEduRoles(studentUser)).toEqual(["STUDENT"]);
  });

  it("returns TUTOR when only the tutor profile exists", async () => {
    vi.mocked(prisma.eduStudentProfile.findUnique).mockResolvedValue(null);
    vi.mocked(prisma.eduTutorProfile.findUnique).mockResolvedValue(tutorProfile);

    expect(await getEduRoles(tutorUser)).toEqual(["TUTOR"]);
  });

  it("returns both when the user is dual-role", async () => {
    vi.mocked(prisma.eduStudentProfile.findUnique).mockResolvedValue(studentProfile);
    vi.mocked(prisma.eduTutorProfile.findUnique).mockResolvedValue(tutorProfile);

    expect(await getEduRoles(studentUser)).toEqual(["STUDENT", "TUTOR"]);
  });

  it("prepends ADMIN for users with the admin RBAC role", async () => {
    vi.mocked(prisma.eduStudentProfile.findUnique).mockResolvedValue(null);
    vi.mocked(prisma.eduTutorProfile.findUnique).mockResolvedValue(null);

    expect(await getEduRoles(adminUser)).toEqual(["ADMIN"]);
  });
});

describe("requireRole", () => {
  it("throws 401 when there is no authenticated user", async () => {
    vi.mocked(getAuthedUser).mockResolvedValue(anonUser);

    await expect(requireRole("STUDENT")).rejects.toMatchObject({
      name: "EduAuthError",
      status: 401,
    });
  });

  it("throws 403 when the user lacks the required role", async () => {
    vi.mocked(getAuthedUser).mockResolvedValue(studentUser);
    vi.mocked(prisma.eduStudentProfile.findUnique).mockResolvedValue(null);
    vi.mocked(prisma.eduTutorProfile.findUnique).mockResolvedValue(null);

    await expect(requireRole("TUTOR")).rejects.toMatchObject({
      name: "EduAuthError",
      status: 403,
    });
  });

  it("passes when the user has the required role", async () => {
    vi.mocked(getAuthedUser).mockResolvedValue(tutorUser);
    vi.mocked(prisma.eduStudentProfile.findUnique).mockResolvedValue(null);
    vi.mocked(prisma.eduTutorProfile.findUnique).mockResolvedValue(tutorProfile);

    const ctx = await requireRole("TUTOR");
    expect(ctx.user.id).toBe("u-tutor");
    expect(ctx.roles).toContain("TUTOR");
  });

  it("admin always passes any role check", async () => {
    vi.mocked(getAuthedUser).mockResolvedValue(adminUser);
    vi.mocked(prisma.eduStudentProfile.findUnique).mockResolvedValue(null);
    vi.mocked(prisma.eduTutorProfile.findUnique).mockResolvedValue(null);

    const ctx = await requireRole("STUDENT", "TUTOR");
    expect(ctx.roles).toContain("ADMIN");
  });
});

describe("requireStudent / requireTutor", () => {
  it("requireStudent returns the profile when it exists", async () => {
    vi.mocked(getAuthedUser).mockResolvedValue(studentUser);
    vi.mocked(prisma.eduStudentProfile.findUnique).mockResolvedValue(studentProfile);

    const ctx = await requireStudent();
    expect(ctx.profile).toBe(studentProfile);
  });

  it("requireStudent throws 403 when no profile exists (non-admin)", async () => {
    vi.mocked(getAuthedUser).mockResolvedValue(studentUser);
    vi.mocked(prisma.eduStudentProfile.findUnique).mockResolvedValue(null);

    await expect(requireStudent()).rejects.toBeInstanceOf(EduAuthError);
  });

  it("requireTutor returns the profile when it exists", async () => {
    vi.mocked(getAuthedUser).mockResolvedValue(tutorUser);
    vi.mocked(prisma.eduTutorProfile.findUnique).mockResolvedValue(tutorProfile);

    const ctx = await requireTutor();
    expect(ctx.profile).toBe(tutorProfile);
  });

  it("requireTutor throws 403 when no profile exists (non-admin)", async () => {
    vi.mocked(getAuthedUser).mockResolvedValue(tutorUser);
    vi.mocked(prisma.eduTutorProfile.findUnique).mockResolvedValue(null);

    await expect(requireTutor()).rejects.toBeInstanceOf(EduAuthError);
  });
});

describe("upsertStudentProfile — under-16 independence gate", () => {
  beforeEach(() => {
    vi.mocked(prisma.eduStudentProfile.findUnique).mockReset();
    vi.mocked(prisma.eduStudentProfile.upsert).mockReset();
    vi.mocked(prisma.userLocation.findFirst).mockReset().mockResolvedValue(null);
    vi.mocked(prisma.user.findUnique).mockReset().mockResolvedValue({ image: null } as never);
    vi.mocked(prisma.user.update).mockReset();
  });

  function agedYears(years: number): Date {
    const d = new Date();
    d.setUTCFullYear(d.getUTCFullYear() - years);
    return d;
  }

  it("refuses first-time self-serve creation with a DOB under 16", async () => {
    vi.mocked(prisma.eduStudentProfile.findUnique).mockResolvedValue(null); // no existing profile

    await expect(
      upsertStudentProfile("u-15", {
        gradeLevel: "K12",
        subjectsOfInterest: [],
        dateOfBirth: agedYears(15),
      }),
    ).rejects.toBeInstanceOf(StudentGuardError);
    expect(prisma.eduStudentProfile.upsert).not.toHaveBeenCalled();
  });

  it("allows first-time self-serve creation at 16+", async () => {
    vi.mocked(prisma.eduStudentProfile.findUnique).mockResolvedValue(null);
    vi.mocked(prisma.eduStudentProfile.upsert).mockResolvedValue({
      userId: "u-16",
      dateOfBirth: agedYears(16),
    } as never);

    const profile = await upsertStudentProfile("u-16", {
      gradeLevel: "K12",
      subjectsOfInterest: [],
      dateOfBirth: agedYears(16),
    });
    expect(profile.userId).toBe("u-16");
  });

  it("allows creation with no dateOfBirth at all (profile stays incomplete, not rejected)", async () => {
    vi.mocked(prisma.eduStudentProfile.findUnique).mockResolvedValue(null);
    vi.mocked(prisma.eduStudentProfile.upsert).mockResolvedValue({
      userId: "u-nodate",
      dateOfBirth: null,
    } as never);

    await expect(
      upsertStudentProfile("u-nodate", { gradeLevel: "K12", subjectsOfInterest: [] }),
    ).resolves.toBeTruthy();
  });

  it("does not re-check the gate on an update to an already-existing profile", async () => {
    vi.mocked(prisma.eduStudentProfile.findUnique).mockResolvedValue({
      userId: "u-existing",
      dateOfBirth: agedYears(20),
    } as never); // profile already exists
    vi.mocked(prisma.eduStudentProfile.upsert).mockResolvedValue({
      userId: "u-existing",
      dateOfBirth: agedYears(15), // editing DOB down doesn't retroactively block the save
    } as never);

    await expect(
      upsertStudentProfile("u-existing", {
        gradeLevel: "K12",
        subjectsOfInterest: [],
        dateOfBirth: agedYears(15),
      }),
    ).resolves.toBeTruthy();
  });
});
