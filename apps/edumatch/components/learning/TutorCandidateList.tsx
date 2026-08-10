"use client";

/**
 * The matched tutors, each shown with the reasons they were selected.
 *
 * Two deliberate absences: no "best match" badge, and no way for a tutor to
 * appear here by paying. The reasons come straight from the persisted match
 * breakdown, so what the student reads is the actual basis of the ranking
 * rather than marketing copy written next to it.
 */

import { useTranslation } from "@asafarim/shared-i18n";
import { formatEuros, type TutorCandidateView } from "@/lib/types/learning";

export function TutorCandidateList({
  candidates,
}: {
  candidates: TutorCandidateView[];
}) {
  const { t } = useTranslation();

  if (candidates.length === 0) {
    return (
      <p className="text-sm text-[var(--color-text-muted)]">
        {t("edumatch.match.empty")}
      </p>
    );
  }

  return (
    <ul className="space-y-3">
      {candidates.map((c) => (
        <li
          key={c.tutorId}
          className="rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)] p-4"
        >
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div className="min-w-0">
              <p className="flex items-center gap-2 text-sm font-semibold text-[var(--color-text)]">
                {c.name ?? t("edumatch.match.unnamedTutor")}
                {c.verifiedAt && (
                  <span className="rounded-full bg-green-100 px-2 py-0.5 text-[10px] font-medium uppercase tracking-wide text-green-800">
                    {t("edumatch.match.verified")}
                  </span>
                )}
                {c.rotationBoost && (
                  <span
                    className="rounded-full bg-[var(--color-panel)] px-2 py-0.5 text-[10px] font-medium uppercase tracking-wide text-[var(--color-text-muted)]"
                    title={t("edumatch.match.newTutorHint")}
                  >
                    {t("edumatch.match.newTutor")}
                  </span>
                )}
              </p>
              <p className="mt-0.5 text-xs text-[var(--color-text-muted)]">
                {c.ratingCount > 0
                  ? t("edumatch.match.rating", {
                      avg: c.ratingAvg.toFixed(1),
                      n: c.ratingCount,
                    })
                  : t("edumatch.match.noReviewsYet")}
                {c.teachingStyle
                  ? ` · ${t(`edumatch.match.style.${c.teachingStyle}`)}`
                  : ""}
              </p>
            </div>
            <p className="shrink-0 text-sm font-semibold text-[var(--color-text)]">
              {t("edumatch.match.perHour", {
                price: formatEuros(c.hourlyRateCents),
              })}
            </p>
          </div>

          {c.reasons.length > 0 && (
            <ul className="mt-3 flex flex-wrap gap-1.5">
              {c.reasons.map((reason) => (
                <li
                  key={reason}
                  className="rounded-full border border-[var(--color-border)] px-2.5 py-1 text-xs text-[var(--color-text-muted)]"
                >
                  {reason}
                </li>
              ))}
            </ul>
          )}

          {c.qualifications.length > 0 && (
            <p className="mt-2 text-xs text-[var(--color-text-muted)]">
              {c.qualifications.join(" · ")}
            </p>
          )}
        </li>
      ))}
    </ul>
  );
}
