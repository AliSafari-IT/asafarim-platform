/**
 * Phase 4 — Booking lifecycle: cancellation, dispute, refund.
 *
 * Builds on existing schema fields:
 *   EduBooking.status            (SCHEDULED, COMPLETED, CANCELLED, DISPUTED)
 *   EduBooking.cancelledAt
 *   EduBooking.cancellationReason
 *   EduTransaction.type          (CHARGE, REFUND, PAYOUT, PLATFORM_FEE)
 *
 * Allowed transitions
 * -------------------
 *   SCHEDULED → CANCELLED   (student or tutor request)
 *   SCHEDULED → DISPUTED    (either party can flag)
 *   COMPLETED → DISPUTED    (post-session dispute)
 *   DISPUTED  → CANCELLED   (admin resolves "refund")
 *   DISPUTED  → COMPLETED   (admin resolves "no refund")
 *
 * Refund semantics
 * ----------------
 *   The platform records refund *intent* via an EduTransaction row of type
 *   REFUND. This does NOT call Stripe — the Stripe refund API is not yet
 *   wired up. UI copy must say "refund recorded" rather than "refund
 *   processed". A separate operational step will reconcile recorded refunds
 *   to actual Stripe refunds.
 */

import { prisma } from "@asafarim/db";
import type { EduBooking, EduTransaction } from "@asafarim/db";
import { recordEduAuditEvent } from "./audit";
import { createNotificationsForMany } from "./notifications";

export type BookingStatus =
  | "SCHEDULED"
  | "COMPLETED"
  | "CANCELLED"
  | "DISPUTED";

export type ActorRole = "STUDENT" | "TUTOR" | "ADMIN";
export type DisputeResolution = "REFUND" | "NO_REFUND" | "REQUEST_INFO";

export const DISPUTE_WINDOW_DAYS = 14;

const ALLOWED_TRANSITIONS: Record<BookingStatus, BookingStatus[]> = {
  SCHEDULED: ["CANCELLED", "DISPUTED", "COMPLETED"],
  COMPLETED: ["DISPUTED"],
  CANCELLED: [],
  DISPUTED: ["CANCELLED", "COMPLETED"],
};

export class BookingTransitionError extends Error {
  constructor(public reason: string) {
    super(reason);
    this.name = "BookingTransitionError";
  }
}

function assertTransitionAllowed(
  current: BookingStatus,
  next: BookingStatus,
): void {
  if (current === next) return;
  const allowed = ALLOWED_TRANSITIONS[current] ?? [];
  if (!allowed.includes(next)) {
    throw new BookingTransitionError(
      `Cannot transition booking from ${current} to ${next}`,
    );
  }
}

async function loadBookingOrThrow(bookingId: string): Promise<EduBooking> {
  const booking = await prisma.eduBooking.findUnique({
    where: { id: bookingId },
  });
  if (!booking) throw new BookingTransitionError("Booking not found");
  return booking;
}

function encodeDisputeLine(label: string, actorRole: ActorRole, value: string) {
  return `[${label}:${actorRole}] ${value.trim()}`;
}

function appendBookingNote(existing: string | null, note: string) {
  return [existing?.trim(), note.trim()].filter(Boolean).join("\n");
}

function assertDisputeWindowOpen(booking: EduBooking): void {
  const anchor = booking.completedAt ?? booking.scheduledAt;
  if (!anchor) return;
  const closesAt = new Date(anchor.getTime() + DISPUTE_WINDOW_DAYS * 24 * 60 * 60 * 1000);
  if (closesAt.getTime() < Date.now()) {
    throw new BookingTransitionError(
      `Disputes must be opened within ${DISPUTE_WINDOW_DAYS} days of the session.`,
    );
  }
}

async function loadBookingNotificationContext(bookingId: string) {
  return prisma.eduBooking.findUnique({
    where: { id: bookingId },
    select: {
      id: true,
      studentId: true,
      tutorId: true,
      student: { select: { name: true } },
      tutor: { select: { name: true } },
      quote: {
        select: {
          quoteRequest: {
            select: {
              inquiry: { select: { subject: true } },
            },
          },
        },
      },
    },
  });
}

