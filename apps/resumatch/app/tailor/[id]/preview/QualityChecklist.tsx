"use client";

import { useTranslation } from "@asafarim/shared-i18n";
import type { QualityReport } from "../../../../lib/tailoring/quality";

/**
 * Renders the deterministic checklist computed by lib/tailoring/quality.ts.
 * A checklist, not a score — each row states what it found and links
 * nothing back into the document. A client component only for
 * `useTranslation()`.
 */
export function QualityChecklist({ quality }: { quality: QualityReport }) {
  const { t } = useTranslation();
  const plural = (key: string, count: number) => t(`${key}.${count === 1 ? "one" : "other"}`, { count });

  const checks: { label: string; ok: boolean; detail: string | null }[] = [
    {
      label: t("resumatch.quality.metric"),
      ok: quality.totalBullets > 0 && quality.bulletsWithoutMetric.length === 0,
      detail:
        quality.totalBullets === 0
          ? null
          : t("resumatch.quality.metric.detail", {
              withMetric: quality.totalBullets - quality.bulletsWithoutMetric.length,
              total: quality.totalBullets,
            }),
    },
    {
      label: t("resumatch.quality.verb"),
      ok: quality.weakLeadBullets.length === 0,
      detail:
        quality.weakLeadBullets.length > 0
          ? plural("resumatch.quality.verb.detail", quality.weakLeadBullets.length)
          : null,
    },
    {
      label: t("resumatch.quality.length"),
      ok: quality.overLengthBullets.length === 0,
      detail:
        quality.overLengthBullets.length > 0
          ? plural("resumatch.quality.length.detail", quality.overLengthBullets.length)
          : null,
    },
    {
      label: t("resumatch.quality.contact"),
      ok: quality.missingFields.length === 0,
      detail:
        quality.missingFields.length > 0
          ? t("resumatch.quality.contact.detail", {
              fields: quality.missingFields.map((f) => t(`resumatch.quality.field.${f}`)).join(", "),
            })
          : null,
    },
    {
      label: t("resumatch.quality.skills"),
      ok: !quality.skillsCountIsLow && !quality.skillsCountIsHigh,
      detail: quality.skillsCountIsLow
        ? plural("resumatch.quality.skills.low", quality.skillsCount)
        : quality.skillsCountIsHigh
          ? t("resumatch.quality.skills.high", { count: quality.skillsCount })
          : null,
    },
  ];

  return (
    <div className="rm-quality">
      <div className="rm-quality__header">
        <strong>{t("resumatch.quality.title")}</strong>
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
