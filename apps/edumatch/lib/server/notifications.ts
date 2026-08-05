/**
 * Phase 3 — Notification service for EduMatch.
 *
 * Handles in-app notifications (stored in EduNotification table)
 * and email delivery via Resend API.
 */

import { prisma } from "@asafarim/db";
import { Resend } from "resend";
import {
  shouldDeliver,
  shouldDeliverWith,
  type NotificationEvent,
} from "./notification-preferences";

// Notification types
export type NotificationType =
  | "QUOTE_REQUEST_CREATED"
  | "QUOTE_SUBMITTED"
  | "QUOTE_ACCEPTED"
  | "QUOTE_DECLINED"
  | "BOOKING_CONFIRMED"
  | "BOOKING_CANCELLED"
  | "BOOKING_DISPUTED"
  | "DISPUTE_RESPONSE_ADDED"
  | "DISPUTE_INFO_REQUESTED"
  | "DISPUTE_RESOLVED"
  | "AI_RESPONSE_READY"
  | "PAYOUT_SENT"
  | "TUTOR_VERIFICATION_MESSAGE";

/**
 * Map low-level notification types to high-level event categories used by
 * the preference system.
 */
export function eventForNotificationType(
  type: NotificationType,
): NotificationEvent | null {
  switch (type) {
    case "QUOTE_REQUEST_CREATED":
      return "INQUIRY_RECEIVED";
    case "QUOTE_SUBMITTED":
    case "QUOTE_ACCEPTED":
    case "QUOTE_DECLINED":
      return "QUOTE_RECEIVED";
    case "BOOKING_CONFIRMED":
      return "BOOKING_CONFIRMED";
    case "BOOKING_CANCELLED":
      return "CANCELLATION_UPDATE";
    case "BOOKING_DISPUTED":
    case "DISPUTE_RESPONSE_ADDED":
    case "DISPUTE_INFO_REQUESTED":
    case "DISPUTE_RESOLVED":
      return "DISPUTE_UPDATE";
    case "AI_RESPONSE_READY":
      return "AI_RESPONSE_READY";
    case "PAYOUT_SENT":
      return "PAYOUT_SENT";
    default:
      return null;
  }
}

export type NotificationPayload = {
  title: string;
  message: string;
  actionUrl?: string;
  meta?: Record<string, string | number | boolean>;
};

// ─── In-App Notifications ───────────────────────────────────────────────────

export async function createNotification(
  userId: string,
  type: NotificationType,
  payload: NotificationPayload,
): Promise<void> {
  // Respect per-user in-app preference. Unknown types default to delivered.
  const event = eventForNotificationType(type);
  if (event) {
    const ok = await shouldDeliver(userId, event, "inApp");
    if (!ok) return;
  }
  await prisma.eduNotification.create({
    data: {
      userId,
      type,
      payload,
      sentAt: new Date(),
    },
  });
}

export async function createNotificationsForMany(
  userIds: string[],
  type: NotificationType,
  payload: NotificationPayload,
): Promise<void> {
  if (userIds.length === 0) return;
  const event = eventForNotificationType(type);

  let recipients = userIds;
  if (event) {
    // Filter recipients by their in-app preference. Single bulk fetch.
    const prefs = await prisma.eduNotificationPreference.findMany({
      where: { userId: { in: userIds } },
    });
    const denied = new Set<string>();
    for (const p of prefs) {
      if (!shouldDeliverWith(p as never, event, "inApp")) denied.add(p.userId);
    }
    recipients = userIds.filter((id) => !denied.has(id));
    if (recipients.length === 0) return;
  }

  await prisma.eduNotification.createMany({
    data: recipients.map((userId) => ({
      userId,
      type,
      payload,
      sentAt: new Date(),
    })),
  });
}

export async function markNotificationRead(
  notificationId: string,
  userId: string,
): Promise<boolean> {
  const result = await prisma.eduNotification.updateMany({
    where: { id: notificationId, userId, readAt: null },
    data: { readAt: new Date() },
  });
  return result.count > 0;
}

export async function markAllNotificationsRead(userId: string): Promise<void> {
  await prisma.eduNotification.updateMany({
    where: { userId, readAt: null },
    data: { readAt: new Date() },
  });
}

export async function listNotifications(
  userId: string,
  opts: { unreadOnly?: boolean; limit?: number; offset?: number } = {},
) {
  const { unreadOnly = false, limit = 20, offset = 0 } = opts;
  return prisma.eduNotification.findMany({
    where: {
      userId,
      ...(unreadOnly ? { readAt: null } : {}),
    },
    orderBy: { createdAt: "desc" },
    take: limit,
    skip: offset,
  });
}