async function notifyDisputeOpened(input: {
  bookingId: string;
  actorRole: ActorRole;
  reason: string;
}) {
  const booking = await loadBookingNotificationContext(input.bookingId);
  if (!booking) return;
  const subject = booking.quote?.quoteRequest?.inquiry?.subject ?? "this booking";
  const actor =
    input.actorRole === "STUDENT"
      ? (booking.student?.name ?? "A student")
      : input.actorRole === "TUTOR"
        ? (booking.tutor?.name ?? "A tutor")
        : "An admin";
  const recipientIds =
    input.actorRole === "STUDENT"
      ? [booking.tutorId]
      : input.actorRole === "TUTOR"
        ? [booking.studentId]
        : [booking.studentId, booking.tutorId];

  await createNotificationsForMany(recipientIds, "BOOKING_DISPUTED", {
    title: "Booking dispute opened",
    message: `${actor} opened a dispute for ${subject}.`,
    actionUrl: input.actorRole === "TUTOR" ? "/student/bookings" : "/tutor/bookings",
    meta: { bookingId: booking.id, subject },
  }).catch(() => undefined);
}

async function notifyDisputeResponse(input: {
  bookingId: string;
  actorRole: ActorRole;
}) {
  const booking = await loadBookingNotificationContext(input.bookingId);
  if (!booking) return;
  const subject = booking.quote?.quoteRequest?.inquiry?.subject ?? "this booking";
  const recipientIds =
    input.actorRole === "STUDENT"
      ? [booking.tutorId]
      : input.actorRole === "TUTOR"
        ? [booking.studentId]
        : [booking.studentId, booking.tutorId];

  await createNotificationsForMany(recipientIds, "DISPUTE_RESPONSE_ADDED", {
    title: "Dispute response added",
    message: `A new response was added to the dispute for ${subject}.`,
    actionUrl: input.actorRole === "TUTOR" ? "/student/bookings" : "/tutor/bookings",
    meta: { bookingId: booking.id, subject },
  }).catch(() => undefined);
}

async function notifyDisputeResolved(input: {
  bookingId: string;
  resolution: DisputeResolution;
}) {
  const booking = await loadBookingNotificationContext(input.bookingId);
  if (!booking) return;
  const subject = booking.quote?.quoteRequest?.inquiry?.subject ?? "this booking";
  await createNotificationsForMany(
    [booking.studentId, booking.tutorId],
    input.resolution === "REQUEST_INFO" ? "DISPUTE_INFO_REQUESTED" : "DISPUTE_RESOLVED",
    {
      title:
        input.resolution === "REQUEST_INFO"
          ? "More dispute information requested"
          : "Dispute resolved",
      message:
        input.resolution === "REQUEST_INFO"
          ? `An admin requested more information for the ${subject} dispute.`
          : `The dispute for ${subject} has been resolved.`,
      actionUrl: "/student/bookings",
      meta: { bookingId: booking.id, subject, resolution: input.resolution },
    },
  ).catch(() => undefined);
}

/**
 * Cancel a booking. The actor must be either the student, the tutor, or an
 * admin. Cancellation reason is required.
 */
export async function cancelBooking(input: {
  bookingId: string;
  actorId: string;
  actorRole: ActorRole;
  reason: string;
}): Promise<EduBooking> {
  const { bookingId, actorId, actorRole, reason } = input;
  const booking = await loadBookingOrThrow(bookingId);

  // Authorization
  if (actorRole === "STUDENT" && booking.studentId !== actorId) {
    throw new BookingTransitionError("Only the booking's student can cancel.");
  }
  if (actorRole === "TUTOR" && booking.tutorId !== actorId) {
    throw new BookingTransitionError("Only the booking's tutor can cancel.");
  }

  if (booking.status === "CANCELLED") {
    throw new BookingTransitionError("Booking is already cancelled.");
  }

  assertTransitionAllowed(booking.status as BookingStatus, "CANCELLED");

  if (!reason?.trim()) {
    throw new BookingTransitionError("Cancellation reason is required.");
  }

  const updated = await prisma.eduBooking.update({
    where: { id: bookingId },
    data: {
      status: "CANCELLED",
      cancelledAt: new Date(),
      cancellationReason: `[${actorRole}] ${reason.trim()}`,
    },
  });

  await recordEduAuditEvent({
    actorId,
    actorRole,
    action: "BOOKING_CANCELLED",
    entity: "EduBooking",
    entityId: bookingId,
    prevState: booking.status,
    nextState: "CANCELLED",
    reason: reason.trim(),
  });

  return updated;
}

/**
 * Open a dispute on a booking. Either the student or the tutor may dispute.
 */
