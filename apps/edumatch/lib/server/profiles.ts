import { prisma, Prisma } from "@asafarim/db";
import type {
  EduStudentProfile,
  EduTutorProfile,
} from "@asafarim/db";
import { getAuthedUser, type AuthedUser } from "./auth";
import type {
  StudentProfileInput,
  StudentProfilePatch,
  TutorProfileInput,
  TutorProfilePatch,
} from "./validation";

/**
 * EduMatch resolves "role" by which profile rows exist for the user:
 *   - STUDENT  → has an EduStudentProfile
 *   - TUTOR    → has an EduTutorProfile
 *   - ADMIN    → has the global "admin" or "superadmin" role from the
 *                shared RBAC tables (User.userRoles → Role.name)
 *
 * A single user can be both STUDENT and TUTOR. The helpers below let
 * route handlers state their requirement explicitly and fail closed.
 */
export type EduRole = "STUDENT" | "TUTOR" | "ADMIN";

export type StudentContext = {
  user: AuthedUser;
  profile: EduStudentProfile;
};

export type TutorContext = {
  user: AuthedUser;
  profile: EduTutorProfile;
};

const ADMIN_ROLE_NAMES = new Set(["admin", "superadmin", "edumatch_admin"]);

export function isAdmin(user: AuthedUser): boolean {
  return user.roles.some((r) => ADMIN_ROLE_NAMES.has(r));
}

export async function requireEduAdmin(): Promise<{ user: AuthedUser; roles: EduRole[] }> {
  return requireRole("ADMIN");
}

/** Fetch the EduStudentProfile for a user, or null if they aren't a student. */
export async function getStudentProfile(
  userId: string,
): Promise<EduStudentProfile | null> {
  return prisma.eduStudentProfile.findUnique({ where: { userId } });
}

/** Fetch the EduTutorProfile for a user, or null if they aren't a tutor. */
export async function getTutorProfile(
  userId: string,
): Promise<EduTutorProfile | null> {
  return prisma.eduTutorProfile.findUnique({ where: { userId } });
}

/**
 * Resolve the authenticated user's effective EduMatch roles. ADMIN is granted
 * via the shared RBAC roles; STUDENT / TUTOR are granted by profile presence.
 */
export async function getEduRoles(user: AuthedUser): Promise<EduRole[]> {
  const [student, tutor] = await Promise.all([
    getStudentProfile(user.id),
    getTutorProfile(user.id),
  ]);

  const roles: EduRole[] = [];
  if (isAdmin(user)) roles.push("ADMIN");
  if (student) roles.push("STUDENT");
  if (tutor) roles.push("TUTOR");
  return roles;
}

/**
 * Require an authenticated user with at least one of the given EduMatch roles.
 * ADMIN always satisfies any role check.
 *
 * Throws an `EduAuthError` whose `status` is the appropriate HTTP code; route
 * handlers should map these to JSON responses via the helpers in `auth.ts`.
 */
export class EduAuthError extends Error {
  constructor(
    public status: 401 | 403,
    message: string,
  ) {
    super(message);
    this.name = "EduAuthError";
  }
}

export async function requireRole(
  ...allowed: EduRole[]
): Promise<{ user: AuthedUser; roles: EduRole[] }> {
  const user = await getAuthedUser();
  if (!user) throw new EduAuthError(401, "Unauthorized");

  const roles = await getEduRoles(user);
  if (roles.includes("ADMIN")) return { user, roles };

  const ok = allowed.some((r) => roles.includes(r));
  if (!ok) throw new EduAuthError(403, `Requires one of: ${allowed.join(", ")}`);

  return { user, roles };
}

/** Convenience: require STUDENT and return the resolved profile. */
export async function requireStudent(): Promise<StudentContext> {
  const user = await getAuthedUser();
  if (!user) throw new EduAuthError(401, "Unauthorized");

  const profile = await getStudentProfile(user.id);
  if (!profile && !isAdmin(user)) {
    throw new EduAuthError(403, "Student profile required");
  }
  if (!profile) throw new EduAuthError(403, "Student profile required");

  return { user, profile };
}

