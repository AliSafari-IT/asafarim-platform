"use client";

import { useTranslation } from "@asafarim/shared-i18n";
import type { CoverLetterQualityReport } from "../../lib/tailoring/coverLetterQuality";

/**
 * Renders the deterministic checklist computed by
 * lib/tailoring/coverLetterQuality.ts. Same "checklist, not a score"
 * posture as the CV's QualityChecklist. A client component only for
 * `useTranslation()`: it renders both in TailorFlow's review step and on
 * the (server) cover-letter preview page.
 */
export function CoverLetterQualityChecklist({ quality }: { quality: CoverLetterQualityReport }) {
  const { t } = useTranslation();
  const checks: { label: string; ok: boolean; detail: string | null }[] = [
    {
      label: t("resumatch.letterQuality.length"),
      ok: quality.wordCountInRange,
      detail:
        t(`resumatch.letterQuality.length.detail.${quality.paragraphCount === 1 ? "one" : "other"}`, {
          words: quality.wordCount,
          count: quality.paragraphCount,
        }) + (quality.wordCountInRange ? "" : t("resumatch.letterQuality.length.outOfRange")),
    },
    {
      label: t("resumatch.letterQuality.generic"),
      ok: quality.genericPhrasesFound.length === 0,
      detail:
        quality.genericPhrasesFound.length > 0
          ? t("resumatch.letterQuality.generic.detail", {
              phrases: quality.genericPhrasesFound.map((phrase) => `"${phrase}"`).join(", "),
            })
          : null,
    },
    {
      label: t("resumatch.letterQuality.placeholder"),
      ok: !quality.hasUnfilledPlaceholder,
      detail: quality.hasUnfilledPlaceholder ? t("resumatch.letterQuality.placeholder.detail") : null,
    },
    {
      label: t("resumatch.letterQuality.greeting"),
      ok: quality.greetingLooksIntentional,
      detail: quality.greetingLooksIntentional ? null : t("resumatch.letterQuality.greeting.detail"),
    },
    // #642: only for a letter written in a language other than English.
    ...(quality.greetingMatchesLanguage === null
      ? []
      : [
          {
            label: t("resumatch.letterQuality.language"),
            ok: quality.greetingMatchesLanguage,
            detail: quality.greetingMatchesLanguage ? null : t("resumatch.letterQuality.language.detail"),
          },
        ]),
    {
      label: t("resumatch.letterQuality.signed"),
      ok: quality.hasSignerName,
      detail: quality.hasSignerName ? null : t("resumatch.letterQuality.signed.detail"),
    },
  ];

  return (
    <div className="rm-quality">
      <div className="rm-quality__header">
        <strong>{t("resumatch.letterQuality.title")}</strong>
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
