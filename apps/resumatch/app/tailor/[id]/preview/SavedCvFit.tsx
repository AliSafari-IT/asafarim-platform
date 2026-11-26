"use client";

import Link from "next/link";
import { useId } from "react";
import { useTranslation } from "@asafarim/shared-i18n";
import { FitSummary } from "../../../../components/tailoring/FitSummary";
import type { OtherFitAssessment, SavedCvFit as SavedCvFitData } from "../../../../lib/tailoring/fit/savedCv";

/**
 * The saved CV's own job fit on its preview (#973), read-only. Either the
 * assessment this CV's run recorded, as it was when the CV was saved, or a
 * plain "not analyzed for this version" with why and where to analyze.
 * Another assessment of the same job and profile version is shown apart
 * and labelled as not this CV's. Nothing here calls a provider.
 */
export function SavedCvFit({
  fit,
  analyzeHref,
  profileChanged,
}: {
  fit: SavedCvFitData;
  /** Tailor, on this CV's job. Null when the job cannot be analyzed. */
  analyzeHref: string | null;
  /** The confirmed profile is no longer this CV's profile version. */
  profileChanged: boolean;
}) {
  const { t, locale } = useTranslation();
  const headingId = useId();
  const date = (iso: string) => new Date(iso).toLocaleDateString(locale, { day: "numeric", month: "short", year: "numeric" });

  return (
    <section
      className="rm-jfa rm-jfa--cv"
      aria-labelledby={headingId}
      data-testid="cv-fit"
      data-state={fit.kind === "recorded" ? "recorded" : fit.reason}
    >
      <header className="rm-jfa__head">
        <div>
          <h2 id={headingId} className="rm-jfa__title">
            {t("resumatch.cvfit.title")}
          </h2>
          {fit.kind === "recorded" ? (
            <p className="rm-jfa__method" data-testid="fit-method" data-assessment-id={fit.view.meta?.id}>
              {t("resumatch.jfa.method.ai", { date: fit.view.meta ? date(fit.view.meta.createdAt) : "" })}
            </p>
          ) : null}
        </div>
      </header>

      {fit.kind === "recorded" ? (
        <>
          <p className="rm-jfa__muted">{t("resumatch.cvfit.recorded", { date: date(fit.asOf) })}</p>
          {fit.inputsChanged ? (
            <p className="rm-jfa__stale" role="note" data-testid="fit-stale">
              {t("resumatch.cvfit.inputsChanged")}
            </p>
          ) : null}
          {fit.rubricChanged ? (
            <p className="rm-jfa__muted">{t("resumatch.cvfit.rubricChanged", { current: fit.view.score.rubricVersion, recorded: fit.recordedRubricVersion })}</p>
          ) : null}
          <FitSummary view={fit.view} />
        </>
      ) : (
        <div data-testid="fit-none">
          <p className="rm-jfa__verdict">{t("resumatch.cvfit.none.title")}</p>
          <p className="rm-jfa__muted">{t(`resumatch.cvfit.none.${fit.reason}`)}</p>
          {analyzeHref ? (
            <>
              <p>
                <Link href={analyzeHref} className="ui-btn ui-btn--ghost" data-testid="fit-analyze-link">
                  {t("resumatch.cvfit.analyze")}
                </Link>
              </p>
              <p className="rm-jfa__muted">{t("resumatch.cvfit.analyzeHint")}</p>
              {profileChanged ? <p className="rm-jfa__muted">{t("resumatch.cvfit.profileChanged")}</p> : null}
            </>
          ) : null}
        </div>
      )}

      {fit.other ? <Other other={fit.other} newer={fit.kind === "recorded"} href={analyzeHref} date={date} /> : null}
    </section>
  );
}

function Other({ other, newer, href, date }: { other: OtherFitAssessment; newer: boolean; href: string | null; date: (iso: string) => string }) {
  const { t } = useTranslation();
  return (
    <div className="rm-jfa__other" data-testid="fit-other" data-assessment-id={other.id}>
      <p>{t(newer ? "resumatch.cvfit.other.newer" : "resumatch.cvfit.other.only", { date: date(other.createdAt) })}</p>
      <p className="rm-jfa__muted">
        {other.score.percent !== null
          ? t("resumatch.cvfit.other.percent", { percent: other.score.percent })
          : t("resumatch.cvfit.other.insufficient")}{" "}
        · {t("resumatch.cvfit.other.completeness", { percent: other.score.completeness })} · {t(`resumatch.jfa.suitability.${other.score.suitability.overall}`)}
      </p>
      {other.stale ? <p className="rm-jfa__muted">{t("resumatch.cvfit.other.stale")}</p> : null}
      {href ? (
        <p>
          <Link href={href} className="rm-preview-link">
            {t("resumatch.cvfit.other.open")}
          </Link>
        </p>
      ) : null}
    </div>
  );
}
