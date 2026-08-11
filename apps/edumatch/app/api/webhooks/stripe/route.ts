import { NextResponse } from "next/server";
import { constructWebhookEvent, isStripeConfigured, stripe } from "@/lib/server/stripe";
import { prisma } from "@asafarim/db";
import { creditWallet } from "@/lib/server/wallet";

export const runtime = "nodejs";

/**
 * POST /api/webhooks/stripe
 *
 * Handle Stripe Connect webhooks.
 * Must be publicly accessible (no auth).
 * Verify webhook signature.
 */
export async function POST(req: Request) {
  if (!isStripeConfigured()) {
    return NextResponse.json({ error: "Stripe not configured" }, { status: 503 });
  }

  const payload = await req.text();
  const signature = req.headers.get("stripe-signature") ?? "";

  const event = constructWebhookEvent(payload, signature);

  if (!event) {
    return NextResponse.json({ error: "Invalid webhook signature" }, { status: 400 });
  }

  console.log(`[Stripe Webhook] ${event.type}`);

  try {
    switch (event.type) {
      case "account.updated": {
        const account = event.data.object as { id: string; details_submitted: boolean; charges_enabled: boolean; payouts_enabled: boolean };

        // Find tutor by stripe account ID
        const tutor = await prisma.eduTutorProfile.findFirst({
          where: { stripeAccountId: account.id },
        });

        if (tutor) {
          const isOnboarded =
            account.details_submitted && account.charges_enabled && account.payouts_enabled;

          await prisma.eduTutorProfile.update({
            where: { userId: tutor.userId },
            data: { payoutEnabled: isOnboarded },
          });

          console.log(`[Stripe Webhook] Tutor ${tutor.userId} onboarding: ${isOnboarded ? "complete" : "incomplete"}`);
        }
        break;
      }

      case "payment_intent.succeeded": {
        const paymentIntent = event.data.object as {
          id: string;
          metadata: { quoteId?: string };
          transfer_data?: { destination?: string };
        };

        const quoteId = paymentIntent.metadata?.quoteId;
        if (!quoteId) break;

        // Update booking status and credit tutor wallet
        const quote = await prisma.eduQuote.findUnique({
          where: { id: quoteId },
          include: {
            quoteRequest: { select: { inquiryId: true } },
          },
        });

        if (!quote) break;

        const booking = await prisma.eduBooking.findFirst({
          where: { quoteId },
        });

        if (booking) {
          // Stripe redelivers webhooks (retries on non-2xx/timeout, and
          // operators can replay events from the dashboard), so this handler
          // must tolerate the same event arriving more than once. The
          // conditional update below is the idempotency guard: it only
          // flips SCHEDULED -> PAID once, and `count` tells us whether this
          // delivery was the one that won that race. Only the winner credits
          // the tutor's wallet — duplicate deliveries are a no-op.
          const { count } = await prisma.eduBooking.updateMany({
            where: { id: booking.id, status: { not: "PAID" } },
            data: { status: "PAID", stripePaymentIntentId: paymentIntent.id },
          });

          if (count > 0) {
            // Credit tutor wallet (amount minus platform fee already handled by Stripe)
            const tutorAmount = Math.round(quote.totalCents * 0.85); // 85% to tutor
            await creditWallet(quote.tutorId, tutorAmount, booking.id);

            console.log(`[Stripe Webhook] Booking ${booking.id} paid, wallet credited ${tutorAmount} cents`);
          } else {
            console.log(`[Stripe Webhook] Booking ${booking.id} already paid, skipping duplicate wallet credit`);
          }
        }
        break;
      }

      case "payment_intent.payment_failed": {
        const paymentIntent = event.data.object as { id: string; metadata: { quoteId?: string } };
        const quoteId = paymentIntent.metadata?.quoteId;
        if (!quoteId) break;

        const booking = await prisma.eduBooking.findFirst({
          where: { quoteId },
        });

        if (booking) {
          await prisma.eduBooking.update({
            where: { id: booking.id },
            data: { status: "PAYMENT_FAILED" },
          });
        }
        break;
      }

      default:
        console.log(`[Stripe Webhook] Unhandled event type: ${event.type}`);
    }

    return NextResponse.json({ received: true });
  } catch (error) {
    console.error("[Stripe Webhook] Error processing event:", error);
    return NextResponse.json({ error: "Webhook processing failed" }, { status: 500 });
  }
}
