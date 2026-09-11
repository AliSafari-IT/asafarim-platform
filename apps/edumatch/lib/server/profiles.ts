import { prisma, Prisma } from "@asafarim/db";
import type {
  EduStudentProfile,
  EduTutorProfile,
} from "@asafarim/db";
import { getAuthedUser, type AuthedUser } from "./auth";
import { isEduAdminRole } from "../roles";
import { applyDefaultAvatarIfNeeded } from "./avatars";
import { isUnder16 } from "./age";
import { StudentGuardError } from "./student-guard";
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

export function isAdmin(user: AuthedUser): boolean {
  return isEduAdminRole(user.roles);
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

const EDUMATCH_LOCATION_SELECT = {
  id: true,
  type: true,
  label: true,
  isPrimary: true,
  formatted: true,
  street1: true,
  city: true,
  state: true,
  postalCode: true,
  country: true,
  countryName: true,
  lat: true,
  lng: true,
} as const;

type EduMatchLocationRow = {
  id: string;
  type: string;
  label: string | null;
  isPrimary: boolean;
  formatted: string | null;
  street1: string | null;
  city: string | null;
  state: string | null;
  postalCode: string | null;
  country: string | null;
  countryName: string | null;
  lat: number | null;
  lng: number | null;
};

function locationToAddress(location: EduMatchLocationRow): Prisma.InputJsonObject {
  return {
    formatted: location.formatted ?? undefined,
    line1: location.street1 ?? undefined,
    city: location.city ?? undefined,
    region: location.state ?? undefined,
    postalCode: location.postalCode ?? undefined,
    country: location.countryName ?? location.country ?? undefined,
    // Marks this value as pulled from Hub's shared address book (rather
    // than typed directly into an EduMatch form) so the GET route knows it
    // is safe to keep re-resolving live — see resolveHomeAddressForDisplay.
    source: "central-profile",
    sourceLocationId: location.id,
  } as Prisma.InputJsonObject;
}

function hasAddressContent(location: EduMatchLocationRow | null | undefined): boolean {
  return Boolean(location?.formatted || location?.street1 || location?.city);
}

/**
 * Every address the user has saved in Hub that's visible to EduMatch. An
 * empty `appScope` means "visible to every app" (see the UserLocation model
 * doc comment) — Prisma's array `has` filter alone would only match
 * locations that explicitly opted in, silently excluding the common case
 * (Hub's profile UI doesn't expose per-app scoping at all).
 */
async function listEduMatchLocations(userId: string): Promise<EduMatchLocationRow[]> {
  return prisma.userLocation.findMany({
    where: {
      userId,
      OR: [{ appScope: { isEmpty: true } }, { appScope: { has: "edumatch" } }],
    },
    select: EDUMATCH_LOCATION_SELECT,
    orderBy: [{ isPrimary: "desc" }, { createdAt: "asc" }],
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
      OR: [{ appScope: { isEmpty: true } }, { appScope: { has: "edumatch" } }],
    },
    select: EDUMATCH_LOCATION_SELECT,
  });

  if (!hasAddressContent(location)) return null;

  return { address: locationToAddress(location!), lat: location!.lat, lng: location!.lng };
}

/**
 * What to show on GET: the profile's stored `homeAddress` if the student
 * typed one by hand, but re-resolved live from Hub if it was ever pulled
 * from there (`source: "central-profile"`) — so editing an address in Hub
 * shows up here without the student having to touch anything. Falls back
 * to the stored copy if that Hub location was since deleted.
 */
async function resolveHomeAddressForDisplay(
  userId: string,
  stored: Prisma.JsonValue | null,
): Promise<Prisma.JsonValue | null> {
  const storedObj =
    stored && typeof stored === "object" && !Array.isArray(stored)
      ? (stored as Record<string, unknown>)
      : null;
  const sourceLocationId =
    storedObj?.source === "central-profile" && typeof storedObj.sourceLocationId === "string"
      ? storedObj.sourceLocationId
      : null;

  if (!sourceLocationId) return stored;

  const location = await prisma.userLocation.findFirst({
    where: {
      id: sourceLocationId,
      userId,
      OR: [{ appScope: { isEmpty: true } }, { appScope: { has: "edumatch" } }],
    },
    select: EDUMATCH_LOCATION_SELECT,
  });

  return hasAddressContent(location)
    ? (locationToAddress(location!) as Prisma.JsonValue)
    : stored;
}

/**
 * The addresses available for the "use one of my Hub addresses" dropdown,
 * shaped for direct client consumption.
 */
export async function listAddressChoices(userId: string) {
  const locations = await listEduMatchLocations(userId);
  return locations.map((l) => ({
    id: l.id,
    type: l.type,
    label: l.label,
    isPrimary: l.isPrimary,
    formatted:
      l.formatted ??
      [l.street1, l.city, l.countryName ?? l.country].filter(Boolean).join(", "),
  }));
}

