/**
 * The enforcement boundary for age-aware accounts: who can act on their own
 * behalf, and who is financially responsible when they do.
 *
 * A student can act independently once they're 16+ and their profile has no
 * `parentUserId` — i.e. they created their own account rather than being
 * added as a parent's child. A parent-managed profile never acts
 * independently, regardless of age, until the parent relationship is
 * removed (not implemented yet — out of scope for the initial cutover).
 */

import { prisma, type EduStudentProfile } from "@asafarim/db";
import { isUnder16 } from "./age";

export class StudentGuardError extends Error {
  constructor(
    public status: 403,
    message: string,
  ) {
    super(message);
    this.name = "StudentGuardError";
  }
}

/** Pure: does this profile shape allow the student to act on their own? */
export function profileCanActIndependently(
  profile: Pick<EduStudentProfile, "dateOfBirth" | "parentUserId">,
): boolean {
  if (profile.parentUserId) return false;
  return !isUnder16(profile.dateOfBirth);
}

export async function canActIndependently(userId: string): Promise<boolean> {
  const profile = await prisma.eduStudentProfile.findUnique({
    where: { userId },
    select: { dateOfBirth: true, parentUserId: true },
  });
  if (!profile) return false;
  return profileCanActIndependently(profile);
}

/**
 * Who is legally/financially responsible for a booking made for this
 * student: the parent if the profile is parent-managed, otherwise the
 * student themselves.
 */
export function getPayerId(
  profile: Pick<EduStudentProfile, "userId" | "parentUserId">,
): string {
  return profile.parentUserId ?? profile.userId;
}

/**
 * Resolve who's allowed to transact (accept a quote, make a booking) for
 * `studentId`, given the authenticated caller `callerId`. Two valid shapes:
 *   - the caller *is* the student, and the student can act independently
 *   - the caller is that student's parent (`profile.parentUserId === callerId`)
 * Anything else is rejected with the product-specified error message.
 *
 * Returns the resolved `payerId` for the caller to persist on the booking.
 */
export async function authorizeBookingActor(
  callerId: string,
  studentId: string,
): Promise<{ payerId: string }> {
  const profile = await prisma.eduStudentProfile.findUnique({
    where: { userId: studentId },
    select: { userId: true, dateOfBirth: true, parentUserId: true },
  });
  if (!profile) {
    throw new StudentGuardError(403, "Student profile not found.");
  }

  const payerId = getPayerId(profile);

  if (callerId === studentId) {
    if (!profileCanActIndependently(profile)) {
      throw new StudentGuardError(
        403,
        "A parent or guardian must make this booking.",
      );
    }
    return { payerId };
  }

  if (callerId === profile.parentUserId) {
    return { payerId };
  }

  throw new StudentGuardError(403, "You are not authorized to act for this student.");
}
