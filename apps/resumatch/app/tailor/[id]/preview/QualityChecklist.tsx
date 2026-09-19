import type { QualityReport } from "../../../../lib/tailoring/quality";

const FIELD_LABELS: Record<string, string> = {
  headline: "Headline",
  summary: "Summary",
  email: "Email",
  phone: "Phone",
};

/**
 * Renders the deterministic checklist computed by lib/tailoring/quality.ts.
 * A checklist, not a score — each row states what it found and links
 * nothing back into the document. Server-rendered, no client JS needed.
 */
export function QualityChecklist({ quality }: { quality: QualityReport }) {
  const checks: { label: string; ok: boolean; detail: string | null }[] = [
    {
      label: "Bullets include a metric",
      ok: quality.totalBullets > 0 && quality.bulletsWithoutMetric.length === 0,
      detail:
        quality.totalBullets === 0
          ? null
          : `${quality.totalBullets - quality.bulletsWithoutMetric.length} of ${quality.totalBullets} bullets contain a number.`,
    },
    {
      label: "Bullets open with a strong action verb",
      ok: quality.weakLeadBullets.length === 0,
      detail:
        quality.weakLeadBullets.length > 0
          ? `${quality.weakLeadBullets.length} bullet${quality.weakLeadBullets.length === 1 ? "" : "s"} open on a weak or passive verb.`
          : null,
    },
    {
      label: "Bullets are print-friendly length",
      ok: quality.overLengthBullets.length === 0,
      detail:
        quality.overLengthBullets.length > 0
          ? `${quality.overLengthBullets.length} bullet${quality.overLengthBullets.length === 1 ? "" : "s"} likely wrap to a second line.`
          : null,
    },
    {
      label: "Contact details and headline complete",
      ok: quality.missingFields.length === 0,
      detail:
        quality.missingFields.length > 0
          ? `Missing: ${quality.missingFields.map((f) => FIELD_LABELS[f]).join(", ")}.`
          : null,
    },
    {
      label: "Skills count looks reasonable",
      ok: !quality.skillsCountIsLow && !quality.skillsCountIsHigh,
      detail: quality.skillsCountIsLow
        ? `Only ${quality.skillsCount} skill${quality.skillsCount === 1 ? "" : "s"} listed — consider adding more.`
        : quality.skillsCountIsHigh
          ? `${quality.skillsCount} skills listed — consider trimming to the most relevant.`
          : null,
    },
  ];

  return (
    <div className="rm-quality">
      <div className="rm-quality__header">
        <strong>Document hygiene</strong>
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
