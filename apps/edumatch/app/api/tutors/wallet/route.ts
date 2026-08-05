import { NextResponse } from "next/server";
import { requireTutor } from "@/lib/server/profiles";
import { handleEduError, badRequest, serverError } from "@/lib/server";
import { isStripeConfigured } from "@/lib/server/stripe";
import { getWallet, processPayout, listWalletTransactions } from "@/lib/server/wallet";

export const runtime = "nodejs";

/**
 * GET /api/tutors/wallet
 *
 * Get tutor's wallet balance and transaction history.
 */
export async function GET() {
  try {
    const { user, profile } = await requireTutor();

    const wallet = await getWallet(user.id);
    const transactions = await listWalletTransactions(user.id, 20);

    return NextResponse.json({
      wallet,
      transactions,
      stripeConfigured: isStripeConfigured(),
      stripeAccountId: profile.stripeAccountId,
      payoutEnabled: profile.payoutEnabled,
    });
  } catch (error) {
    if (error instanceof Error && error.name === "EduAuthError") {
      return handleEduError("wallet", error);
    }
    return serverError("wallet", error);
  }
}

/**
 * POST /api/tutors/wallet/payout
 *
 * Request a payout to the tutor's bank account.
 */
export async function POST() {
  try {
    const { user, profile } = await requireTutor();

    if (!isStripeConfigured()) {
      return NextResponse.json(
        { error: "Stripe not configured." },
        { status: 503 },
      );
    }

    if (!profile.stripeAccountId) {
      return badRequest("No Stripe Connect account found. Complete onboarding first.");
    }

    if (!profile.payoutEnabled) {
      return badRequest("Stripe account not fully verified.");
    }

    const result = await processPayout(user.id, profile.stripeAccountId);

    if (!result.success) {
      return badRequest(result.error ?? "Payout failed.");
    }

    return NextResponse.json({
      success: true,
      payoutId: result.payoutId,
    });
  } catch (error) {
    if (error instanceof Error && error.name === "EduAuthError") {
      return handleEduError("wallet/payout", error);
    }
    return serverError("wallet/payout", error);
  }
}
