import { LANGUAGE_LABELS, isOutputLanguage } from "../../../lib/tailoring/language";

/**
 * The language a tailored CV was written in (#641), as a small pill.
 * Renders nothing when no language was applied (older CVs, degraded runs,
 * or reviews where every suggestion was declined), so nothing is claimed
 * that didn't happen.
 */
export function LanguageBadge({ language }: { language: string | null | undefined }) {
  if (!isOutputLanguage(language)) return null;
  return (
    <span className="rx-pill rx-pill--lang" title={`Written in ${LANGUAGE_LABELS[language]}`}>
      <span className="sr-only">Written in </span>
      {LANGUAGE_LABELS[language]}
    </span>
  );
}