/** GET-time view of a student profile: live-resolved address + address choices. */
export async function getStudentProfileForDisplay(userId: string) {
  const profile = await getStudentProfile(userId);
  if (!profile) return null;

  const [homeAddress, addresses] = await Promise.all([
    resolveHomeAddressForDisplay(userId, profile.homeAddress),
    listAddressChoices(userId),
  ]);

  return { ...profile, homeAddress, addresses };
}

/**
 * Create or replace the caller's EduStudentProfile and ensure the
 * `edumatch_student` role is attached. Used by the profile POST route.
 *
 * Independence gate: a brand-new, self-serve profile (no existing row yet)
 * that declares a date of birth under 16 is refused — that's the "students
 * under 16 cannot create an independent account" rule from the onboarding
 * flow. It only applies to *first creation*: an already-existing profile
 * that later records a DOB revealing under-16 is not retroactively deleted
 * here (it simply can't transact — see student-guard.ts's
 * authorizeBookingActor, the actual enforcement point for bookings).
 */
export async function upsertStudentProfile(
  userId: string,
  input: StudentProfileInput,
): Promise<EduStudentProfile> {
  const existing = await prisma.eduStudentProfile.findUnique({ where: { userId } });

  if (!existing && input.dateOfBirth && isUnder16(input.dateOfBirth)) {
    throw new StudentGuardError(
      403,
      "Students under 16 must have an account created and managed by a parent or guardian.",
    );
  }

  let selectedAddress: Prisma.InputJsonObject | null = null;
  if (input.selectedLocationId) {
    const locations = await listEduMatchLocations(userId);
    const chosen = locations.find((l) => l.id === input.selectedLocationId);
    if (!chosen) throw new StudentGuardError(400, "Address not found.");
    selectedAddress = locationToAddress(chosen);
  }

  const centralLocation =
    input.homeAddress || selectedAddress ? null : await getPrimaryEduMatchHomeAddress(userId);
  const data = {
    gradeLevel: input.gradeLevel,
    subjectsOfInterest: input.subjectsOfInterest ?? [],
    homeAddress: (selectedAddress ??
      input.homeAddress ??
      centralLocation?.address ??
      Prisma.JsonNull) as Prisma.InputJsonValue,
    homeLat: centralLocation?.lat,
    homeLng: centralLocation?.lng,
    dateOfBirth: input.dateOfBirth ?? null,
  };

  const profile = await prisma.eduStudentProfile.upsert({
    where: { userId },
    update: data,
    create: { userId, ...data },
  });

  await assignRoleIfMissing(userId, "edumatch_student");
  // Every student starts with (or falls back to) a safe drawn avatar — see
  // avatars.ts. Fire-and-forget-safe here because it only ever touches
  // User.image, never the profile row this function returns.
  await applyDefaultAvatarIfNeeded(userId, profile.dateOfBirth);
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
  // No dateOfBirth yet on an auto-provisioned profile — applyDefaultAvatarIfNeeded
  // treats that as under-13 and defaults to a drawn avatar, the safe choice.
  await applyDefaultAvatarIfNeeded(user.id, profile.dateOfBirth);
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
  if (input.selectedLocationId !== undefined) {
    // Picking one of the Hub addresses wins over a hand-typed homeAddress
    // in the same request — there's no sane way to honor both.
    const locations = await listEduMatchLocations(userId);
    const chosen = locations.find((l) => l.id === input.selectedLocationId);
    if (!chosen) throw new StudentGuardError(400, "Address not found.");
    data.homeAddress = locationToAddress(chosen);
  } else if (input.homeAddress !== undefined) {
    data.homeAddress = (input.homeAddress ?? Prisma.JsonNull) as Prisma.InputJsonValue;
  }
  if (input.dateOfBirth !== undefined) data.dateOfBirth = input.dateOfBirth;

  const updated = await prisma.eduStudentProfile.update({ where: { userId }, data });

  // Turning 13 doesn't retroactively grant an upload — but newly supplying a
  // DOB that puts the student under 13 should still fall back to a drawn
  // avatar if they'd somehow ended up with a real photo (e.g. OAuth).
  if (input.dateOfBirth !== undefined) {
    await applyDefaultAvatarIfNeeded(userId, updated.dateOfBirth);
  }

  return updated;
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
  // Coordinates typed/geolocated directly on this form win; otherwise fall
  // back to the shared platform profile location (Hub → Addresses).
  const lat = input.homeAddress?.lat ?? centralLocation?.lat;
  const lng = input.homeAddress?.lng ?? centralLocation?.lng;
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
    homeLat: lat,
    homeLng: lng,
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
    // A submitted address always carries the form's current lat/lng (or
    // neither, if the tutor cleared them) — mirror that exactly rather than
    // leaving stale coordinates behind after an edit.
    data.homeLat = input.homeAddress?.lat ?? null;
    data.homeLng = input.homeAddress?.lng ?? null;
  }

  return prisma.eduTutorProfile.update({ where: { userId }, data });
}
