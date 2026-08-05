/**
 * Phase 4 — Stripe Connect integration.
 *
 * - Onboarding tutors via Stripe Connect Express
 * - Creating PaymentIntents with split payments
 * - Wallet management and payouts
 * - Webhook handling for Connect events
 */

import Stripe from "stripe";

const STRIPE_SECRET_KEY = process.env.STRIPE_SECRET_KEY;
const STRIPE_WEBHOOK_SECRET = process.env.STRIPE_WEBHOOK_SECRET;
const STRIPE_MOCK_MODE = process.env.STRIPE_MOCK_MODE === "true";

export const stripe = STRIPE_SECRET_KEY && !STRIPE_MOCK_MODE
  ? new Stripe(STRIPE_SECRET_KEY, { apiVersion: "2025-02-24.acacia" })
  : null;

export const PLATFORM_FEE_PERCENT = 15; // 15% platform fee

export function isStripeConfigured(): boolean {
  return !!stripe || STRIPE_MOCK_MODE;
}

export function isMockMode(): boolean {
  return STRIPE_MOCK_MODE;
}

export type ConnectOnboardingResult =
  | { success: true; url: string; accountId: string }
  | { success: false; error: string };

/**
 * Create a Stripe Connect Express account for a tutor.
 * Returns the onboarding URL to redirect the tutor to Stripe.
 */
