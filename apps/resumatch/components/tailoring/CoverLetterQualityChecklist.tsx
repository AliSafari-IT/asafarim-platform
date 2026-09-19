import type { CoverLetterQualityReport } from "../../lib/tailoring/coverLetterQuality";

/**
 * Renders the deterministic checklist computed by
 * lib/tailoring/coverLetterQuality.ts. Same "checklist, not a score"
 * posture as the CV's QualityChecklist. Server-rendered, no client JS
 * needed.
 */
export function CoverLetterQualityChecklist({ quality }: { quality: CoverLetterQualityReport }) {
  const checks: { label: string; ok: boolean; detail: string | null }[] = [
    {
      label: "Length fits the target",
      ok: quality.wordCountInRange,
      detail: `${quality.wordCount} words across ${quality.paragraphCount} paragraph${quality.paragraphCount === 1 ? "" : "s"}${quality.wordCountInRange ? "" : " — outside the usual range for this length."}`,
    },
    {
      label: "No generic filler phrases",
      ok: quality.genericPhrasesFound.length === 0,
      detail:
        quality.genericPhrasesFound.length > 0
          ? `Found: "${quality.genericPhrasesFound.join('", "')}" — these read as templated to most ATS/recruiter screens.`
          : null,
    },
    {
      label: "No unfilled placeholders",
      ok: !quality.hasUnfilledPlaceholder,
      detail: quality.hasUnfilledPlaceholder
        ? "A bracketed placeholder like [Company Name] appears somewhere in the letter — fill it in or remove it."
        : null,
    },
    {
      label: "Greeting looks intentional",
      ok: quality.greetingLooksIntentional,
      detail: quality.greetingLooksIntentional
        ? null
        : "The greeting looks like it still has a placeholder in it rather than a real or neutral salutation.",
    },
    {
      label: "Signed with your name",
      ok: quality.hasSignerName,
      detail: quality.hasSignerName ? null : "Your confirmed profile has no name to sign this with yet.",
    },
  ];

  return (
    <div className="rm-quality">
      <div className="rm-quality__header">
        <strong>Letter hygiene</strong>
      </div>
      <ul className="rm-quality__list">
        {checks.map((check) => (
          <li key={check.label} className={check.ok ? "rm-quality__item--ok" : "rm-quality__item--warn"}>
            <span className="rm-quality__mark">{check.ok ? "✓" : "!"}</span>
            <span>
              {check.label}
              {check.detail ? <span className="rm-quality__detail"> — {check.detail}</span> : null}
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}
