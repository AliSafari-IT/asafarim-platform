"use client";

/**
 * The honest answer to "do I actually need a tutor?", shown inside the
 * conversation before tutors are offered.
 *
 * Self-study is presented as a legitimate, complete outcome rather than a
 * consolation prize — the student can carry on with the plan and never book
 * anything. Recommending a tutor to someone who doesn't need one is the
 * failure mode this card exists to prevent.
 */

import { useTranslation } from "@asafarim/shared-i18n";
import type { BriefView } from "@/lib/types/learning";

export function TriageCard({
  brief,
  onReview,
  canReview,
}: {
  brief: BriefView;
  onReview: () => void;
  canReview: boolean;
}) {
  const { t } = useTranslation();
  if (!brief.triageOutcome) return null;

  const tone =
    brief.triageOutcome === "TUTOR_RECOMMENDED"
      ? "border-[var(--color-primary)]"
      : "border-[var(--color-border)]";

  return (
    <section
      className={`mt-6 rounded-xl border ${tone} bg-[var(--color-panel)] p-5`}
      aria-labelledby="triage-heading"
    >
      <h2
        id="triage-heading"
        className="text-sm font-semibold text-[var(--color-text)]"
      >
        {t(`edumatch.learn.triage.${brief.triageOutcome}.title`)}
      </h2>
      <p className="mt-1 text-sm text-[var(--color-text-muted)]">
        {brief.triageRationale ||
          t(`edumatch.learn.triage.${brief.triageOutcome}.desc`)}
      </p>

      <div className="mt-4">
        <div
          className="h-1.5 w-full overflow-hidden rounded-full bg-[var(--color-surface)]"
          role="progressbar"
          aria-valuenow={Math.round(brief.completeness * 100)}
          aria-valuemin={0}
          aria-valuemax={100}
          aria-label={t("edumatch.learn.completeness")}
        >
          <div
            className="h-full bg-[var(--color-primary)] transition-all"
            style={{ width: `${Math.round(brief.completeness * 100)}%` }}
          />
        </div>
        <p className="mt-1.5 text-xs text-[var(--color-text-muted)]">
          {t("edumatch.learn.completenessValue", {
            n: Math.round(brief.completeness * 100),
          })}
        </p>
      </div>

      {brief.triageOutcome !== "SELF_STUDY" && (
        <button
          type="button"
          onClick={onReview}
          disabled={!canReview}
          className="mt-4 rounded-lg bg-[var(--color-primary)] px-5 py-2.5 text-sm font-medium text-white transition hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-40"
        >
          {t("edumatch.learn.reviewBriefBtn")}
        </button>
      )}
      {!canReview && brief.blockers.length > 0 && (
        <p className="mt-2 text-xs text-[var(--color-text-muted)]">
          {t("edumatch.learn.stillNeeded", {
            fields: brief.blockers.join(", "),
          })}
        </p>
      )}
    </section>
  );
}
