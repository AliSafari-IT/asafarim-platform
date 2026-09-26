"use client";

import { useTranslation } from "@asafarim/shared-i18n";
import type { CoverageReport as CoverageReportData } from "../../../../lib/tailoring/coverage";

/**
 * Renders the deterministic coverage summary computed by
 * lib/tailoring/coverage.ts. A client component only for
 * `useTranslation()` — there is no other client state.
 */
export function CoverageReport({ coverage }: { coverage: CoverageReportData }) {
  const { t } = useTranslation();
  if (coverage.matchedSkills.length === 0 && coverage.missingKeywords.length === 0) return null;

  return (
    <div className="rm-coverage">
      <div className="rm-coverage__header">
        <strong>{t("resumatch.coverage.title")}</strong>
        <span className="rm-coverage__percent">{t("resumatch.coverage.percent", { percent: coverage.matchPercent })}</span>
      </div>

      {coverage.matchedSkills.length > 0 ? (
        <div className="rm-coverage__row">
          <span className="rm-coverage__label">{t("resumatch.coverage.matched")}</span>
          <ul className="rm-coverage__pills rm-coverage__pills--matched">
            {coverage.matchedSkills.map((skill) => (
              <li key={skill}>{skill}</li>
            ))}
          </ul>
        </div>
      ) : null}

      {coverage.missingKeywords.length > 0 ? (
        <div className="rm-coverage__row">
          <span className="rm-coverage__label">{t("resumatch.coverage.missing")}</span>
          <ul className="rm-coverage__pills rm-coverage__pills--missing">
            {coverage.missingKeywords.map((keyword) => (
              <li key={keyword}>{keyword}</li>
            ))}
          </ul>
        </div>
      ) : null}

      <p className="rm-coverage__note">{t("resumatch.coverage.note")}</p>
    </div>
  );
}
