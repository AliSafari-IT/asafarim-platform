import type { CoverageReport as CoverageReportData } from "../../../../lib/tailoring/coverage";

/**
 * Renders the deterministic coverage summary computed by
 * lib/tailoring/coverage.ts. Plain server-rendered markup — the only
 * interactive bit (the missing-keywords list) uses a native <details>, no
 * client JS needed.
 */
export function CoverageReport({ coverage }: { coverage: CoverageReportData }) {
  if (coverage.matchedSkills.length === 0 && coverage.missingKeywords.length === 0) return null;

  return (
    <div className="rm-coverage">
      <div className="rm-coverage__header">
        <strong>Coverage of this posting</strong>
        <span className="rm-coverage__percent">{coverage.matchPercent}% of your skills matched</span>
      </div>

      {coverage.matchedSkills.length > 0 ? (
        <div className="rm-coverage__row">
          <span className="rm-coverage__label">Matched</span>
          <ul className="rm-coverage__pills rm-coverage__pills--matched">
            {coverage.matchedSkills.map((skill) => (
              <li key={skill}>{skill}</li>
            ))}
          </ul>
        </div>
      ) : null}

      {coverage.missingKeywords.length > 0 ? (
        <div className="rm-coverage__row">
          <span className="rm-coverage__label">Not covered</span>
          <ul className="rm-coverage__pills rm-coverage__pills--missing">
            {coverage.missingKeywords.map((keyword) => (
              <li key={keyword}>{keyword}</li>
            ))}
          </ul>
        </div>
      ) : null}

      <p className="rm-coverage__note">
        A rough, deterministic read of this posting's own wording against your resume — not an ATS
        score, and never a reason to add a skill you don't have. Some "not covered" terms are simply
        irrelevant to you.
      </p>
    </div>
  );
}
