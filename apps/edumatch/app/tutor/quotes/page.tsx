"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useTranslation } from "@asafarim/shared-i18n";

type Quote = {
  id: string;
  status: string;
  hourlyRateCents: number;
  estimatedHours: number;
  totalCents: number;
  notes: string | null;
  createdAt: string;
  subject: string;
  gradeLevel: string;
  description: string;
  quoteRequestId: string;
};

const STATUS_STYLES: Record<string, string> = {
  PENDING:  "bg-amber-100 text-amber-700 border-amber-200",
  ACCEPTED: "bg-green-100 text-green-700 border-green-200",
  REJECTED: "bg-red-100 text-red-600 border-red-200",
  EXPIRED:  "bg-gray-100 text-gray-500 border-gray-200",
  WITHDRAWN:"bg-gray-100 text-gray-500 border-gray-200",
};

export default function TutorQuotesPage() {
  const { t } = useTranslation();
  const [quotes, setQuotes] = useState<Quote[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetch("/api/tutors/quotes")
      .then((r) => r.json())
      .then((data: { items?: Quote[]; error?: string }) => {
        if (data.error) throw new Error(data.error);
        setQuotes(data.items ?? []);
        setLoading(false);
      })
      .catch((e: unknown) => {
        setError(e instanceof Error ? e.message : t("edumatch.tutor.quotes.loadFailed"));
        setLoading(false);
      });
  }, []);

  const byStatus = (s: string) => quotes.filter((q) => q.status === s);
  const pending  = byStatus("PENDING");
  const accepted = byStatus("ACCEPTED");
  const other    = quotes.filter((q) => !["PENDING", "ACCEPTED"].includes(q.status));

  if (loading) {
    return (
      <div className="flex h-[60vh] items-center justify-center">
        <div className="h-12 w-12 animate-spin rounded-full border-b-2 border-[var(--color-primary)]" />
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-3xl px-4 py-8">
      <div className="mb-6 flex items-center gap-3 text-sm">
        <Link href="/tutor" className="text-[var(--color-text-muted)] hover:text-[var(--color-primary)]">
          {t("edumatch.inquiry.detail.backToDashboard")}
        </Link>
        <span className="text-[var(--color-text-muted)]">/</span>
        <span className="text-[var(--color-text)]">{t("edumatch.tutor.quotes.title")}</span>
      </div>

      <div className="mb-6 flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-[var(--color-text)]">{t("edumatch.tutor.quotes.title")}</h1>
          <p className="text-sm text-[var(--color-text-muted)] mt-1">
            {t("edumatch.tutor.quotes.subtitle")}
          </p>
        </div>
        <Link
          href="/tutor/requests"
          className="rounded-lg bg-[var(--color-primary)] px-4 py-2 text-sm font-medium text-white hover:opacity-90 transition"
        >
          {t("edumatch.tutor.quotes.browseRequests")}
        </Link>
      </div>

      {error && (
        <div className="mb-4 rounded-lg bg-red-50 border border-red-200 px-4 py-3 text-sm text-red-700">
          {error}
        </div>
      )}

      {/* Stats bar */}
      <div className="mb-6 grid grid-cols-3 gap-3">
        {[
          { label: t("edumatch.tutor.quotes.pending"),  count: pending.length,  color: "text-amber-500" },
          { label: t("edumatch.tutor.quotes.accepted"), count: accepted.length, color: "text-green-500" },
          { label: t("edumatch.tutor.quotes.total"),    count: quotes.length,   color: "text-[var(--color-text)]" },
        ].map(({ label, count, color }) => (
          <div key={label} className="rounded-xl border border-[var(--color-border)] bg-[var(--color-panel)] p-4 text-center">
            <p className={`text-2xl font-bold ${color}`}>{count}</p>
            <p className="text-xs text-[var(--color-text-muted)] mt-0.5">{label}</p>
          </div>
        ))}
      </div>

      {quotes.length === 0 ? (
        <div className="rounded-xl border border-[var(--color-border)] bg-[var(--color-panel)] p-10 text-center">
          <p className="text-[var(--color-text-muted)] text-sm">{t("edumatch.tutor.quotes.empty")}</p>
          <Link
            href="/tutor/requests"
            className="mt-4 inline-block rounded-lg bg-[var(--color-primary)] px-5 py-2 text-sm font-medium text-white hover:opacity-90 transition"
          >
            {t("edumatch.tutor.quotes.browseOpen")}
          </Link>
        </div>
      ) : (
        <div className="space-y-6">
          {[
            { title: t("edumatch.tutor.quotes.pending"), items: pending },
            { title: t("edumatch.tutor.quotes.accepted"), items: accepted },
            { title: t("edumatch.tutor.quotes.other"), items: other },
          ].map(({ title, items }) =>
            items.length === 0 ? null : (
              <section key={title}>
                <h2 className="mb-3 text-sm font-semibold text-[var(--color-text-muted)] uppercase tracking-wider">
                  {title} ({items.length})
                </h2>
                <div className="space-y-3">
                  {items.map((q) => (
                    <div
                      key={q.id}
                      className="rounded-xl border border-[var(--color-border)] bg-[var(--color-panel)] p-5"
                    >
                      <div className="flex items-start justify-between gap-3">
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 mb-1 flex-wrap">
                            <span className="font-semibold text-[var(--color-text)]">{q.subject}</span>
                            <span className="rounded-full bg-[var(--color-surface)] border border-[var(--color-border)] px-2 py-0.5 text-xs text-[var(--color-text-muted)]">
                              {q.gradeLevel}
                            </span>
                            <span className={`rounded-full border px-2 py-0.5 text-xs font-medium ${STATUS_STYLES[q.status] ?? "bg-gray-100 text-gray-500 border-gray-200"}`}>
                              {q.status}
                            </span>
                          </div>
                          <p className="text-sm text-[var(--color-text-muted)] line-clamp-2">{q.description}</p>
                        </div>
                        <div className="text-right shrink-0">
                          <p className="text-lg font-bold text-[var(--color-text)]">
                            €{(q.totalCents / 100).toFixed(2)}
                          </p>
                          <p className="text-xs text-[var(--color-text-muted)]">
                            €{(q.hourlyRateCents / 100).toFixed(0)}/h × {q.estimatedHours}h
                          </p>
                        </div>
                      </div>
                      {q.notes && (
                        <p className="mt-2 text-xs text-[var(--color-text-muted)] italic border-t border-[var(--color-border)] pt-2">
                          {t("edumatch.tutor.quotes.note")}: {q.notes}
                        </p>
                      )}
                      <p className="mt-2 text-xs text-[var(--color-text-muted)]">
                        {t("edumatch.tutor.quotes.submitted")} {new Date(q.createdAt).toLocaleDateString()}
                      </p>
                    </div>
                  ))}
                </div>
              </section>
            )
          )}
        </div>
      )}
    </div>
  );
}