/** Convenience: require TUTOR and return the resolved profile. */
export async function requireTutor(): Promise<TutorContext> {
  const user = await getAuthedUser();
  if (!user) throw new EduAuthError(401, "Unauthorized");

  const profile = await getTutorProfile(user.id);
  if (!profile && !isAdmin(user)) {
    throw new EduAuthError(403, "Tutor profile required");
  }
  if (!profile) throw new EduAuthError(403, "Tutor profile required");

  // Ensure role is always in sync with profile existence (handles stale sessions)
  await assignRoleIfMissing(user.id, "edumatch_tutor");

  return { user, profile };
}

/**
 * Ensure the user has the given seeded RBAC role (e.g. `edumatch_student`).
 * Idempotent: a no-op if the user already has the role. Silently skips when
 * the role has not been seeded yet so that a fresh dev DB doesn't break the
 * profile-create flow — the seed script is the source of truth for role rows.
 */
export async function assignRoleIfMissing(
  userId: string,
  roleName: string,
): Promise<void> {
  const role = await prisma.role.findUnique({ where: { name: roleName } });
  if (!role) return;

  await prisma.userRole.upsert({
    where: { userId_roleId: { userId, roleId: role.id } },
    update: {},
    create: { userId, roleId: role.id },
  });
}

async function getPrimaryEduMatchHomeAddress(userId: string): Promise<{
  address: Prisma.InputJsonValue;
  lat: number | null;
  lng: number | null;
} | null> {
  const location = await prisma.userLocation.findFirst({
    where: {
      userId,
      type: "home",
      isPrimary: true,
      appScope: { has: "edumatch" },
    },
    select: {
      formatted: true,
      street1: true,
      city: true,
      state: true,
      postalCode: true,
      country: true,
      countryName: true,
      lat: true,
      lng: true,
    },
  });

  if (!location?.formatted && !location?.street1 && !location?.city) {
    return null;
  }

  return {
    address: {
      formatted: location.formatted ?? undefined,
      line1: location.street1 ?? undefined,
      city: location.city ?? undefined,
      region: location.state ?? undefined,
      postalCode: location.postalCode ?? undefined,
      country: location.countryName ?? location.country ?? undefined,
      source: "central-profile",
    } as Prisma.InputJsonObject,
    lat: location.lat,
    lng: location.lng,
  };
}

/**
 * Create or replace the caller's EduStudentProfile and ensure the
 * `edumatch_student` role is attached. Used by the profile POST route.
 */
export async function upsertStudentProfile(
  userId: string,
  input: StudentProfileInput,
): Promise<EduStudentProfile> {
  const centralLocation = input.homeAddress
    ? null
    : await getPrimaryEduMatchHomeAddress(userId);
  const data = {
    gradeLevel: input.gradeLevel,
    subjectsOfInterest: input.subjectsOfInterest ?? [],
    homeAddress: (input.homeAddress ??
      centralLocation?.address ??
      Prisma.JsonNull) as Prisma.InputJsonValue,
    homeLat: centralLocation?.lat,
    homeLng: centralLocation?.lng,
  };

  const profile = await prisma.eduStudentProfile.upsert({
    where: { userId },
    update: data,
    create: { userId, ...data },
  });

  await assignRoleIfMissing(userId, "edumatch_student");
  return profile;
}

/**
 * Resolve the caller as a student, creating a minimal profile if they don't
 * have one yet.
 *
 * The learning-brief experience promises value before paperwork: a student
 * types their problem and gets help, rather than filling in a grade level and
 * a subject list they may not know how to answer. The profile still exists —
 * uploads, matching, and safeguarding all need a row — it is just derived
 * from the conversation instead of demanded up front. `gradeLevel` is left
 * empty rather than defaulted, because guessing it is exactly what the
 * "never pretend to understand the student's level" rule forbids; the brief
 * fills it in once the student actually says.
 *
 * Distinct from `requireStudent`, which stays strict for every surface that
 * reads an established profile.
 */
