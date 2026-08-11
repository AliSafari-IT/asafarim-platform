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

/** Mirrors NEW_TUTOR_REVIEW_THRESHOLD in lib/server/brief-matching.ts. */
const NEW_TUTOR_REVIEW_THRESHOLD = 3;

const RATING_FILTER_OPTIONS = [
  { value: 0, labelKey: "edumatch.filter.any" },
  { value: 4.0, labelKey: "edumatch.filter.min40" },
  { value: 4.5, labelKey: "edumatch.filter.min45" },
  { value: 4.8, labelKey: "edumatch.filter.min48" },
] as const;

type RatingFilters = {
  minRating: number;
  minClarity: number;
  minReliability: number;
  minEngagement: number;
};

const DEFAULT_FILTERS: RatingFilters = {
  minRating: 0,
  minClarity: 0,
  minReliability: 0,
  minEngagement: 0,
};

/**
 * Filtering happens server-side (GET /api/learning/briefs/[id]/proposals
 * applies passesRatingFilter() from lib/server/brief-matching.ts) so there is
 * a single source of truth for the "never hide a verified newcomer" rule.
 * This just turns the selected minimums into query params.
 */
function toQueryString(f: RatingFilters): string {
  const params = new URLSearchParams();
  if (f.minRating > 0) params.set("minRating", String(f.minRating));
  if (f.minClarity > 0) params.set("minClarity", String(f.minClarity));
  if (f.minReliability > 0) params.set("minReliability", String(f.minReliability));
  if (f.minEngagement > 0) params.set("minEngagement", String(f.minEngagement));
  const qs = params.toString();
  return qs ? `?${qs}` : "";
}