export async function countUnreadNotifications(userId: string): Promise<number> {
  return prisma.eduNotification.count({
    where: { userId, readAt: null },
  });
}

// ─── Email Notifications ─────────────────────────────────────────────────────

function getResend(): Resend | null {
  if (!process.env.RESEND_API_KEY) return null;
  return new Resend(process.env.RESEND_API_KEY);
}

const FROM_EMAIL =
  process.env.NEXT_PUBLIC_RESEND_FROM_EMAIL ?? "noreply@edumatch.asafarim.com";

export type EmailTemplate = {
  to: string;
  subject: string;
  html: string;
};

async function sendEmail(template: EmailTemplate): Promise<void> {
  const resend = getResend();
  if (!resend) {
    console.warn("[notifications] RESEND_API_KEY not set — email skipped.");
    return;
  }
  try {
    await resend.emails.send({ from: FROM_EMAIL, ...template });
  } catch (err) {
    console.error("[notifications] Failed to send email:", err);
  }
}

/**
 * Send an email respecting the recipient's preference for the given event.
 * Resolves the user's preferences via their email and skips delivery if
 * they've opted out of email for that event.
 */
async function sendEmailForEvent(
  userId: string | null,
  event: NotificationEvent | null,
  template: EmailTemplate,
): Promise<void> {
  if (userId && event) {
    const ok = await shouldDeliver(userId, event, "email");
    if (!ok) return;
  }
  await sendEmail(template);
}

// ─── Domain Event Helpers ────────────────────────────────────────────────────

/**
 * Notify tutors when a new quote request is created.
 * Creates in-app notifications for all matched tutor IDs.
 * Optionally sends email to each tutor.
 */
export async function notifyTutorsOfQuoteRequest(opts: {
  tutorIds: string[];
  quoteRequestId: string;
  subject: string;
  gradeLevel: string;
}): Promise<void> {
  const { tutorIds, quoteRequestId, subject, gradeLevel } = opts;
  if (tutorIds.length === 0) return;

  const payload: NotificationPayload = {
    title: "New Quote Request",
    message: `A student needs help with ${subject} (${gradeLevel}). Submit a quote before it expires.`,
    actionUrl: `/tutor/requests`,
    meta: { quoteRequestId, subject, gradeLevel },
  };

  await createNotificationsForMany(tutorIds, "QUOTE_REQUEST_CREATED", payload);

  // Fire-and-forget email to each tutor (best-effort)
  const tutors = await prisma.user.findMany({
    where: { id: { in: tutorIds } },
    select: { id: true, name: true, email: true },
  });

  for (const tutor of tutors) {
    if (!tutor.email) continue;
    void sendEmailForEvent(tutor.id, "INQUIRY_RECEIVED", {
      to: tutor.email,
      subject: `New quote request: ${subject}`,
      html: `
        <p>Hi ${tutor.name ?? "Tutor"},</p>
        <p>A student near you is looking for help with <strong>${subject}</strong> (${gradeLevel}).</p>
        <p>
          <a href="${process.env.EDUMATCH_URL ?? "https://edumatch.asafarim.com"}/tutor/requests">
            View and submit your quote →
          </a>
        </p>
        <p>This request expires in 48 hours.</p>
      `,
    });
  }
}

/**
 * Notify student when a tutor submits a quote.
 */
export async function notifyStudentOfQuoteSubmitted(opts: {
  studentId: string;
  studentEmail: string | null;
  studentName: string | null;
  tutorName: string | null;
  inquiryId: string;
  quoteRequestId: string;
  subject: string;
  hourlyRateCents: number;
}): Promise<void> {
  const { studentId, studentEmail, studentName, tutorName, inquiryId, quoteRequestId, subject, hourlyRateCents } = opts;

  const payload: NotificationPayload = {
    title: "New Tutor Quote",
    message: `${tutorName ?? "A tutor"} submitted a quote for your ${subject} inquiry at €${(hourlyRateCents / 100).toFixed(0)}/hr.`,
    actionUrl: `/student/inquiry/${inquiryId}/quotes?qr=${quoteRequestId}`,
    meta: { inquiryId, quoteRequestId, hourlyRateCents },
  };

  await createNotification(studentId, "QUOTE_SUBMITTED", payload);

  if (studentEmail) {
    void sendEmailForEvent(studentId, "QUOTE_RECEIVED", {
      to: studentEmail,
      subject: `New quote for your ${subject} inquiry`,
      html: `
        <p>Hi ${studentName ?? "Student"},</p>
        <p><strong>${tutorName ?? "A tutor"}</strong> submitted a quote for your <strong>${subject}</strong> inquiry.</p>
        <p>Rate: <strong>€${(hourlyRateCents / 100).toFixed(0)}/hr</strong></p>
        <p>
          <a href="${process.env.EDUMATCH_URL ?? "https://edumatch.asafarim.com"}/student/inquiry/${inquiryId}/quotes?qr=${quoteRequestId}">
            Review quote →
          </a>
        </p>
      `,
    });
  }
}

