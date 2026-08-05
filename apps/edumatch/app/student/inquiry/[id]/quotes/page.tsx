"use client";

import { useEffect, useState } from "react";
import { useParams, useSearchParams, useRouter } from "next/navigation";
import Link from "next/link";
import { useTranslation, type TranslateFn } from "@asafarim/shared-i18n";

type AvailabilitySlot = {
  start: string;
  end: string;
  mode: "ONLINE" | "IN_PERSON";
};

type TutorProfile = {
  bio: string | null;
  ratingAvg: number;
  ratingCount: number;
  verifiedAt: string | null;
};

type Quote = {
  id: string;
  hourlyRateCents: number;
  estimatedHours: number;
  totalCents: number;
  availabilitySlots: AvailabilitySlot[] | null;
  notes: string | null;
  status: string;
  createdAt: string;
  tutor: {
    id: string;
    name: string | null;
    image: string | null;
    eduTutorProfile: TutorProfile | null;
  };
};

export default function QuotesPage() {
  const { t } = useTranslation();
  const { id: inquiryId } = useParams<{ id: string }>();
  const searchParams = useSearchParams();
  const router = useRouter();
  const qrParam = searchParams.get("qr");

  const [quotes, setQuotes] = useState<Quote[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [accepting, setAccepting] = useState<string | null>(null);
  const [declining, setDeclining] = useState<string | null>(null);
  // Show a confirmation banner when the student has just submitted a new request
  // (i.e. they arrived here via the inquiry page with a fresh ?qr= param).
  const [justRequested, setJustRequested] = useState(!!qrParam);

  useEffect(() => {
    async function load() {
      let quoteRequestId = qrParam;

      // If no ?qr param, look it up from the inquiry
      if (!quoteRequestId) {
        const r = await fetch(`/api/inquiries/${inquiryId}/quote-request`);
        const data = (await r.json()) as {
          quoteRequest?: { id: string } | null;
        };
        quoteRequestId = data.quoteRequest?.id ?? null;
      }

      if (!quoteRequestId) {
        setError(t("edumatch.quotes.noRequestFound"));
        setLoading(false);
        return;
      }

      const r = await fetch(`/api/quote-requests/${quoteRequestId}/quotes`);
      const data = (await r.json()) as { items?: Quote[]; error?: string };
      if (data.error) throw new Error(data.error);
      setQuotes(data.items ?? []);
      setLoading(false);
    }

    load().catch((e: unknown) => {
      setError(e instanceof Error ? e.message : "Failed to load quotes");
      setLoading(false);
    });
  }, [inquiryId, qrParam]);

  async function accept(quoteId: string) {
    setAccepting(quoteId);
    try {
      const res = await fetch(`/api/quotes/${quoteId}/accept`, {
        method: "POST",
      });
      const data = (await res.json()) as { bookingId?: string; error?: string };
      if (!res.ok) {
        setError(data.error ?? "Failed to accept quote");
        return;
      }
      router.push(`/student?booking=${data.bookingId}`);
    } catch {
      setError("Failed to accept quote.");
    } finally {
      setAccepting(null);
    }
  }

  async function decline(quoteId: string) {
    setDeclining(quoteId);
    try {
      const res = await fetch(`/api/quotes/${quoteId}/decline`, {
        method: "POST",
      });
      if (!res.ok) {
        setError("Failed to decline quote");
        return;
      }
      setQuotes((prev) =>
        prev.map((q) => (q.id === quoteId ? { ...q, status: "DECLINED" } : q)),
      );
    } catch {
      setError("Failed to decline quote.");
    } finally {
      setDeclining(null);
    }
  }

  if (loading) {
    return (
      <div className="flex h-[60vh] items-center justify-center">
        <div className="h-12 w-12 animate-spin rounded-full border-b-2 border-[var(--color-primary)]" />
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-3xl px-4 py-8">
      {/* Breadcrumb */}
      <div className="mb-6 flex items-center gap-3 text-sm">
        <Link
          href="/student"
          className="text-[var(--color-text-muted)] hover:text-[var(--color-primary)]"
        >
          {t("edumatch.inquiry.detail.backToDashboard")}
        </Link>
        <span className="text-[var(--color-text-muted)]">/</span>
        <Link
          href={`/student/inquiry/${inquiryId}`}
          className="text-[var(--color-text-muted)] hover:text-[var(--color-primary)]"
        >
          {t("edumatch.quotes.breadcrumb.inquiry")}
        </Link>
        <span className="text-[var(--color-text-muted)]">/</span>
        <span className="text-[var(--color-text)]">
          {t("edumatch.quotes.title")}
        </span>
      </div>

      <h1 className="text-2xl font-bold text-[var(--color-text)] mb-2">
        {t("edumatch.quotes.title")}
      </h1>
      <p className="text-sm text-[var(--color-text-muted)] mb-6">
        {t("edumatch.quotes.subtitle")}
      </p>

      {justRequested && (
        <div className="mb-5 rounded-xl border border-green-300 bg-green-50 px-5 py-4">
          <p className="font-semibold text-green-800 mb-1">
            {t("edumatch.quotes.justRequested.title")}
          </p>
          <p className="text-sm text-green-700">
            {t("edumatch.quotes.justRequested.desc")}
          </p>
          <button
            onClick={() => setJustRequested(false)}
            className="mt-3 text-xs text-green-600 underline hover:text-green-800"
          >
            {t("edumatch.quotes.justRequested.dismiss")}
          </button>
        </div>
      )}

      {error && (
        <div className="mb-4 rounded-lg bg-red-50 border border-red-200 px-4 py-3 text-sm text-red-700">
          {error}
          <button onClick={() => setError(null)} className="ml-2 underline">
            {t("edumatch.inquiry.detail.dismiss")}
          </button>
        </div>
      )}

      {quotes.length === 0 ? (
        <div className="rounded-xl border border-[var(--color-border)] bg-[var(--color-panel)] p-10 text-center">
          <p className="text-[var(--color-text-muted)] mb-2">
            {t("edumatch.quotes.noQuotes")}
          </p>
          <p className="text-xs text-[var(--color-text-muted)]">
            {t("edumatch.quotes.noQuotesSub")}
          </p>
        </div>
      ) : (
        <div className="space-y-4">
          {quotes.map((quote) => {
            const isPending = quote.status === "PENDING";
            const isAccepted = quote.status === "ACCEPTED";
            const isDeclined = quote.status === "DECLINED";
            const profile = quote.tutor.eduTutorProfile;

            return (
              <div
                key={quote.id}
                className={`rounded-xl border bg-[var(--color-panel)] p-5 transition ${
                  isAccepted
                    ? "border-green-400"
                    : isDeclined
                      ? "border-[var(--color-border)] opacity-50"
                      : "border-[var(--color-border)] hover:border-[var(--color-primary)]"
                }`}
              >
                {/* Tutor header */}
                <div className="flex items-start gap-4 mb-4">
                  {quote.tutor.image ? (
                    <img
                      src={quote.tutor.image}
                      alt={quote.tutor.name ?? "Tutor"}
                      className="h-12 w-12 rounded-full object-cover"
                    />
                  ) : (
                    <div className="flex h-12 w-12 items-center justify-center rounded-full bg-[var(--color-primary)] text-white font-bold text-lg">
                      {(quote.tutor.name ?? "T")[0].toUpperCase()}
                    </div>
                  )}
                  <div className="flex-1">
                    <div className="flex items-center gap-2">
                      <span className="font-semibold text-[var(--color-text)]">
                        {quote.tutor.name ?? "Anonymous Tutor"}
                      </span>
                      {profile?.verifiedAt && (
                        <span className="rounded-full bg-green-100 px-2 py-0.5 text-xs font-medium text-green-700">
                          {t("edumatch.quotes.verified")}
                        </span>
                      )}
                      <StatusBadge status={quote.status} t={t} />
                    </div>
                    {profile && (
                      <div className="flex items-center gap-1 mt-0.5">
                        <StarRating rating={profile.ratingAvg} />
                        <span className="text-xs text-[var(--color-text-muted)]">
                          ({profile.ratingCount}{" "}
                          {profile.ratingCount === 1
                            ? t("edumatch.quotes.review")
                            : t("edumatch.quotes.reviews")}
                          )
                        </span>
                      </div>
                    )}
                  </div>
                </div>

                {profile?.bio && (
                  <p className="text-sm text-[var(--color-text-muted)] line-clamp-2 mb-4">
                    {profile.bio}
                  </p>
                )}

                {/* Pricing */}
                <div className="grid grid-cols-3 gap-3 mb-4">
                  <div className="rounded-lg bg-[var(--color-surface)] p-3 text-center">
                    <p className="text-xs text-[var(--color-text-muted)] mb-0.5">
                      {t("edumatch.quotes.ratePerHour")}
                    </p>
                    <p className="font-bold text-[var(--color-text)]">
                      €{(quote.hourlyRateCents / 100).toFixed(0)}
                    </p>
                  </div>
                  <div className="rounded-lg bg-[var(--color-surface)] p-3 text-center">
                    <p className="text-xs text-[var(--color-text-muted)] mb-0.5">
                      {t("edumatch.quotes.estHours")}
                    </p>
                    <p className="font-bold text-[var(--color-text)]">
                      {quote.estimatedHours}h
                    </p>
                  </div>
                  <div className="rounded-lg bg-green-50 border border-green-200 p-3 text-center">
                    <p className="text-xs text-green-600 mb-0.5">
                      {t("edumatch.quotes.total")}
                    </p>
                    <p className="font-bold text-green-700">
                      €{(quote.totalCents / 100).toFixed(2)}
                    </p>
                  </div>
                </div>

                {/* Availability slots */}
                {quote.availabilitySlots &&
                  quote.availabilitySlots.length > 0 && (
                    <div className="mb-4">
                      <p className="text-xs font-medium text-[var(--color-text-muted)] mb-2">
                        {t("edumatch.quotes.availableSlots")}
                      </p>
                      <div className="flex flex-wrap gap-2">
                        {quote.availabilitySlots.map((slot, i) => (
                          <span
                            key={i}
                            className="rounded-lg border border-[var(--color-border)] px-3 py-1 text-xs text-[var(--color-text)]"
                          >
                            {new Date(slot.start).toLocaleString(undefined, {
                              weekday: "short",
                              month: "short",
                              day: "numeric",
                              hour: "2-digit",
                              minute: "2-digit",
                            })}
                            {" · "}
                            <span
                              className={
                                slot.mode === "ONLINE"
                                  ? "text-blue-600"
                                  : "text-orange-600"
                              }
                            >
                              {slot.mode === "ONLINE"
                                ? t("edumatch.quotes.online")
                                : t("edumatch.quotes.inPerson")}
                            </span>
                          </span>
                        ))}
                      </div>
                    </div>
                  )}

                {quote.notes && (
                  <p className="text-sm italic text-[var(--color-text-muted)] mb-4 border-l-2 border-[var(--color-border)] pl-3">
                    {quote.notes}
                  </p>
                )}

                {/* Actions */}
                {isPending && (
                  <div className="flex gap-3 pt-2 border-t border-[var(--color-border)]">
                    <button
                      onClick={() => accept(quote.id)}
                      disabled={accepting === quote.id}
                      className="flex-1 rounded-lg bg-[var(--color-primary)] px-4 py-2 text-sm font-medium text-white hover:opacity-90 disabled:opacity-50 transition"
                    >
                      {accepting === quote.id
                        ? t("edumatch.quotes.booking")
                        : t("edumatch.quotes.accept")}
                    </button>
                    <button
                      onClick={() => decline(quote.id)}
                      disabled={declining === quote.id}
                      className="rounded-lg border border-[var(--color-border-strong)] px-4 py-2 text-sm text-[var(--color-text)] hover:bg-[var(--color-surface)] disabled:opacity-50 transition"
                    >
                      {declining === quote.id
                        ? "…"
                        : t("edumatch.quotes.decline")}
                    </button>
                  </div>
                )}

                {isAccepted && (
                  <div className="pt-2 border-t border-green-200">
                    <p className="text-sm font-medium text-green-700">
                      {t("edumatch.quotes.bookingConfirmed")}
                    </p>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

function StatusBadge({ status, t }: { status: string; t: TranslateFn }) {
  const styles: Record<string, string> = {
    PENDING: "bg-yellow-100 text-yellow-700",
    ACCEPTED: "bg-green-100 text-green-700",
    DECLINED: "bg-gray-100 text-gray-500",
    EXPIRED: "bg-red-100 text-red-600",
  };
  const labels: Record<string, string> = {
    PENDING: t("edumatch.quotes.status.PENDING"),
    ACCEPTED: t("edumatch.quotes.status.ACCEPTED"),
    DECLINED: t("edumatch.quotes.status.DECLINED"),
    EXPIRED: t("edumatch.quotes.status.EXPIRED"),
  };
  return (
    <span
      className={`rounded-full px-2 py-0.5 text-xs font-medium ${styles[status] ?? styles.PENDING}`}
    >
      {labels[status] ?? status}
    </span>
  );
}

function StarRating({ rating }: { rating: number }) {
  const full = Math.floor(rating);
  return (
    <span className="flex items-center gap-0.5">
      {[1, 2, 3, 4, 5].map((i) => (
        <span
          key={i}
          className={i <= full ? "text-yellow-400" : "text-gray-300"}
          style={{ fontSize: "12px" }}
        >
          ★
        </span>
      ))}
      <span className="ml-1 text-xs text-[var(--color-text-muted)]">
        {rating.toFixed(1)}
      </span>
    </span>
  );
}