export async function disputeBooking(input: {
  bookingId: string;
  actorId: string;
  actorRole: ActorRole;
  reason: string;
}): Promise<EduBooking> {
  const { bookingId, actorId, actorRole, reason } = input;
  const booking = await loadBookingOrThrow(bookingId);

  if (actorRole === "STUDENT" && booking.studentId !== actorId) {
    throw new BookingTransitionError("Only the booking's student can dispute.");
  }
  if (actorRole === "TUTOR" && booking.tutorId !== actorId) {
    throw new BookingTransitionError("Only the booking's tutor can dispute.");
  }
  if (booking.status === "DISPUTED") {
    throw new BookingTransitionError("A dispute is already open for this booking.");
  }
  assertDisputeWindowOpen(booking);

  assertTransitionAllowed(booking.status as BookingStatus, "DISPUTED");

  if (!reason?.trim()) {
    throw new BookingTransitionError("Dispute reason is required.");
  }

  const updated = await prisma.eduBooking.update({
    where: { id: bookingId },
    data: {
      status: "DISPUTED",
      cancellationReason: appendBookingNote(
        booking.cancellationReason,
        encodeDisputeLine("DISPUTE", actorRole, reason),
      ),
    },
  });

  await recordEduAuditEvent({
    actorId,
    actorRole,
    action: "BOOKING_DISPUTED",
    entity: "EduBooking",
    entityId: bookingId,
    prevState: booking.status,
    nextState: "DISPUTED",
    reason: reason.trim(),
  });

  await notifyDisputeOpened({ bookingId, actorRole, reason: reason.trim() });

  return updated;
}

/**
 * Add a party response to an open dispute. This intentionally uses the
 * existing booking note field until a dedicated dispute thread model exists.
 */
export async function respondToDispute(input: {
  bookingId: string;
  actorId: string;
  actorRole: Exclude<ActorRole, "ADMIN">;
  message: string;
}): Promise<EduBooking> {
  const { bookingId, actorId, actorRole, message } = input;
  const booking = await loadBookingOrThrow(bookingId);

  if (booking.status !== "DISPUTED") {
    throw new BookingTransitionError("Can only respond to open disputes.");
  }
  if (actorRole === "STUDENT" && booking.studentId !== actorId) {
    throw new BookingTransitionError("Only the booking's student can respond.");
  }
  if (actorRole === "TUTOR" && booking.tutorId !== actorId) {
    throw new BookingTransitionError("Only the booking's tutor can respond.");
  }
  if (!message?.trim()) {
    throw new BookingTransitionError("Response message is required.");
  }

  const updated = await prisma.eduBooking.update({
    where: { id: bookingId },
    data: {
      cancellationReason: appendBookingNote(
        booking.cancellationReason,
        encodeDisputeLine("RESPONSE", actorRole, message),
      ),
    },
  });

  await recordEduAuditEvent({
    actorId,
    actorRole,
    action: "DISPUTE_RESPONSE_ADDED",
    entity: "EduBooking",
    entityId: bookingId,
    prevState: "DISPUTED",
    nextState: "DISPUTED",
    reason: message.trim(),
  });

  await notifyDisputeResponse({ bookingId, actorRole });

  return updated;
}

/**
 * Admin resolves a dispute. Resolution = "REFUND" cancels the booking and
 * records a REFUND EduTransaction (no Stripe call). Resolution = "NO_REFUND"
 * marks the booking COMPLETED and the dispute is closed.
 */
