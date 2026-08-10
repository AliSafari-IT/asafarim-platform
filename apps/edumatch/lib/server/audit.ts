/**
 * Phase 4 — EduMatch audit trail.
 *
 * Distinct from the platform-wide `AuditLog` model: EduMatch state changes
 * (inquiry → ai → quote → booking → payout, plus tutor verification, refund,
 * dispute) are recorded in `EduAuditEvent` so the trail is queryable by
 * domain entity without polluting platform audit. Events are append-only.
 *
 * Callers should record an event after the underlying state change has been
 * committed. All inputs are optional except `action` and `entity` so we can
 * record system-driven events (webhook, scheduled job) where the actor is
 * the platform itself.
 *
 * `recordEduAuditEvent` swallows DB errors and logs them; audit failures
 * should never break the user-visible flow.
 */

import { prisma } from "@asafarim/db";

export type EduAuditActorRole = "STUDENT" | "TUTOR" | "ADMIN" | "SYSTEM";

export type EduAuditAction =
  // Inquiry / AI
  | "INQUIRY_CREATED"
  | "AI_RESPONSE_GENERATED"
  | "AI_RESPONSE_REFUSED"
  // Quotes
  | "QUOTE_REQUEST_CREATED"
  | "QUOTE_SUBMITTED"
  | "QUOTE_ACCEPTED"
  | "QUOTE_DECLINED"
  // Bookings
  | "BOOKING_CONFIRMED"
  | "BOOKING_CANCELLED"
  | "BOOKING_DISPUTED"
  | "DISPUTE_RESOLVED"
  | "REFUND_RECORDED"
  // Checkout / payouts
  | "CHECKOUT_COMPLETED"
  | "PAYOUT_REQUESTED"
  | "PAYOUT_SENT"
  | "PAYOUT_FAILED"
  // Learning brief experience
  | "BRIEF_CREATED"
  | "BRIEF_CONFIRMED"
  | "SESSION_RECORDED"
  | "REVIEW_SUBMITTED"
  // Tutor verification
  | "TUTOR_VERIFICATION_REQUESTED"
  | "TUTOR_VERIFICATION_NEEDS_CHANGES"
  | "TUTOR_VERIFICATION_VERIFIED"
  | "TUTOR_VERIFICATION_REJECTED";

export type EduAuditEventInput = {
  actorId?: string | null;
  actorRole?: EduAuditActorRole | null;
  action: EduAuditAction | string;
  entity: string;
  entityId?: string | null;
  prevState?: string | null;
  nextState?: string | null;
  reason?: string | null;
  metadata?: Record<string, unknown> | null;
};

/**
 * Append a single audit event. Failures are logged but never thrown — audit
 * recording must never break the surrounding business flow.
 */
export async function recordEduAuditEvent(input: EduAuditEventInput): Promise<void> {
  try {
    await prisma.eduAuditEvent.create({
      data: {
        actorId: input.actorId ?? null,
        actorRole: input.actorRole ?? null,
        action: input.action,
        entity: input.entity,
        entityId: input.entityId ?? null,
        prevState: input.prevState ?? null,
        nextState: input.nextState ?? null,
        reason: input.reason ?? null,
        metadata: (input.metadata ?? null) as never,
      },
    });
  } catch (err) {
    console.error("[edu-audit] failed to record event:", input.action, err);
  }
}

export type ListEduAuditEventsOpts = {
  entity?: string;
  entityId?: string;
  action?: string;
  actorId?: string;
  limit?: number;
  offset?: number;
};

/**
 * List audit events for the admin view. Defaults to most recent 50.
 */
export async function listEduAuditEvents(opts: ListEduAuditEventsOpts = {}) {
  const { entity, entityId, action, actorId, limit = 50, offset = 0 } = opts;
  return prisma.eduAuditEvent.findMany({
    where: {
      ...(entity ? { entity } : {}),
      ...(entityId ? { entityId } : {}),
      ...(action ? { action } : {}),
      ...(actorId ? { actorId } : {}),
    },
    orderBy: { createdAt: "desc" },
    take: limit,
    skip: offset,
    include: {
      actor: { select: { id: true, name: true, email: true } },
    },
  });
}
