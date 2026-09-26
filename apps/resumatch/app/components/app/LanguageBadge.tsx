import { LANGUAGE_LABELS, isOutputLanguage } from "../../../lib/tailoring/language";

/**
 * The language a tailored CV (#641) or cover letter (#642) was written in,
 * as a small pill. Renders nothing when no language was applied (older
 * documents, degraded runs, or CV reviews where every suggestion was
 * declined), so nothing is claimed that didn't happen. `subject` names the
 * document when a CV and its letter sit side by side ("Cover letter
 * written in …").
 */
export function LanguageBadge({ language, subject }: { language: string | null | undefined; subject?: string }) {
  if (!isOutputLanguage(language)) return null;
  const prefix = subject ? `${subject} written in ` : "Written in ";
  return (
    <span className="rx-pill rx-pill--lang" title={`${prefix}${LANGUAGE_LABELS[language]}`}>
      <span className="sr-only">{prefix}</span>
      {LANGUAGE_LABELS[language]}
    </span>
  );
}
