/**
 * The parent flow: a user with an `EduParentProfile` can create and manage
 * one or more `EduStudentProfile` rows for their children (under-16,
 * parent-managed accounts — see student-guard.ts for the independence
 * cutoff this feeds).
 *
 * A managed child gets a real `User` row (so bookings, sessions, and the
 * learning journey all work the same way they do for an independent
 * student) but no login credentials of their own yet — the "restricted
 * child login" from the product spec is an explicit Phase 2, not built
 * here. The child's `User.email` is a synthetic, non-deliverable
 * placeholder scoped to the parent, which is what makes it safe to create
 * without the child ever having agreed to anything themselves.
 */

import { randomUUID } from "node:crypto";
import { prisma, Prisma, type EduStudentProfile } from "@asafarim/db";
import type { AddChildInput } from "./validation";
import { assignRoleIfMissing } from "./profiles";
import { applyDefaultAvatarIfNeeded } from "./avatars";

export class ParentError extends Error {
  constructor(
    public status: 403 | 404,
    message: string,
  ) {
    super(message);
    this.name = "ParentError";
  }
}

/** Idempotent: creating a parent profile for a user who already has one just returns it. */
export async function ensureParentProfile(userId: string): Promise<{ userId: string }> {
  const profile = await prisma.eduParentProfile.upsert({
    where: { userId },
    update: {},
    create: { userId },
    select: { userId: true },
  });
  return profile;
}

export async function getParentProfile(userId: string): Promise<{ userId: string } | null> {
  return prisma.eduParentProfile.findUnique({ where: { userId }, select: { userId: true } });
}

/**
 * Create a child account: a placeholder `User` row plus an
 * `EduStudentProfile` with `parentUserId` set to the caller. The caller must
 * already have an `EduParentProfile` — callers should `ensureParentProfile`
 * first (the onboarding flow does this in one step).
 */
export async function addChildProfile(
  parentUserId: string,
  input: AddChildInput,
): Promise<EduStudentProfile> {
  const parent = await prisma.user.findUnique({
    where: { id: parentUserId },
    select: { name: true, email: true },
  });
  if (!parent) throw new ParentError(404, "Parent account not found.");

  const parentProfile = await getParentProfile(parentUserId);
  if (!parentProfile) throw new ParentError(403, "Not registered as a parent.");

  const child = await prisma.$transaction(async (tx) => {
    const childUser = await tx.user.create({
      data: {
        name: input.name,
        // Non-deliverable placeholder, scoped to the parent's own account so
        // it can never collide across families and never accidentally
        // resolves to a real inbox.
        email: `child+${randomUUID()}@managed.edumatch.invalid`,
      },
      select: { id: true },
    });

    const profile = await tx.eduStudentProfile.create({
      data: {
        userId: childUser.id,
        parentUserId,
        gradeLevel: input.gradeLevel,
        subjectsOfInterest: input.subjectsOfInterest,
        homeAddress: (input.homeAddress ?? Prisma.JsonNull) as Prisma.InputJsonValue,
        dateOfBirth: input.dateOfBirth,
        isMinor: true,
        guardianName: parent.name,
        guardianEmail: parent.email,
      },
    });

    return profile;
  });

  await assignRoleIfMissing(child.userId, "edumatch_student");
  await applyDefaultAvatarIfNeeded(child.userId, child.dateOfBirth);
  return child;
}

/** All children (EduStudentProfile rows) managed by this parent. */
export async function listChildren(parentUserId: string): Promise<
  Array<{
    userId: string;
    name: string | null;
    image: string | null;
    gradeLevel: string;
    dateOfBirth: Date | null;
    createdAt: Date;
  }>
> {
  const rows = await prisma.eduStudentProfile.findMany({
    where: { parentUserId },
    orderBy: { createdAt: "asc" },
    select: {
      userId: true,
      gradeLevel: true,
      dateOfBirth: true,
      createdAt: true,
      user: { select: { name: true, image: true } },
    },
  });
  return rows.map((r) => ({
    userId: r.userId,
    name: r.user.name,
    image: r.user.image,
    gradeLevel: r.gradeLevel,
    dateOfBirth: r.dateOfBirth,
    createdAt: r.createdAt,
  }));
}

/** A single child's profile, scoped to the calling parent — 404s rather than 403s if it's not theirs, so a parent can't probe for other families' child ids. */
export async function getChildProfile(
  parentUserId: string,
  childUserId: string,
): Promise<EduStudentProfile> {
  const profile = await prisma.eduStudentProfile.findFirst({
    where: { userId: childUserId, parentUserId },
  });
  if (!profile) throw new ParentError(404, "Child profile not found.");
  return profile;
}