export async function resolveDispute(input: {
  bookingId: string;
  adminId: string;
  resolution: DisputeResolution;
  reason: string;
  refundCents?: number;
}): Promise<EduBooking> {
  const { bookingId, adminId, resolution, reason, refundCents } = input;
  const booking = await loadBookingOrThrow(bookingId);

  if (booking.status !== "DISPUTED") {
    throw new BookingTransitionError(
      `Can only resolve disputed bookings (current: ${booking.status})`,
    );
  }
  if (!reason?.trim()) {
    throw new BookingTransitionError("Admin resolution notes are required.");
  }

  if (resolution === "REQUEST_INFO") {
    const updated = await prisma.eduBooking.update({
      where: { id: bookingId },
      data: {
        cancellationReason: appendBookingNote(
          booking.cancellationReason,
          encodeDisputeLine("ADMIN_REQUEST_INFO", "ADMIN", reason),
        ),
      },
    });

    await recordEduAuditEvent({
      actorId: adminId,
      actorRole: "ADMIN",
      action: "DISPUTE_INFO_REQUESTED",
      entity: "EduBooking",
      entityId: bookingId,
      prevState: "DISPUTED",
      nextState: "DISPUTED",
      reason,
      metadata: { resolution },
    });

    await notifyDisputeResolved({ bookingId, resolution });
    return updated;
  }

  const next: BookingStatus =
    resolution === "REFUND" ? "CANCELLED" : "COMPLETED";

  const updated = await prisma.eduBooking.update({
    where: { id: bookingId },
    data: {
      status: next,
      cancelledAt: next === "CANCELLED" ? new Date() : booking.cancelledAt,
      cancellationReason:
        next === "CANCELLED"
          ? appendBookingNote(booking.cancellationReason, encodeDisputeLine("ADMIN_REFUND", "ADMIN", reason))
          : appendBookingNote(booking.cancellationReason, encodeDisputeLine("ADMIN_NO_REFUND", "ADMIN", reason)),
      completedAt: next === "COMPLETED" ? new Date() : booking.completedAt,
    },
  });

  if (resolution === "REFUND") {
    await recordRefundTransaction({
      bookingId,
      tutorId: booking.tutorId,
      amountCents: refundCents ?? 0,
    });
  }

  await recordEduAuditEvent({
    actorId: adminId,
    actorRole: "ADMIN",
    action: "DISPUTE_RESOLVED",
    entity: "EduBooking",
    entityId: bookingId,
    prevState: "DISPUTED",
    nextState: next,
    reason,
    metadata: { resolution, refundCents: refundCents ?? null },
  });

  await notifyDisputeResolved({ bookingId, resolution });

  return updated;
}

/**
 * Record a refund transaction in the ledger. Does NOT call Stripe.
 *
 * Per issue #014: "Do not imply Stripe refund execution until the Stripe
 * refund call exists." Callers and UI must label this state as
 * "refund recorded" (not "refund processed").
 */
export async function recordRefundTransaction(input: {
  bookingId: string;
  tutorId: string;
  amountCents: number;
  currency?: string;
}): Promise<EduTransaction> {
  const { bookingId, tutorId, amountCents, currency } = input;
  const tx = await prisma.eduTransaction.create({
    data: {
      bookingId,
      tutorId,
      type: "REFUND",
      grossCents: amountCents,
      platformFeeCents: 0,
      netCents: -amountCents, // refund reverses cash flow to tutor
      currency: currency ?? "EUR",
    },
  });

  await recordEduAuditEvent({
    actorRole: "SYSTEM",
    action: "REFUND_RECORDED",
    entity: "EduTransaction",
    entityId: tx.id,
    metadata: { bookingId, tutorId, amountCents },
  });

  return tx;
}

/**
 * The display state shown to a student/tutor for a refund associated with a
 * booking. We deliberately do NOT have a "PROCESSED" status until Stripe is
 * wired up.
 */
export type RefundDisplayState = "NONE" | "REQUESTED" | "APPROVED" | "RECORDED";

/**
 * Compute the display refund state for a booking. UI copy should match:
 *   NONE       — no refund involved
 *   REQUESTED  — student/tutor opened a dispute, no admin decision yet
 *   APPROVED   — admin resolved a dispute with REFUND but no ledger row yet
 *   RECORDED   — REFUND EduTransaction exists; awaiting Stripe sync
 */
export async function getRefundDisplayState(
  bookingId: string,
): Promise<RefundDisplayState> {
  const booking = await prisma.eduBooking.findUnique({
    where: { id: bookingId },
    select: { status: true },
  });
  if (!booking) return "NONE";

  const refundTx = await prisma.eduTransaction.findFirst({
    where: { bookingId, type: "REFUND" },
    select: { id: true },
  });
  if (refundTx) return "RECORDED";
  if (booking.status === "DISPUTED") return "REQUESTED";
  if (booking.status === "CANCELLED") return "APPROVED";
  return "NONE";
}

export const REFUND_COPY: Record<RefundDisplayState, string> = {
  NONE: "",
  REQUESTED:
    "Refund requested — an admin is reviewing your dispute. No money has " +
    "been moved yet.",
  APPROVED:
    "Refund approved — the booking has been cancelled. The platform has not " +
    "yet processed the refund through Stripe; this will be reconciled " +
    "shortly.",
  RECORDED:
    "Refund recorded — a refund entry is on file for this booking. The " +
    "Stripe-side refund will be processed in the next reconciliation cycle.",
};
