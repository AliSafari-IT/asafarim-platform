import { prisma, type Prisma } from "@asafarim/db";

/**
 * In-flight claim for AI generation on one inquiry (#542).
 *
 * Both AI paths (the queued `orchestrateResponse` and the streaming
 * `GET /api/inquiries/[id]/ai` route) claim the inquiry before any paid
 * provider call, so two attempts for the same inquiry can't both reach a
 * provider. The claim is a timestamp on `EduInquiry.aiClaimedAt`, set with
 * one conditional `updateMany` so the database decides who wins.
 *
 * A claim older than {@link AI_CLAIM_STALE_MS} is treated as left behind by
 * a crashed attempt and may be taken over. The taker gets
 * `staleTakeover: true` so it can flag the retry instead of silently paying
 * for the same work twice.
 */
export const AI_CLAIM_STALE_MS = 5 * 60 * 1000;

export type AiClaim =
  | { claimed: true; claimedAt: Date; staleTakeover: boolean }
  | { claimed: false };

export async function claimAiGeneration(
  inquiryId: string,
  options: { excludeStatuses?: readonly string[]; now?: Date } = {}
): Promise<AiClaim> {
  const now = options.now ?? new Date();
  const staleBefore = new Date(now.getTime() - AI_CLAIM_STALE_MS);
  const statusFilter =
    options.excludeStatuses && options.excludeStatuses.length > 0
      ? { status: { notIn: [...options.excludeStatuses] } }
      : {};

  // A free inquiry is the normal case; try it first so a stale takeover is
  // only reported when a stale claim really was replaced.
  const fresh = await prisma.eduInquiry.updateMany({
    where: { id: inquiryId, aiClaimedAt: null, ...statusFilter },
    data: { aiClaimedAt: now },
  });
  if (fresh.count === 1) {
    return { claimed: true, claimedAt: now, staleTakeover: false };
  }

  const stale = await prisma.eduInquiry.updateMany({
    where: { id: inquiryId, aiClaimedAt: { lt: staleBefore }, ...statusFilter },
    data: { aiClaimedAt: now },
  });
  if (stale.count === 1) {
    return { claimed: true, claimedAt: now, staleTakeover: true };
  }

  return { claimed: false };
}

/**
 * Release a claim this caller still holds. Matching on the exact timestamp
 * means a caller whose claim was taken over never clears the new holder's
 * claim. Best effort: a failure here only delays the next attempt until the
 * claim goes stale.
 */
export async function releaseAiClaim(
  inquiryId: string,
  claimedAt: Date
): Promise<void> {
  try {
    await prisma.eduInquiry.updateMany({
      where: { id: inquiryId, aiClaimedAt: claimedAt },
      data: { aiClaimedAt: null },
    });
  } catch (err) {
    console.error("[AI] releasing the in-flight claim failed:", err);
  }
}

/** The caller's claim was taken over by a newer attempt before it could save. */
export class AiClaimLostError extends Error {
  constructor(inquiryId: string) {
    super(`AI claim on inquiry ${inquiryId} was superseded by a newer attempt`);
    this.name = "AiClaimLostError";
  }
}

/**
 * Persist an AI attempt's response row and inquiry update in one
 * transaction, but only while the caller still holds its claim. The inquiry
 * update matches on the exact `claimedAt` and clears it; if no row matches
 * (a newer attempt took the claim over), the transaction rolls back and
 * {@link AiClaimLostError} is thrown, so a superseded attempt never writes a
 * second response or changes the inquiry's state.
 */
export async function persistUnderClaim(
  inquiryId: string,
  claimedAt: Date,
  writes: {
    response: Prisma.EduAiResponseUncheckedCreateInput;
    inquiry: Prisma.EduInquiryUpdateManyMutationInput;
  }
): Promise<{ id: string }> {
  return prisma.$transaction(async (tx) => {
    const updated = await tx.eduInquiry.updateMany({
      where: { id: inquiryId, aiClaimedAt: claimedAt },
      data: { ...writes.inquiry, aiClaimedAt: null },
    });
    if (updated.count !== 1) throw new AiClaimLostError(inquiryId);
    return tx.eduAiResponse.create({
      data: writes.response,
      select: { id: true },
    });
  });
}