export async function requireStudentAutoProvision(): Promise<StudentContext> {
  const user = await getAuthedUser();
  if (!user) throw new EduAuthError(401, "Unauthorized");

  const existing = await getStudentProfile(user.id);
  if (existing) return { user, profile: existing };

  const centralLocation = await getPrimaryEduMatchHomeAddress(user.id);
  const profile = await prisma.eduStudentProfile.create({
    data: {
      userId: user.id,
      gradeLevel: "",
      subjectsOfInterest: [],
      homeAddress: (centralLocation?.address ??
        Prisma.JsonNull) as Prisma.InputJsonValue,
      homeLat: centralLocation?.lat,
      homeLng: centralLocation?.lng,
    },
  });
  await assignRoleIfMissing(user.id, "edumatch_student");
  return { user, profile };
}

/**
 * Partial update of the caller's EduStudentProfile. Throws 404 when no
 * profile exists — clients should POST first to create one.
 */
export async function updateStudentProfile(
  userId: string,
  input: StudentProfilePatch,
): Promise<EduStudentProfile> {
  const existing = await prisma.eduStudentProfile.findUnique({ where: { userId } });
  if (!existing) throw new EduAuthError(403, "Student profile not found");

  const data: Prisma.EduStudentProfileUpdateInput = {};
  if (input.gradeLevel !== undefined) data.gradeLevel = input.gradeLevel;
  if (input.subjectsOfInterest !== undefined) data.subjectsOfInterest = input.subjectsOfInterest;
  if (input.homeAddress !== undefined) {
    data.homeAddress = (input.homeAddress ?? Prisma.JsonNull) as Prisma.InputJsonValue;
  }

  return prisma.eduStudentProfile.update({ where: { userId }, data });
}

/**
 * Create or replace the caller's EduTutorProfile and ensure the
 * `edumatch_tutor` role is attached. Tutor verification (verifiedAt) is a
 * separate admin-only flow and is not touched here.
 */
export async function upsertTutorProfile(
  userId: string,
  input: TutorProfileInput,
): Promise<EduTutorProfile> {
  const centralLocation = input.homeAddress
    ? null
    : await getPrimaryEduMatchHomeAddress(userId);
  const data = {
    bio: input.bio ?? null,
    subjectsTaught: input.subjectsTaught ?? [],
    levelsTaught: input.levelsTaught ?? [],
    hourlyRateCents: input.hourlyRateCents ?? 0,
    onlineOnly: input.onlineOnly ?? false,
    serviceRadiusKm: input.serviceRadiusKm ?? 10,
    homeAddress: (input.homeAddress ??
      centralLocation?.address ??
      Prisma.JsonNull) as Prisma.InputJsonValue,
    homeLat: centralLocation?.lat,
    homeLng: centralLocation?.lng,
  };

  const profile = await prisma.eduTutorProfile.upsert({
    where: { userId },
    update: data,
    create: { userId, ...data },
  });

  await assignRoleIfMissing(userId, "edumatch_tutor");
  return profile;
}

/**
 * Partial update of the caller's EduTutorProfile. Throws 404 when no profile
 * exists.
 */
export async function updateTutorProfile(
  userId: string,
  input: TutorProfilePatch,
): Promise<EduTutorProfile> {
  const existing = await prisma.eduTutorProfile.findUnique({ where: { userId } });
  if (!existing) throw new EduAuthError(403, "Tutor profile not found");

  const data: Prisma.EduTutorProfileUpdateInput = {};
  if (input.bio !== undefined) data.bio = input.bio;
  if (input.subjectsTaught !== undefined) data.subjectsTaught = input.subjectsTaught;
  if (input.levelsTaught !== undefined) data.levelsTaught = input.levelsTaught;
  if (input.hourlyRateCents !== undefined) data.hourlyRateCents = input.hourlyRateCents;
  if (input.onlineOnly !== undefined) data.onlineOnly = input.onlineOnly;
  if (input.serviceRadiusKm !== undefined) data.serviceRadiusKm = input.serviceRadiusKm;
  if (input.homeAddress !== undefined) {
    data.homeAddress = (input.homeAddress ?? Prisma.JsonNull) as Prisma.InputJsonValue;
  }

  return prisma.eduTutorProfile.update({ where: { userId }, data });
}
