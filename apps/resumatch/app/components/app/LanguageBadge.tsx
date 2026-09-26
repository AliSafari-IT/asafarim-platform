"use client";

import { useTranslation } from "@asafarim/shared-i18n";
import { LANGUAGE_LABELS, isOutputLanguage } from "../../../lib/tailoring/language";

/**
 * The language a tailored CV (#641) or cover letter (#642) was written in,
 * as a small pill. Renders nothing when no language was applied (older
 * documents, degraded runs, or CV reviews where every suggestion was
 * declined), so nothing is claimed that didn't happen. `coverLetter` names
 * the document when a CV and its letter sit side by side ("Cover letter
 * written in …"). The pill itself shows the language's own name, whatever
 * the UI language.
 */
export function LanguageBadge({
  language,
  coverLetter = false,
}: {
  language: string | null | undefined;
  coverLetter?: boolean;
}) {
  const { t } = useTranslation();
  if (!isOutputLanguage(language)) return null;
  const prefix = t(coverLetter ? "resumatch.langBadge.coverLetterWrittenIn" : "resumatch.langBadge.writtenIn");
  return (
    <span className="rx-pill rx-pill--lang" title={`${prefix}${LANGUAGE_LABELS[language]}`}>
      <span className="sr-only">{prefix}</span>
      {LANGUAGE_LABELS[language]}
    </span>
  );
}
