"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useTranslation } from "@asafarim/shared-i18n";
import { Alert, Button, Card, ConfirmDialog } from "@asafarim/ui";
import {
  COVER_LETTER_LENGTHS,
  COVER_LETTER_TONES,
  EMPTY_WRITING_PREFERENCES,
  MAX_STYLE_NOTE_CHARS,
  sameWritingPreferences,
  type WritingPreferences,
  type WritingPreferencesView,
} from "../../lib/writingPreferences/contract";
import { putWritingPreferences } from "../../lib/writingPreferences/client";
import { LANGUAGE_LABELS, OUTPUT_LANGUAGES, isOutputLanguage } from "../../lib/tailoring/language";

type Note = { tone: "info" | "error"; text: string };

/**
 * Saved writing preferences (#931): the defaults a new tailoring run starts
 * from. Edit, reset (a revision that sets nothing) and delete (every
 * revision). A save names the revision the form started from, so a save
 * from a stale tab is refused and the form shows the latest instead.
 */
export function WritingPreferencesPanel({ initial }: { initial: WritingPreferencesView | null }) {
  const { t, locale } = useTranslation();
  const router = useRouter();
  const [current, setCurrent] = useState<WritingPreferencesView | null>(initial);
  const [value, setValue] = useState<WritingPreferences>(initial?.preferences ?? EMPTY_WRITING_PREFERENCES);
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState<Note | null>(null);
  const [confirmingDelete, setConfirmingDelete] = useState(false);
  // The stored revision changed under the form (erased, or saved in the
  // Tailor card, then refreshed): start again from it.
  const storedKey = initial?.revisionId ?? "none";
  const [seen, setSeen] = useState(storedKey);
  if (seen !== storedKey) {
    setSeen(storedKey);
    setCurrent(initial);
    setValue(initial?.preferences ?? EMPTY_WRITING_PREFERENCES);
  }

  const unchanged = sameWritingPreferences(value, current?.preferences ?? EMPTY_WRITING_PREFERENCES);
  const tooLong = [value.cv.styleNote, value.coverLetter.styleNote].some((n) => (n?.length ?? 0) > MAX_STYLE_NOTE_CHARS);

  function adopt(next: WritingPreferencesView | null) {
    setCurrent(next);
    setValue(next?.preferences ?? EMPTY_WRITING_PREFERENCES);
    router.refresh();
  }

  async function save(prefs: WritingPreferences, okText: string) {
    setBusy(true);
    setNote(null);
    const result = await putWritingPreferences(prefs, current?.revisionId ?? null);
    setBusy(false);
    if (result.kind === "saved") {
      adopt(result.current);
      setNote({ tone: "info", text: result.changed ? okText : t("resumatch.writing.unchanged") });
    } else if (result.kind === "stale") {
      adopt(result.current);
      setNote({ tone: "error", text: t("resumatch.writing.stale") });
    } else if (result.kind === "invalid" && result.code === "style_note_factual") {
      setNote({ tone: "error", text: t("resumatch.writing.error.style_note_factual") });
    } else if (result.kind === "invalid" && result.code === "style_note_too_long") {
      setNote({ tone: "error", text: t("resumatch.writing.error.style_note_too_long", { max: MAX_STYLE_NOTE_CHARS }) });
    } else {
      setNote({ tone: "error", text: t("resumatch.writing.error.save") });
    }
  }

  async function remove() {
    setConfirmingDelete(false);
    setBusy(true);
    setNote(null);
    try {
      const res = await fetch("/api/writing-preferences", { method: "DELETE" });
      if (!res.ok) throw new Error(String(res.status));
      adopt(null);
      setNote({ tone: "info", text: t("resumatch.writing.deleted") });
    } catch {
      setNote({ tone: "error", text: t("resumatch.writing.error.save") });
    } finally {
      setBusy(false);
    }
  }

  const setCv = (patch: Partial<WritingPreferences["cv"]>) => setValue((v) => ({ ...v, cv: { ...v.cv, ...patch } }));
  const setLetter = (patch: Partial<WritingPreferences["coverLetter"]>) =>
    setValue((v) => ({ ...v, coverLetter: { ...v.coverLetter, ...patch } }));
  const noteValue = (text: string) => (text === "" ? null : text);

  return (
    <div id="writing-preferences" className="rm-writing" data-testid="writing-preferences-panel">
      <Card title={t("resumatch.writing.title")}>
        <p className="rm-writing__intro">{t("resumatch.writing.intro")}</p>
        <p className="rm-writing__status" data-testid="writing-preferences-status">
          {current
            ? t("resumatch.writing.revision", {
                number: current.revisionNumber,
                date: new Date(current.savedAt).toLocaleDateString(locale),
              })
            : t("resumatch.writing.none")}
        </p>
        <form
          onSubmit={(e) => {
            e.preventDefault();
            if (!tooLong) void save(value, t("resumatch.writing.saved"));
          }}
        >
          <div className="rm-writing__groups">
            <fieldset className="rm-writing__group">
              <legend>{t("resumatch.writing.cv")}</legend>
              <label className="jm-field">
                <span>{t("resumatch.writing.cvLanguage")}</span>
                <select
                  className="ui-input ui-select"
                  value={value.cv.outputLanguage ?? ""}
                  disabled={busy}
                  onChange={(e) => setCv({ outputLanguage: isOutputLanguage(e.target.value) ? e.target.value : null })}
                >
                  <option value="">{t("resumatch.writing.cvLanguage.unset")}</option>
                  {OUTPUT_LANGUAGES.map((code) => (
                    <option key={code} value={code}>
                      {LANGUAGE_LABELS[code]}
                    </option>
                  ))}
                </select>
              </label>
              <StyleNoteField
                id="rm-writing-cv-note"
                value={value.cv.styleNote ?? ""}
                placeholder={t("resumatch.writing.styleNote.cvPlaceholder")}
                disabled={busy}
                onChange={(text) => setCv({ styleNote: noteValue(text) })}
              />
            </fieldset>
            <fieldset className="rm-writing__group">
              <legend>{t("resumatch.writing.letter")}</legend>
              <div className="rm-writing__row">
                <label className="jm-field">
                  <span>{t("resumatch.flow.tone")}</span>
                  <select
                    className="ui-input ui-select"
                    value={value.coverLetter.tone ?? ""}
                    disabled={busy}
                    onChange={(e) =>
                      setLetter({ tone: COVER_LETTER_TONES.find((tone) => tone === e.target.value) ?? null })
                    }
                  >
                    <option value="">{t("resumatch.writing.tone.unset")}</option>
                    {COVER_LETTER_TONES.map((tone) => (
                      <option key={tone} value={tone}>
                        {t(`resumatch.flow.tone.${tone}`)}
                      </option>
                    ))}
                  </select>
                </label>
                <label className="jm-field">
                  <span>{t("resumatch.flow.length")}</span>
                  <select
                    className="ui-input ui-select"
                    value={value.coverLetter.length ?? ""}
                    disabled={busy}
                    onChange={(e) =>
                      setLetter({ length: COVER_LETTER_LENGTHS.find((length) => length === e.target.value) ?? null })
                    }
                  >
                    <option value="">{t("resumatch.writing.length.unset")}</option>
                    {COVER_LETTER_LENGTHS.map((length) => (
                      <option key={length} value={length}>
                        {t(`resumatch.flow.length.${length}`)}
                      </option>
                    ))}
                  </select>
                </label>
                <label className="jm-field">
                  <span>{t("resumatch.writing.letterLanguage")}</span>
                  <select
                    className="ui-input ui-select"
                    value={value.coverLetter.outputLanguage ?? ""}
                    disabled={busy}
                    onChange={(e) =>
                      setLetter({ outputLanguage: isOutputLanguage(e.target.value) ? e.target.value : null })
                    }
                  >
                    <option value="">{t("resumatch.writing.letterLanguage.unset")}</option>
                    {OUTPUT_LANGUAGES.map((code) => (
                      <option key={code} value={code}>
                        {LANGUAGE_LABELS[code]}
                      </option>
                    ))}
                  </select>
                </label>
              </div>
              <StyleNoteField
                id="rm-writing-letter-note"
                value={value.coverLetter.styleNote ?? ""}
                placeholder={t("resumatch.writing.styleNote.letterPlaceholder")}
                disabled={busy}
                onChange={(text) => setLetter({ styleNote: noteValue(text) })}
              />
            </fieldset>
          </div>
          <div className="rm-writing__actions">
            <Button type="submit" disabled={busy || unchanged || tooLong}>
              {t("resumatch.writing.save")}
            </Button>
            {current ? (
              <>
                <Button
                  type="button"
                  variant="ghost"
                  disabled={busy || sameWritingPreferences(current.preferences, EMPTY_WRITING_PREFERENCES)}
                  onClick={() => void save(EMPTY_WRITING_PREFERENCES, t("resumatch.writing.resetDone"))}
                >
                  {t("resumatch.writing.reset")}
                </Button>
                <Button type="button" variant="ghost" disabled={busy} onClick={() => setConfirmingDelete(true)}>
                  {t("resumatch.writing.delete")}
                </Button>
              </>
            ) : null}
          </div>
        </form>
        {note ? (
          <div className="rm-writing__note">
            <Alert tone={note.tone}>{note.text}</Alert>
          </div>
        ) : null}
      </Card>
      <ConfirmDialog
        open={confirmingDelete}
        title={t("resumatch.writing.dialog.title")}
        message={t("resumatch.writing.dialog.message")}
        confirmLabel={t("resumatch.writing.dialog.confirm")}
        cancelLabel={t("resumatch.writing.dialog.cancel")}
        tone="danger"
        onConfirm={() => void remove()}
        onCancel={() => setConfirmingDelete(false)}
      />
    </div>
  );
}

function StyleNoteField({
  id,
  value,
  placeholder,
  disabled,
  onChange,
}: {
  id: string;
  value: string;
  placeholder: string;
  disabled: boolean;
  onChange: (text: string) => void;
}) {
  const { t } = useTranslation();
  return (
    <label className="jm-field rm-writing__note-field" htmlFor={id}>
      <span>{t("resumatch.writing.styleNote")}</span>
      <textarea
        id={id}
        className="ui-input"
        rows={2}
        maxLength={MAX_STYLE_NOTE_CHARS}
        value={value}
        placeholder={placeholder}
        disabled={disabled}
        aria-describedby={`${id}-hint`}
        onChange={(e) => onChange(e.target.value)}
      />
      <small id={`${id}-hint`} className="rm-writing__hint">
        {t("resumatch.writing.styleNote.hint")}{" "}
        {t("resumatch.writing.styleNote.counter", { count: value.length, max: MAX_STYLE_NOTE_CHARS })}
      </small>
    </label>
  );
}
