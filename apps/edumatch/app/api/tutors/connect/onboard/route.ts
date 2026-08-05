import { NextResponse } from "next/server";
import { requireTutor } from "@/lib/server/profiles";
import { handleEduError, badRequest, serverError } from "@/lib/server";
import { createConnectAccount, isStripeConfigured, isMockMode } from "@/lib/server/stripe";
import { prisma } from "@asafarim/db";

export const runtime = "nodejs";

/**
 * POST /api/tutors/connect/onboard
 *
 * Start Stripe Connect Express onboarding for a tutor.
 * Creates a Connect account if not exists, returns onboarding URL.
 */
export async function POST(req: Request) {
  try {
    const { user, profile } = await requireTutor();

    if (!isStripeConfigured()) {
      return NextResponse.json(
        { error: "Stripe not configured. Set STRIPE_SECRET_KEY." },
        { status: 503 },
      );
    }

    // If already has an account, check if onboarding is complete
    if (profile.stripeAccountId) {
      // In mock mode, always return a redirect URL to simulate completing onboarding
      if (isMockMode() || profile.stripeAccountId.startsWith("acct_mock_")) {
        const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3005";
        const refreshUrl = `${appUrl}/tutor/connect/refresh`;
        const returnUrl = `${appUrl}/tutor/connect/success`;
        return NextResponse.json({
          url: `${returnUrl}?mock=onboarding_complete&account=${profile.stripeAccountId}`,
          accountId: profile.stripeAccountId,
        });
      }
      return NextResponse.json({
        accountId: profile.stripeAccountId,
        alreadyOnboarded: true,
        message: "Tutor already has a Stripe Connect account.",
      });
    }

    const body = (await req.json().catch(() => ({}))) as {
      refreshUrl?: string;
      returnUrl?: string;
    };

    const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3005";
    const refreshUrl = body.refreshUrl ?? `${appUrl}/tutor/connect/refresh`;
    const returnUrl = body.returnUrl ?? `${appUrl}/tutor/dashboard`;

    // Create Connect account
    const result = await createConnectAccount(
      user.id,
      user.email ?? "",
      refreshUrl,
      returnUrl,
    );

    if (!result.success) {
      return badRequest(result.error);
    }

    // Store the account ID in the tutor profile (pending onboarding completion)
    await prisma.eduTutorProfile.update({
      where: { userId: user.id },
      data: { stripeAccountId: result.accountId },
    });

    return NextResponse.json({
      url: result.url,
      accountId: result.accountId,
    });
  } catch (error) {
    if (error instanceof Error && error.name === "EduAuthError") {
      return handleEduError("connect/onboard", error);
    }
    return serverError("connect/onboard", error);
  }
}

/**
 * GET /api/tutors/connect/onboard
 *
 * Check onboarding status.
 */
export async function GET() {
  try {
    const { user, profile } = await requireTutor();

    return NextResponse.json({
      hasAccount: !!profile.stripeAccountId,
      payoutEnabled: profile.payoutEnabled,
      stripeAccountId: profile.stripeAccountId,
    });
  } catch (error) {
    if (error instanceof Error && error.name === "EduAuthError") {
      return handleEduError("connect/onboard", error);
    }
    return serverError("connect/onboard", error);
  }
}
