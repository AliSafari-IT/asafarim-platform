"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { useTranslation } from "@asafarim/shared-i18n";
import { ContextualHelpLink } from "@/components/help/ContextualHelpLink";

// Stripe Elements would be loaded dynamically in production
// For now, this is a placeholder that shows the checkout flow

type Quote = {
  id: string;
  hourlyRateCents: number;
  estimatedHours: number;
  totalCents: number;
  notes?: string;
  availabilitySlots: string[];
  tutor: {
    name: string;
    bio?: string;
    ratingAvg: number;
    ratingCount: number;
  };
  quoteRequest: {
    inquiry: {
      subject: string;
      gradeLevel: string;
    };
  };
};

export default function CheckoutPage({ params }: { params: { quoteId: string } }) {
  const { t } = useTranslation();
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [quote, setQuote] = useState<Quote | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [processing, setProcessing] = useState(false);
  const [clientSecret, setClientSecret] = useState<string | null>(null);

  useEffect(() => {
    // Fetch quote details and create PaymentIntent
    fetch(`/api/quotes/${params.quoteId}/checkout`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
    })
      .then(async (r) => {
        if (!r.ok) {
          const err = await r.json();
          throw new Error(err.error ?? t("edumatch.checkout.initFailed"));
        }
        return r.json();
      })
      .then((data) => {
        setClientSecret(data.clientSecret);
        // Fetch quote details separately
        return fetch(`/api/quotes/${params.quoteId}`).then((r) => r.json());
      })
      .then((quoteData) => {
        setQuote(quoteData);
        setLoading(false);
      })
      .catch((err) => {
        setError(err.message);
        setLoading(false);
      });
  }, [params.quoteId]);

  async function handlePayment() {
    setProcessing(true);
    // In production, this would use Stripe Elements
    // For now, simulate a successful payment flow
    setTimeout(() => {
      router.push(`/student/booking/confirmation?quoteId=${params.quoteId}`);
    }, 2000);
  }

  if (loading) {
    return (
      <div className="mx-auto max-w-2xl px-4 py-8">
        <div className="flex h-[40vh] items-center justify-center">
          <div className="h-12 w-12 animate-spin rounded-full border-b-2 border-[var(--color-primary)]"></div>
        </div>
      </div>
    );
  }

  if (error || !quote) {
    return (
      <div className="mx-auto max-w-2xl px-4 py-8">
        <div className="rounded-xl border border-red-200 bg-red-50 p-6">
          <h1 className="text-lg font-semibold text-red-800 mb-2">{t("edumatch.checkout.errorTitle")}</h1>
          <p className="text-red-700">{error ?? t("edumatch.checkout.quoteNotFound")}</p>
          <Link
            href="/student"
            // red-600 (Tailwind v4's #e7000b) against white text is 4.37:1 —
            // just under the 4.5:1 WCAG AA requires. red-700 clears it.
            className="mt-4 inline-block rounded-lg bg-red-700 px-4 py-2 text-sm font-medium text-white hover:bg-red-800"
          >
            {t("edumatch.inquiry.new.backToDashboard")}
          </Link>
        </div>
      </div>
    );
  }

  const totalEuros = (quote.totalCents / 100).toFixed(2);
  const platformFeeEuros = ((quote.totalCents * 0.15) / 100).toFixed(2);
  const tutorAmountEuros = ((quote.totalCents * 0.85) / 100).toFixed(2);

  return (
    <div className="mx-auto max-w-2xl px-4 py-8">
      <div className="mb-6">
        <Link href={`/student/inquiry/${quote.quoteRequest.inquiry.subject}`} className="text-sm text-[var(--color-text-muted)] hover:text-[var(--color-primary)]">
          {t("edumatch.checkout.backToQuotes")}
        </Link>
      </div>

      <div className="mb-6 flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-2xl font-bold text-[var(--color-text)]">{t("edumatch.checkout.title")}</h1>
        <ContextualHelpLink href="/help/students/tutor-quotes-and-booking" />
      </div>

      <div className="rounded-xl border border-[var(--color-border)] bg-[var(--color-panel)] p-6 mb-6">
        <h2 className="text-lg font-semibold text-[var(--color-text)] mb-4">{t("edumatch.checkout.summary")}</h2>

        <div className="space-y-3 mb-6">
          <div className="flex justify-between">
            <span className="text-[var(--color-text-muted)]">{t("edumatch.checkout.subject")}</span>
            <span className="font-medium text-[var(--color-text)]">{quote.quoteRequest.inquiry.subject}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-[var(--color-text-muted)]">{t("edumatch.checkout.tutor")}</span>
            <span className="font-medium text-[var(--color-text)]">{quote.tutor.name}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-[var(--color-text-muted)]">{t("edumatch.checkout.rate")}</span>
            <span className="font-medium text-[var(--color-text)]">
              €{(quote.hourlyRateCents / 100).toFixed(2)} / {t("edumatch.checkout.hour")}
            </span>
          </div>
          <div className="flex justify-between">
            <span className="text-[var(--color-text-muted)]">{t("edumatch.checkout.duration")}</span>
            <span className="font-medium text-[var(--color-text)]">{t("edumatch.checkout.hours", { n: quote.estimatedHours })}</span>
          </div>
        </div>

        <div className="border-t border-[var(--color-border)] pt-4 space-y-2">
          <div className="flex justify-between text-sm">
            <span className="text-[var(--color-text-muted)]">{t("edumatch.checkout.subtotal")}</span>
            <span className="text-[var(--color-text)]">€{totalEuros}</span>
          </div>
          <div className="flex justify-between text-sm">
            <span className="text-[var(--color-text-muted)]">{t("edumatch.checkout.platformFee")}</span>
            <span className="text-[var(--color-text)]">€{platformFeeEuros}</span>
          </div>
          <div className="flex justify-between text-sm">
            <span className="text-[var(--color-text-muted)]">{t("edumatch.checkout.tutorReceives")}</span>
            <span className="text-green-600">€{tutorAmountEuros}</span>
          </div>
          <div className="flex justify-between text-lg font-semibold border-t border-[var(--color-border)] pt-2">
            <span className="text-[var(--color-text)]">{t("edumatch.checkout.total")}</span>
            <span className="text-[var(--color-primary)]">€{totalEuros}</span>
          </div>
        </div>
      </div>

      {/* Payment Section - Stripe Elements placeholder */}
      <div className="rounded-xl border border-[var(--color-border)] bg-[var(--color-panel)] p-6">
        <h2 className="text-lg font-semibold text-[var(--color-text)] mb-4">{t("edumatch.checkout.payment")}</h2>

        <div className="mb-6 p-4 bg-amber-50 border border-amber-200 rounded-lg">
          <p className="text-sm text-amber-800">
            <strong>{t("edumatch.checkout.stripeRequired")}</strong> {t("edumatch.checkout.stripeRequiredDesc")} <code className="text-xs bg-amber-100 px-1 rounded">{clientSecret?.slice(0, 20)}...</code>
          </p>
        </div>

        <div className="space-y-3 mb-6">
          <input
            type="text"
            placeholder={t("edumatch.checkout.cardholder")}
            className="w-full rounded-lg border border-[var(--color-border)] bg-[var(--color-surface)] px-3 py-2.5 text-sm text-[var(--color-text)] focus:outline-none focus:ring-2 focus:ring-[var(--color-primary)]"
            disabled={processing}
          />
          <div className="p-3 border border-[var(--color-border)] rounded-lg bg-[var(--color-surface)] text-[var(--color-text-muted)] text-sm">
            {t("edumatch.checkout.cardPlaceholder")}
          </div>
        </div>

        <button
          onClick={handlePayment}
          disabled={processing}
          className="w-full rounded-lg bg-[var(--color-primary)] px-6 py-3 text-sm font-medium text-[#07101a] hover:opacity-90 disabled:opacity-50 transition flex items-center justify-center gap-2"
        >
          {processing ? (
            <>
              <span className="h-4 w-4 animate-spin rounded-full border-2 border-white border-t-transparent" />
              {t("edumatch.checkout.processing")}
            </>
          ) : (
            `Pay €${totalEuros}`
          )}
        </button>

        <p className="mt-4 text-xs text-center text-[var(--color-text-muted)]">
          {t("edumatch.checkout.secureNote")}
        </p>
      </div>
    </div>
  );
}
