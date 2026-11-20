"use client";

import { useTranslation } from "@asafarim/shared-i18n";
import { Alert, Button } from "@asafarim/ui";
import type { JobFit } from "../../lib/tailoring/jobFit";

/**
 * Shows the fit check (lib/tailoring/jobFit.ts) on the fetched-job card.
 *
 * Low fit: a warning that the job looks outside the candidate's profile,
 * what matches and what doesn't, and an explicit choice. Only "Yes, tailor
 * it anyway" reveals the tailoring options; "No" goes back to picking a job.
 * Partial or strong fit: one quiet line, with the details on request.
 * Unknown (too little text to judge): nothing.
 */
export function JobFitPanel({
  fit,
  confirmed,
  onConfirm,
  onDecline,
}: {
  fit: JobFit;
  confirmed: boolean;
  onConfirm: () => void;
  onDecline: () => void;
}) {
  const { t } = useTranslation();
  if (fit.level === "unknown") return null;

  // The candidate's own skill names first, then other shared terms that
  // aren't just a lower-cased copy of one of them.
  const skillKeys = new Set(fit.matchedSkills.map((s) => s.toLowerCase()));
  const matched = [...fit.matchedSkills, ...fit.matchedTerms.filter((term) => !skillKeys.has(term.toLowerCase()))].slice(0, 12);

  const details = (
    <dl className="rm-fit__details">
      {fit.matchedTerms.length > 0 || fit.matchedSkills.length > 0 ? (
        <>
          <dt>{t("resumatch.fit.matched")}</dt>
          <dd>
            {matched.map((term) => (
              <span key={term} className="rx-pill rx-pill--ok">
                {term}
              </span>
            ))}
          </dd>
        </>
      ) : null}
      {fit.missingTerms.length > 0 ? (
        <>
          <dt>{t("resumatch.fit.missing")}</dt>
          <dd>
            {fit.missingTerms.map((term) => (
              <span key={term} className="rx-pill rx-pill--warm">
                {term}
              </span>
            ))}
          </dd>
        </>
      ) : null}
      {fit.closestExperience.length > 0 ? (
        <>
          <dt>{t("resumatch.fit.closest")}</dt>
          <dd>
            {fit.closestExperience
              .map((e) => (e.employer ? t("resumatch.fit.closestEntry", { title: e.title, employer: e.employer }) : e.title))
              .join("; ")}
          </dd>
        </>
      ) : null}
    </dl>
  );

  if (fit.level !== "low") {
    return (
      <details className="rm-fit rm-fit--quiet">
        <summary>
          {t(fit.level === "strong" ? "resumatch.fit.strong" : "resumatch.fit.partial", { score: fit.score })}
        </summary>
        {details}
      </details>
    );
  }

  if (confirmed) {
    return (
      <div className="rm-fit">
        <Alert tone="info">{t("resumatch.fit.confirmedNote")}</Alert>
      </div>
    );
  }

  return (
    <section className="rm-fit rm-fit--low" aria-labelledby="rm-fit-title">
      <Alert tone="warning">
        <strong id="rm-fit-title">{t("resumatch.fit.low.title")}</strong>
        <p>{fit.score === 0 ? t("resumatch.fit.low.bodyNone") : t("resumatch.fit.low.body", { score: fit.score })}</p>
      </Alert>
      {details}
      <p className="rm-fit__question">{t("resumatch.fit.low.question")}</p>
      <p className="rm-fit__hint">{t("resumatch.fit.low.hint")}</p>
      <div className="rm-fit__actions">
        <Button onClick={onConfirm}>{t("resumatch.fit.low.yes")}</Button>
        <Button variant="ghost" onClick={onDecline}>
          {t("resumatch.fit.low.no")}
        </Button>
      </div>
    </section>
  );
}
