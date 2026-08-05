/**
 * Phase 4 — Wallet and payout management for tutors.
 *
 * Tracks tutor earnings, pending amounts, and handles payout logic.
 */

import { prisma } from "@asafarim/db";
import { createPayout, isStripeConfigured } from "./stripe";

export { isStripeConfigured };

export const PAYOUT_THRESHOLD_CENTS = 5000; // €50 minimum payout
export const PAYOUT_COOLDOWN_DAYS = 7; // Max 1 payout per week
export const HOLDING_PERIOD_HOURS = 24; // Funds held for 24h after session completion

export type Wallet = {
  balanceCents: number;
  pendingCents: number;
  lastPayoutAt: Date | null;
  nextPayoutEligible: boolean;
  nextPayoutAt: Date | null;
};

/**
 * Get or create a tutor's wallet.
 */
export async function getWallet(tutorId: string): Promise<Wallet> {
  const wallet = await prisma.eduWallet.findUnique({
    where: { tutorId },
  });

  if (!wallet) {
    // Return empty wallet
    return {
      balanceCents: 0,
      pendingCents: 0,
      lastPayoutAt: null,
      nextPayoutEligible: false,
      nextPayoutAt: null,
    };
  }

  const lastPayoutAt = wallet.lastPayoutAt;
  const nextPayoutAt = lastPayoutAt
    ? new Date(lastPayoutAt.getTime() + PAYOUT_COOLDOWN_DAYS * 24 * 60 * 60 * 1000)
    : null;

  const now = new Date();
  const nextPayoutEligible =
    wallet.balanceCents >= PAYOUT_THRESHOLD_CENTS &&
    (!nextPayoutAt || nextPayoutAt <= now);

  return {
    balanceCents: wallet.balanceCents,
    pendingCents: wallet.pendingCents,
    lastPayoutAt,
    nextPayoutEligible,
    nextPayoutAt,
  };
}

/**
 * Credit a tutor's wallet after a booking is completed.
 * The amount goes to pending first, then becomes available after HOLDING_PERIOD_HOURS.
 */
export async function creditWallet(
  tutorId: string,
  amountCents: number,
  bookingId: string,
): Promise<void> {
  await prisma.$transaction(async (tx) => {
    const platformFeeCents = Math.round(amountCents * 0.15);
    const netCents = amountCents - platformFeeCents;

    // Upsert wallet
    await tx.eduWallet.upsert({
      where: { tutorId },
      create: {
        tutorId,
        balanceCents: 0,
        pendingCents: netCents,
      },
      update: {
        pendingCents: { increment: netCents },
      },
    });

    // Record transaction
    await tx.eduTransaction.create({
      data: {
        tutorId,
        bookingId,
        type: "CHARGE",
        grossCents: amountCents,
        platformFeeCents,
        netCents,
      },
    });
  });
}

/**
 * Move funds from pending to available balance after holding period.
 * Call this in a cron job or webhook handler.
 */
export async function releasePendingFunds(tutorId: string, amountCents: number): Promise<void> {
  await prisma.eduWallet.update({
    where: { tutorId },
    data: {
      pendingCents: { decrement: amountCents },
      balanceCents: { increment: amountCents },
    },
  });
}

/**
 * Process a payout request.
 * Checks thresholds, triggers Stripe payout, updates wallet.
 */
export async function processPayout(
  tutorId: string,
  stripeAccountId: string,
): Promise<{ success: boolean; payoutId?: string; error?: string }> {
  const wallet = await getWallet(tutorId);

  if (!isStripeConfigured()) {
    return { success: false, error: "Stripe not configured." };
  }

  if (wallet.balanceCents < PAYOUT_THRESHOLD_CENTS) {
    return {
      success: false,
      error: `Minimum payout is €${PAYOUT_THRESHOLD_CENTS / 100}. Current balance: €${wallet.balanceCents / 100}`,
    };
  }

  if (!wallet.nextPayoutEligible) {
    return {
      success: false,
      error: `Next payout available after ${wallet.nextPayoutAt?.toISOString() ?? "N/A"}`,
    };
  }

  // Trigger Stripe payout
  const result = await createPayout(stripeAccountId, wallet.balanceCents);

  if (!result.success) {
    return { success: false, error: result.error };
  }

  // Update wallet - deduct balance, record transaction
  await prisma.$transaction(async (tx) => {
    await tx.eduWallet.update({
      where: { tutorId },
      data: {
        balanceCents: 0,
        lastPayoutAt: new Date(),
      },
    });

    // Get a valid booking ID for this transaction
    const recentTx = await tx.eduTransaction.findFirst({
      where: { tutorId },
      orderBy: { createdAt: "desc" },
    });
    const bookingId = recentTx?.bookingId ?? "unknown";

    await tx.eduTransaction.create({
      data: {
        tutorId,
        bookingId,
        type: "PAYOUT",
        grossCents: 0,
        platformFeeCents: 0,
        netCents: -wallet.balanceCents,
        stripePayoutId: result.payoutId,
      },
    });
  });

  return { success: true, payoutId: result.payoutId };
}

/**
 * List wallet transaction history.
 */
export async function listWalletTransactions(tutorId: string, limit = 50) {
  return prisma.eduTransaction.findMany({
    where: { tutorId },
    orderBy: { createdAt: "desc" },
    take: limit,
  });
}
