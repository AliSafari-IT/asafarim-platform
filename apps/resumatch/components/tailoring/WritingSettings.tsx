"use client";

import Link from "next/link";
import { useTranslation } from "@asafarim/shared-i18n";
import { Alert, Button } from "@asafarim/ui";
import type { WritingPreferencesView } from "../../lib/writingPreferences/contract";

/**
 * #931 on the Tailor options card: where one setting comes from. Shown only
 * when the candidate saved a value for it: "From your writing preferences"
 * while the card still has that value, "For this application only" once
 * they changed it here.
 */
export function WritingSource<T>({ saved, value, testId }: { saved: T | null | undefined; value: T; testId?: string }) {
  const { t } = useTranslation();
  if (saved === null || saved === undefined) return null;
  return (
    <small className="rm-writing-source" data-testid={testId}>
      {saved === value ? t("resumatch.writing.source.saved") : t("resumatch.writing.source.request")}
    </small>
  );
}

/**
 * #931: the card's writing-preferences summary. Says whether saved
 * preferences are in use and that changes here apply to this application
 * only; offers "Remember" (an explicit save, never automatic) and, when the
 * candidate saved style notes, a per-run switch to leave them out.
 */
export function WritingSettingsSummary({
  saved,
  canRemember,
  remembering,
  onRemember,
  useNotes,
  onUseNotesChange,
  includeLetter,
  note,
}: {
  saved: WritingPreferencesView | null;
  canRemember: boolean;
  remembering: boolean;
  onRemember: () => void;
  useNotes: boolean;
  onUseNotesChange: (value: boolean) => void;
  includeLetter: boolean;
  note: { tone: "info" | "error"; text: string } | null;
}) {
  const { t } = useTranslation();
  const cvNote = saved?.preferences.cv.styleNote ?? null;
  const letterNote = saved?.preferences.coverLetter.styleNote ?? null;
  const shownNotes = [
    cvNote ? t("resumatch.writing.flow.noteCv", { note: cvNote }) : null,
    includeLetter && letterNote ? t("resumatch.writing.flow.noteLetter", { note: letterNote }) : null,
  ].filter((n): n is string => n !== null);
  return (
    <div className="rm-writing-flow" data-testid="writing-settings">
      <p>
        {saved
          ? t("resumatch.writing.flow.using", { number: saved.revisionNumber })
          : t("resumatch.writing.flow.none")}
      </p>
      {shownNotes.length > 0 ? (
        <>
          <label style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}>
            <input
              type="checkbox"
              checked={useNotes}
              onChange={(e) => onUseNotesChange(e.target.checked)}
              data-testid="writing-use-notes"
            />
            <span>{t("resumatch.writing.flow.useNotes")}</span>
          </label>
          <ul className="rm-writing-flow__notes">
            {shownNotes.map((text) => (
              <li key={text}>{text}</li>
            ))}
          </ul>
        </>
      ) : null}
      <div className="rm-writing-flow__links">
        <Button
          type="button"
          variant="ghost"
          size="sm"
          disabled={!canRemember || remembering}
          onClick={onRemember}
          data-testid="writing-remember"
        >
          {t("resumatch.writing.flow.remember")}
        </Button>
        <Link href="/profile#writing-preferences" className="rx-link">
          {t("resumatch.writing.flow.edit")}
        </Link>
      </div>
      {note ? (
        <div>
          <Alert tone={note.tone}>{note.text}</Alert>
        </div>
      ) : null}
    </div>
  );
}
