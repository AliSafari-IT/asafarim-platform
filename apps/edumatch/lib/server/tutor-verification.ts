/**
 * Phase 4 — Tutor verification workflow.
 *
 * `EduTutorProfile.verifiedAt` remains the canonical "is this tutor verified?"
 * field. Around it, `EduTutorVerification` records the full admin review
 * workflow: pending → (needs_changes ↻) → verified | rejected.
 *
 * Behavior contract
 * -----------------
 *   - A tutor's *current* verification record is the most-recently-created
 *     EduTutorVerification row for that tutor; older rows are kept for audit.
 *   - When status is set to VERIFIED, EduTutorProfile.verifiedAt is stamped
 *     with the resolution time. Otherwise, verifiedAt is cleared.
 *   - All transitions emit an EduAuditEvent.
 *
 * The intent is that admins call `setTutorVerificationStatus` (which writes
 * a new row reflecting the new state) rather than mutating prior rows.
 */

import { prisma, Prisma } from "@asafarim/db";
import { recordEduAuditEvent } from "./audit";
import { postVerificationMessage } from "./verification-messages";

export type TutorVerificationStatus =
  | "PENDING"
  | "NEEDS_CHANGES"
  | "VERIFIED"
  | "REJECTED";

export type VerificationChecklist = {
  identityVerified?: boolean;
  credentialsVerified?: boolean;
  backgroundCheck?: boolean;
  profileComplete?: boolean;
  notes?: string;
};

const TERMINAL_STATUSES = new Set<TutorVerificationStatus>([
  "VERIFIED",
  "REJECTED",
]);

/**
 * Get the most recent EduTutorVerification record for a tutor, or null if
 * no review has ever been logged.
 */
export async function getCurrentVerification(tutorId: string) {
  return prisma.eduTutorVerification.findFirst({
    where: { tutorId },
    orderBy: { createdAt: "desc" },
  });
}

/**
 * Return all verification rows for a tutor (most-recent first), to render an
 * admin-side review history.
 */
export async function getVerificationHistory(tutorId: string) {
  return prisma.eduTutorVerification.findMany({
    where: { tutorId },
    orderBy: { createdAt: "desc" },
    include: { reviewer: { select: { id: true, name: true, email: true } } },
  });
}

/**
 * Tutor-side: request verification. Idempotent — if there is already an open
 * (non-terminal) review, returns it. If the latest review was terminal, opens
 * a fresh PENDING review.
 */
export async function requestVerification(tutorId: string) {
  const current = await getCurrentVerification(tutorId);
  if (current && !TERMINAL_STATUSES.has(current.status as TutorVerificationStatus)) {
    return current;
  }
  const row = await prisma.eduTutorVerification.create({
    data: {
      tutorId,
      status: "PENDING",
    },
  });
  await recordEduAuditEvent({
    actorId: tutorId,
    actorRole: "TUTOR",
    action: "TUTOR_VERIFICATION_REQUESTED",
    entity: "EduTutorVerification",
    entityId: row.id,
    nextState: "PENDING",
  });
  return row;
}

export type SetStatusInput = {
  tutorId: string;
  reviewerId: string;
  status: TutorVerificationStatus;
  checklist?: VerificationChecklist;
  adminNotes?: string;
  tutorMessage?: string;
};

/**
 * Admin-side: write a new verification row reflecting the new state, and
 * sync EduTutorProfile.verifiedAt.
 *
 * For VERIFIED: stamps verifiedAt = now, resolvedAt = now.
 * For REJECTED: clears verifiedAt, stamps resolvedAt = now.
 * For NEEDS_CHANGES: clears verifiedAt, stamps resolvedAt = now (the review
 *   iteration is "resolved" in the sense that the admin has handed it back to
 *   the tutor; a new PENDING row will be created by the tutor when they
 *   re-submit).
 * For PENDING: clears verifiedAt; resolvedAt stays null.
 */