export default function CompareProposalsPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id: briefId } = use(params);
  const { t } = useTranslation();
  const router = useRouter();

  const [items, setItems] = useState<ProposalComparisonView[]>([]);
  const [total, setTotal] = useState(0);
  const [hiddenCount, setHiddenCount] = useState(0);
  const [hiddenNewcomerCount, setHiddenNewcomerCount] = useState(0);
  const [differences, setDifferences] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [accepting, setAccepting] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [filters, setFilters] = useState<RatingFilters>(DEFAULT_FILTERS);
  const [showMoreFilters, setShowMoreFilters] = useState(false);
  const [showAllOverride, setShowAllOverride] = useState(false);

  const filtersActive =
    filters.minRating > 0 ||
    filters.minClarity > 0 ||
    filters.minReliability > 0 ||
    filters.minEngagement > 0;

  // The rating filter is applied server-side; "show all" refetches with no
  // filter params rather than un-hiding client-side, so there's one place
  // (passesRatingFilter in brief-matching.ts) that decides who's shown.
  const effectiveFilters = showAllOverride ? DEFAULT_FILTERS : filters;

  const load = useCallback(async () => {
    const res = await fetch(
      `/api/learning/briefs/${briefId}/proposals${toQueryString(effectiveFilters)}`,
    );
    const data = (await res.json()) as {
      items?: ProposalComparisonView[];
      total?: number;
      hiddenCount?: number;
      hiddenNewcomerCount?: number;
      differences?: string[];
      error?: string;
    };
    if (!res.ok) {
      setError(data.error ?? t("edumatch.compare.loadError"));
    } else {
      setItems(data.items ?? []);
      setTotal(data.total ?? data.items?.length ?? 0);
      setHiddenCount(data.hiddenCount ?? 0);
      setHiddenNewcomerCount(data.hiddenNewcomerCount ?? 0);
      setDifferences(data.differences ?? []);
    }
    setLoading(false);
  }, [briefId, effectiveFilters, t]);

  useEffect(() => {
    void load();
  }, [load]);

  // A newly chosen filter should re-apply hiding rather than stay overridden
  // by an earlier "show all" click.
  useEffect(() => {
    setShowAllOverride(false);
  }, [filters]);

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
        {t("edumatch.compare.subtitle", { n: total })}
      </p>

      {error && (
        <div
          role="alert"
          className="mt-4 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700"
        >
          {error}
        </div>
      )}

      <section className="mt-6 rounded-xl border border-[var(--color-border)] bg-[var(--color-panel)] p-4">
        <div className="flex flex-wrap items-end gap-4">
          <label className="text-xs">
            <span className="block font-medium uppercase tracking-wide text-[var(--color-text-muted)]">
              {t("edumatch.filter.minRating")}
            </span>
            <select
              value={filters.minRating}
              onChange={(e) =>
                setFilters((f) => ({ ...f, minRating: Number(e.target.value) }))
              }
              className="mt-1 rounded-lg border border-[var(--color-border)] bg-[var(--color-surface)] px-2 py-1.5 text-sm text-[var(--color-text)]"
            >
              {RATING_FILTER_OPTIONS.map((o) => (
                <option key={o.value} value={o.value}>
                  {t(o.labelKey)}
                </option>
              ))}
            </select>
          </label>
          <button
            type="button"
            onClick={() => setShowMoreFilters((v) => !v)}
            className="text-xs font-medium text-[var(--color-primary)]"
          >
            {t("edumatch.filter.moreFilters")}
          </button>
        </div>

        {showMoreFilters && (
          <div className="mt-3 flex flex-wrap gap-4">
            {(["minClarity", "minReliability", "minEngagement"] as const).map((key) => (
              <label key={key} className="text-xs">
                <span className="block font-medium uppercase tracking-wide text-[var(--color-text-muted)]">
                  {t(`edumatch.filter.${key}`)}
                </span>
                <select
                  value={filters[key]}
                  onChange={(e) =>
                    setFilters((f) => ({ ...f, [key]: Number(e.target.value) }))
                  }
                  className="mt-1 rounded-lg border border-[var(--color-border)] bg-[var(--color-surface)] px-2 py-1.5 text-sm text-[var(--color-text)]"
                >
                  {RATING_FILTER_OPTIONS.map((o) => (
                    <option key={o.value} value={o.value}>
                      {t(o.labelKey)}
                    </option>
                  ))}
                </select>
              </label>
            ))}
          </div>
        )}

        <p className="mt-3 text-xs text-[var(--color-text-muted)]">
          {t("edumatch.filter.showingCount", {
            shown: items.length,
            total,
          })}
        </p>

        {filtersActive && hiddenCount > 0 && !showAllOverride && (
          <div className="mt-2 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-900">
            {t("edumatch.filter.hiddenNote", { n: hiddenCount })}{" "}
            {hiddenNewcomerCount > 0 &&
              t("edumatch.filter.hiddenNewcomerNote", { n: hiddenNewcomerCount })}{" "}
            <button
              type="button"
              onClick={() => setShowAllOverride(true)}
              className="font-medium underline"
            >
              {t("edumatch.filter.showAll")}
            </button>
          </div>
        )}
      </section>

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

      {total === 0 ? (
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
                    <Link
                      href={`/tutors/${p.tutorId}`}
                      className="hover:text-[var(--color-primary)] hover:underline"
                    >
                      {p.tutorName ?? t("edumatch.match.unnamedTutor")}
                    </Link>
                    {p.verified && (
                      <span className="rounded-full bg-green-100 px-2 py-0.5 text-[10px] font-medium uppercase tracking-wide text-green-800">
                        {t("edumatch.match.verified")}
                      </span>
                    )}
                    {p.ratingCount < NEW_TUTOR_REVIEW_THRESHOLD && (
                      <span className="rounded-full bg-blue-100 px-2 py-0.5 text-[10px] font-medium uppercase tracking-wide text-blue-800">
                        {t("edumatch.filter.newBadge")}
                      </span>
                    )}
                  </h3>
                  <p className="mt-0.5 text-xs text-[var(--color-text-muted)]">
                    {p.ratingCount >= NEW_TUTOR_REVIEW_THRESHOLD
                      ? t("edumatch.match.rating", {
                          avg: p.ratingAvg.toFixed(1),
                          n: p.ratingCount,
                        })
                      : t("edumatch.match.noReviewsYet")}
                  </p>
                  {p.aspectedCount >= NEW_TUTOR_REVIEW_THRESHOLD && (
                    <p className="mt-0.5 text-[11px] text-[var(--color-text-muted)]">
                      {t("edumatch.filter.aspectSummary", {
                        clarity: (p.clarityAvg ?? 0).toFixed(1),
                        reliability: (p.reliabilityAvg ?? 0).toFixed(1),
                        engagement: (p.engagementAvg ?? 0).toFixed(1),
                      })}
                    </p>
                  )}
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