export async function createConnectAccount(
  tutorId: string,
  email: string,
  refreshUrl: string,
  returnUrl: string,
): Promise<ConnectOnboardingResult> {
  // Mock mode: simulate successful Connect account creation
  if (STRIPE_MOCK_MODE) {
    const mockAccountId = `acct_mock_${tutorId.slice(0, 8)}`;
    console.log(`[MOCK] Creating Stripe Connect account for ${email}: ${mockAccountId}`);
    return {
      success: true,
      url: `${returnUrl}?mock=onboarding_complete&account=${mockAccountId}`,
      accountId: mockAccountId,
    };
  }

  if (!stripe) {
    return { success: false, error: "Stripe not configured. Set STRIPE_SECRET_KEY." };
  }

  try {
    // Create Express account (faster onboarding than Standard)
    const account = await stripe.accounts.create({
      type: "express",
      email,
      metadata: { tutorId },
      capabilities: {
        transfers: { requested: true },
        card_payments: { requested: true },
      },
      settings: {
        payouts: {
          schedule: {
            interval: "manual", // We'll trigger payouts programmatically
          },
        },
      },
    });

    // Create onboarding link
    const accountLink = await stripe.accountLinks.create({
      account: account.id,
      refresh_url: refreshUrl,
      return_url: returnUrl,
      type: "account_onboarding",
    });

    return {
      success: true,
      url: accountLink.url,
      accountId: account.id,
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    // Detect specific Stripe Connect not enabled error
    if (message.includes("signed up for Connect") || message.includes("create new accounts")) {
      return {
        success: false,
        error: "Stripe Connect is not enabled on this account. Please sign up for Stripe Connect at https://dashboard.stripe.com/connect before creating tutor accounts.",
      };
    }
    return { success: false, error: `Stripe Connect error: ${message}` };
  }
}

/**
 * Get the login link for a tutor to access their Stripe Express dashboard.
 */
export async function getConnectDashboardLink(
  stripeAccountId: string,
): Promise<string | null> {
  // Mock mode: return a placeholder dashboard URL
  if (STRIPE_MOCK_MODE || stripeAccountId.startsWith("acct_mock_")) {
    return `https://dashboard.stripe.com/test/connect/accounts/${stripeAccountId}`;
  }

  if (!stripe) return null;

  try {
    const link = await stripe.accounts.createLoginLink(stripeAccountId);
    return link.url;
  } catch {
    return null;
  }
}

export type PaymentIntentResult =
  | { success: true; clientSecret: string; paymentIntentId: string }
  | { success: false; error: string };

/**
 * Create a PaymentIntent for a booking with split payment.
 * The tutor receives the amount minus the platform fee.
 */
export async function createBookingPaymentIntent(
  quoteId: string,
  totalCents: number,
  tutorStripeAccountId: string,
  description: string,
): Promise<PaymentIntentResult> {
  // Mock mode: simulate successful PaymentIntent creation
  if (STRIPE_MOCK_MODE) {
    const mockPaymentIntentId = `pi_mock_${Date.now()}`;
    const platformFeeCents = Math.round(totalCents * (PLATFORM_FEE_PERCENT / 100));
    console.log(`[MOCK] Creating PaymentIntent: ${mockPaymentIntentId}, total: ${totalCents}, fee: ${platformFeeCents}`);
    return {
      success: true,
      clientSecret: `${mockPaymentIntentId}_secret_mock`,
      paymentIntentId: mockPaymentIntentId,
    };
  }

  if (!stripe) {
    return { success: false, error: "Stripe not configured." };
  }

  const platformFeeCents = Math.round(totalCents * (PLATFORM_FEE_PERCENT / 100));
  const tutorAmountCents = totalCents - platformFeeCents;

  try {
    const paymentIntent = await stripe.paymentIntents.create({
      amount: totalCents,
      currency: "eur", // Adjust based on your market
      automatic_payment_methods: { enabled: true },
      application_fee_amount: platformFeeCents,
      transfer_data: {
        destination: tutorStripeAccountId,
        amount: tutorAmountCents,
      },
      description,
      metadata: { quoteId },
    });

    if (!paymentIntent.client_secret) {
      return { success: false, error: "Failed to create PaymentIntent client secret." };
    }

    return {
      success: true,
      clientSecret: paymentIntent.client_secret,
      paymentIntentId: paymentIntent.id,
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return { success: false, error: `PaymentIntent creation failed: ${message}` };
  }
}

/**
 * Retrieve a PaymentIntent by ID.
 */
export async function retrievePaymentIntent(
  paymentIntentId: string,
): Promise<Stripe.PaymentIntent | null> {
  if (!stripe) return null;

  try {
    return await stripe.paymentIntents.retrieve(paymentIntentId);
  } catch {
    return null;
  }
}

/**
 * Webhook event types we care about.
 */
export type StripeWebhookEvent =
  | "account.updated"
  | "payment_intent.succeeded"
  | "payment_intent.payment_failed"
  | "transfer.created"
  | "payout.paid"
  | "payout.failed";

/**
 * Verify and construct a Stripe webhook event.
 */
export function constructWebhookEvent(
  payload: string | Buffer,
  signature: string,
): Stripe.Event | null {
  if (!stripe || !STRIPE_WEBHOOK_SECRET) return null;

  try {
    return stripe.webhooks.constructEvent(payload, signature, STRIPE_WEBHOOK_SECRET);
  } catch {
    return null;
  }
}

/**
 * Check if a Connect account is fully onboarded and enabled.
 */
export async function isAccountOnboarded(stripeAccountId: string): Promise<boolean> {
  // Mock mode: always consider mock accounts as onboarded
  if (STRIPE_MOCK_MODE || stripeAccountId.startsWith("acct_mock_")) {
    return true;
  }

  if (!stripe) return false;

  try {
    const account = await stripe.accounts.retrieve(stripeAccountId);
    return account.details_submitted && account.charges_enabled && account.payouts_enabled;
  } catch {
    return false;
  }
}

/**
 * Trigger a manual payout to a tutor.
 * Use this when wallet balance reaches the threshold.
 */
export async function createPayout(
  stripeAccountId: string,
  amountCents: number,
): Promise<{ success: boolean; payoutId?: string; error?: string }> {
  // Mock mode: simulate successful payout
  if (STRIPE_MOCK_MODE) {
    const mockPayoutId = `po_mock_${Date.now()}`;
    console.log(`[MOCK] Creating payout: ${mockPayoutId}, amount: ${amountCents}, account: ${stripeAccountId}`);
    return { success: true, payoutId: mockPayoutId };
  }

  if (!stripe) {
    return { success: false, error: "Stripe not configured." };
  }

  try {
    const payout = await stripe.payouts.create(
      {
        amount: amountCents,
        currency: "eur",
      },
      { stripeAccount: stripeAccountId },
    );

    return { success: true, payoutId: payout.id };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return { success: false, error: message };
  }
}