/**
 * Notify tutor when their quote is accepted.
 */
export async function notifyTutorOfQuoteAccepted(opts: {
  tutorId: string;
  tutorEmail: string | null;
  tutorName: string | null;
  studentName: string | null;
  bookingId: string;
  subject: string;
}): Promise<void> {
  const { tutorId, tutorEmail, tutorName, studentName, bookingId, subject } = opts;

  const payload: NotificationPayload = {
    title: "Quote Accepted! 🎉",
    message: `${studentName ?? "A student"} accepted your quote for ${subject}. Your booking is confirmed.`,
    actionUrl: `/tutor/bookings/${bookingId}`,
    meta: { bookingId, subject },
  };

  await createNotification(tutorId, "QUOTE_ACCEPTED", payload);

  if (tutorEmail) {
    void sendEmailForEvent(tutorId, "BOOKING_CONFIRMED", {
      to: tutorEmail,
      subject: `Booking confirmed: ${subject}`,
      html: `
        <p>Hi ${tutorName ?? "Tutor"},</p>
        <p>Great news! <strong>${studentName ?? "A student"}</strong> accepted your quote for <strong>${subject}</strong>.</p>
        <p>Your booking is now confirmed.</p>
        <p>
          <a href="${process.env.EDUMATCH_URL ?? "https://edumatch.asafarim.com"}/tutor/bookings/${bookingId}">
            View booking →
          </a>
        </p>
      `,
    });
  }
}

/**
 * Notify a party about a new verification message. Verification messages are
 * transactional and not subject to per-event opt-out (the event maps to null,
 * so createNotification always delivers in-app; email is best-effort).
 *
 * - ADMIN → tutor: recipient is the tutor, links to /tutor/verification.
 * - TUTOR → admin: recipient is the last reviewer, links to the admin panel.
 */
export async function notifyVerificationMessage(opts: {
  recipientId: string;
  preview: string;
  forAdmin?: boolean;
  tutorId?: string;
}): Promise<void> {
  const { recipientId, preview, forAdmin = false, tutorId } = opts;
  const base = process.env.EDUMATCH_URL ?? "https://edumatch.asafarim.com";
  const actionUrl = forAdmin
    ? `/admin/tutor-verifications?tutor=${tutorId ?? ""}`
    : `/tutor/verification`;

  await createNotification(recipientId, "TUTOR_VERIFICATION_MESSAGE", {
    title: forAdmin
      ? "Tutor replied about verification"
      : "Message about your verification",
    message: preview,
    actionUrl,
  });

  const user = await prisma.user.findUnique({
    where: { id: recipientId },
    select: { email: true, name: true },
  });
  if (user?.email) {
    void sendEmail({
      to: user.email,
      subject: forAdmin
        ? "A tutor replied to a verification message"
        : "New message about your tutor verification",
      html: `
        <p>Hi ${user.name ?? "there"},</p>
        <p>${forAdmin ? "A tutor replied to a verification message:" : "You have a new message about your tutor verification:"}</p>
        <blockquote style="border-left:3px solid #ccc;padding-left:12px;color:#444;">${preview}</blockquote>
        <p><a href="${base}${actionUrl}">Open the conversation →</a></p>
      `,
    });
  }
}

/**
 * Notify tutor when their quote is declined.
 */
export async function notifyTutorOfQuoteDeclined(opts: {
  tutorId: string;
  subject: string;
}): Promise<void> {
  const { tutorId, subject } = opts;

  await createNotification(tutorId, "QUOTE_DECLINED", {
    title: "Quote Declined",
    message: `Your quote for a ${subject} inquiry was not selected this time.`,
    actionUrl: `/tutor/requests`,
  });
}