export async function setTutorVerificationStatus(
  input: SetStatusInput,
): Promise<{ id: string }> {
  const { tutorId, reviewerId, status, checklist, adminNotes, tutorMessage } = input;
  const prior = await getCurrentVerification(tutorId);

  const isResolved = status !== "PENDING";
  const now = new Date();

  // Persist the new review row. We always insert (never mutate) so the trail
  // is preserved.
  const row = await prisma.eduTutorVerification.create({
    data: {
      tutorId,
      reviewerId,
      status,
      checklist: (checklist ?? Prisma.JsonNull) as Prisma.InputJsonValue,
      adminNotes: adminNotes ?? null,
      tutorMessage: tutorMessage ?? null,
      resolvedAt: isResolved ? now : null,
    },
    select: { id: true },
  });

  // Sync the canonical verifiedAt flag on the profile.
  await prisma.eduTutorProfile.update({
    where: { userId: tutorId },
    data: {
      verifiedAt: status === "VERIFIED" ? now : null,
    },
  });

  // If the admin included a message to the tutor, surface it in the two-way
  // verification thread (this also notifies the tutor in-app + by email).
  if (tutorMessage && tutorMessage.trim()) {
    await postVerificationMessage({
      tutorId,
      senderId: reviewerId,
      senderRole: "ADMIN",
      body: tutorMessage,
    });
  }

  // Audit event keyed off the new status.
  const action =
    status === "VERIFIED"
      ? "TUTOR_VERIFICATION_VERIFIED"
      : status === "REJECTED"
        ? "TUTOR_VERIFICATION_REJECTED"
        : status === "NEEDS_CHANGES"
          ? "TUTOR_VERIFICATION_NEEDS_CHANGES"
          : "TUTOR_VERIFICATION_REQUESTED";
  await recordEduAuditEvent({
    actorId: reviewerId,
    actorRole: "ADMIN",
    action,
    entity: "EduTutorVerification",
    entityId: row.id,
    prevState: prior?.status ?? null,
    nextState: status,
    reason: tutorMessage ?? adminNotes ?? null,
    metadata: { tutorId },
  });

  return row;
}

/**
 * Admin queue: list tutors whose latest verification is non-terminal
 * (PENDING or NEEDS_CHANGES) plus tutors who have no verification record yet.
 */
export async function listAdminVerificationQueue(opts: { limit?: number } = {}) {
  const { limit = 50 } = opts;

  // Fetch all tutors with their latest review (joined via groupBy is awkward
  // in Prisma; do the filter in app code).
  const tutorProfiles = await prisma.eduTutorProfile.findMany({
    take: limit,
    orderBy: { createdAt: "desc" },
    select: {
      userId: true,
      bio: true,
      subjectsTaught: true,
      verifiedAt: true,
      user: { select: { id: true, name: true, email: true } },
    },
  });

  const userIds = tutorProfiles.map((t) => t.userId);
  const reviews = await prisma.eduTutorVerification.findMany({
    where: { tutorId: { in: userIds } },
    orderBy: { createdAt: "desc" },
  });

  const latestByTutor = new Map<string, (typeof reviews)[number]>();
  for (const r of reviews) {
    if (!latestByTutor.has(r.tutorId)) latestByTutor.set(r.tutorId, r);
  }

  return tutorProfiles.map((t) => ({
    tutorId: t.userId,
    name: t.user.name,
    email: t.user.email,
    bio: t.bio,
    subjectsTaught: t.subjectsTaught,
    verifiedAt: t.verifiedAt,
    latestReview: latestByTutor.get(t.userId) ?? null,
    effectiveStatus:
      latestByTutor.get(t.userId)?.status ??
      (t.verifiedAt ? "VERIFIED" : "PENDING"),
  }));
}

/**
 * Whether unverified tutors are excluded from quote-request matching. Driven
 * by env so we can flip it without a code change. Default: include unverified
 * tutors (existing behavior) but down-rank them in scoring.
 */
export function unverifiedTutorsExcluded(): boolean {
  return (process.env.EDUMATCH_REQUIRE_VERIFIED_TUTORS ?? "0") === "1";
}
