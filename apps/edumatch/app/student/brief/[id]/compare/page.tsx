"use client";

/**
 * Compare the proposals that came back.
 *
 * Every tutor is described with the same fields in the same order, so the
 * comparison is like-for-like: total price, hourly rate, number and length of
 * lessons, earliest start, language, format, cancellation terms, and the
 * actual plan they propose to teach.
 *
 * The "what's different" notes are factual and never conclude which option is
 * better — that is the student's call, and a platform that makes it for them
 * is selling placement.
 */

import { use, useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useTranslation } from "@asafarim/shared-i18n";
import {
  formatEuros,
  type ProposalComparisonView,
} from "@/lib/types/learning";

export default function CompareProposalsPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id: briefId } = use(params);
  const { t } = useTranslation();
  const router = useRouter();

  const [items, setItems] = useState<ProposalComparisonView[]>([]);
  const [differences, setDifferences] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [accepting, setAccepting] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    const res = await fetch(`/api/learning/briefs/${briefId}/proposals`);
    const data = (await res.json()) as {
      items?: ProposalComparisonView[];
      differences?: string[];
      error?: string;
    };
    if (!res.ok) {
      setError(data.error ?? t("edumatch.compare.loadError"));
    } else {
      setItems(data.items ?? []);
      setDifferences(data.differences ?? []);
    }
    setLoading(false);
  }, [briefId, t]);

  useEffect(() => {
    void load();
  }, [load]);

  async function accept(quoteId: string) {
    setAccepting(quoteId);
    setError(null);
    try {
      const res = await fetch(`/api/quotes/${quoteId}/accept`, {
        method: "POST",
      });
      const data = (await res.json()) as { error?: string };
      if (!res.ok) {
        setError(data.error ?? t("edumatch.compare.acceptError"));
        setAccepting(null);
        return;
      }
      router.push(`/student/checkout/${quoteId}`);
    } catch {
      setError(t("edumatch.compare.acceptError"));
      setAccepting(null);
    }
  }

  if (loading) {
    return (
      <div className="mx-auto max-w-5xl px-4 py-8 text-sm text-[var(--color-text-muted)]">
        {t("edumatch.compare.loading")}
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-5xl px-4 py-8">
      <Link
        href={`/student/learn?brief=${briefId}`}
        className="text-sm text-[var(--color-text-muted)] hover:text-[var(--color-primary)]"
      >
        {t("edumatch.compare.backToBrief")}
      </Link>

      <h1 className="mt-4 text-2xl font-bold text-[var(--color-text)]">
        {t("edumatch.compare.title")}
      </h1>
      <p className="mt-1 text-sm text-[var(--color-text-muted)]">
        {t("edumatch.compare.subtitle", { n: items.length })}
      </p>

      {error && (
        <div
          role="alert"
          className="mt-4 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700"
        >
          {error}
        </div>
      )}

      {differences.length > 0 && (
        <section className="mt-6 rounded-xl border border-[var(--color-border)] bg-[var(--color-panel)] p-5">
          <h2 className="text-sm font-semibold text-[var(--color-text)]">
            {t("edumatch.compare.differencesTitle")}
          </h2>
          <ul className="mt-2 list-inside list-disc space-y-1 text-sm text-[var(--color-text-muted)]">
            {differences.map((d) => (
              <li key={d}>{d}</li>
            ))}
          </ul>
          <p className="mt-3 text-xs text-[var(--color-text-muted)]">
            {t("edumatch.compare.noRankingNote")}
          </p>
        </section>
      )}

      {items.length === 0 ? (
        <p className="mt-8 text-sm text-[var(--color-text-muted)]">
          {t("edumatch.compare.waiting")}
        </p>
      ) : (
        <div className="mt-6 grid gap-4 md:grid-cols-2">
          {items.map((p) => (
            <article
              key={p.quoteId}
              className="flex flex-col rounded-xl border border-[var(--color-border)] bg-[var(--color-panel)] p-5"
            >
              <header className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <h3 className="flex items-center gap-2 text-base font-semibold text-[var(--color-text)]">
                    {p.tutorName ?? t("edumatch.match.unnamedTutor")}
                    {p.verified && (
                      <span className="rounded-full bg-green-100 px-2 py-0.5 text-[10px] font-medium uppercase tracking-wide text-green-800">
                        {t("edumatch.match.verified")}
                      </span>
                    )}
                  </h3>
                  <p className="mt-0.5 text-xs text-[var(--color-text-muted)]">
                    {p.ratingCount > 0
                      ? t("edumatch.match.rating", {
                          avg: p.ratingAvg.toFixed(1),
                          n: p.ratingCount,
                        })
                      : t("edumatch.match.noReviewsYet")}
                  </p>
                </div>
                <div className="shrink-0 text-right">
                  <p className="text-lg font-bold text-[var(--color-text)]">
                    {formatEuros(p.totalCents)}
                  </p>
                  <p className="text-xs text-[var(--color-text-muted)]">
                    {t("edumatch.match.perHour", {
                      price: formatEuros(p.hourlyRateCents),
                    })}
                  </p>
                </div>
              </header>

              <dl className="mt-4 grid grid-cols-2 gap-x-4 gap-y-2 text-xs">
                <Field
                  label={t("edumatch.compare.field.lessons")}
                  value={
                    p.sessionCount && p.sessionMinutes
                      ? t("edumatch.brief.planValue", {
                          n: p.sessionCount,
                          m: p.sessionMinutes,
                        })
                      : "—"
                  }
                />
                <Field
                  label={t("edumatch.compare.field.start")}
                  value={p.earliestStartAt?.slice(0, 10) ?? "—"}
                />
                <Field
                  label={t("edumatch.compare.field.format")}
                  value={p.mode ? t(`edumatch.brief.mode.${p.mode}`) : "—"}
                />
                <Field
                  label={t("edumatch.compare.field.language")}
                  value={p.language?.toUpperCase() ?? "—"}
                />
                <Field
                  label={t("edumatch.compare.field.cancellation")}
                  value={
                    p.cancellationPolicy
                      ? t(`edumatch.compare.cancellation.${p.cancellationPolicy}`)
                      : "—"
                  }
                />
                <Field
                  label={t("edumatch.compare.field.style")}
                  value={
                    p.teachingStyle
                      ? t(`edumatch.match.style.${p.teachingStyle}`)
                      : "—"
                  }
                />
              </dl>

              {p.qualifications.length > 0 && (
                <p className="mt-3 text-xs text-[var(--color-text-muted)]">
                  {p.qualifications.join(" · ")}
                </p>
              )}

              {p.planOutline.length > 0 && (
                <details className="mt-3">
                  <summary className="cursor-pointer text-xs font-medium text-[var(--color-primary)]">
                    {t("edumatch.compare.showPlan", {
                      n: p.planOutline.length,
                    })}
                  </summary>
                  <ol className="mt-2 space-y-1.5 text-xs text-[var(--color-text-muted)]">
                    {p.planOutline.map((step) => (
                      <li key={step.session}>
                        <strong className="text-[var(--color-text)]">
                          {t("edumatch.compare.session", { n: step.session })}
                        </strong>{" "}
                        {step.focus} — {step.outcome}
                      </li>
                    ))}
                  </ol>
                </details>
              )}

              {p.notes && (
                <p className="mt-3 whitespace-pre-wrap text-xs text-[var(--color-text-muted)]">
                  {p.notes}
                </p>
              )}

              {p.matchReasons.length > 0 && (
                <ul className="mt-3 flex flex-wrap gap-1.5">
                  {p.matchReasons.map((r) => (
                    <li
                      key={r}
                      className="rounded-full border border-[var(--color-border)] px-2 py-0.5 text-[11px] text-[var(--color-text-muted)]"
                    >
                      {r}
                    </li>
                  ))}
                </ul>
              )}

              <button
                type="button"
                onClick={() => void accept(p.quoteId)}
                disabled={accepting !== null || p.status === "ACCEPTED"}
                className="mt-5 w-full rounded-lg bg-[var(--color-primary)] px-5 py-2.5 text-sm font-medium text-white transition hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-50"
              >
                {p.status === "ACCEPTED"
                  ? t("edumatch.compare.accepted")
                  : accepting === p.quoteId
                    ? t("edumatch.compare.accepting")
                    : t("edumatch.compare.chooseBtn")}
              </button>
            </article>
          ))}
        </div>
      )}
    </div>
  );
}

function Field({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <dt className="font-medium uppercase tracking-wide text-[var(--color-text-muted)]">
        {label}
      </dt>
      <dd className="mt-0.5 text-[var(--color-text)]">{value}</dd>
    </div>
  );
}
