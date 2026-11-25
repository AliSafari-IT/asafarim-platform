"use client";

import { useEffect, useId, useRef, type KeyboardEvent } from "react";
import { useTranslation } from "@asafarim/shared-i18n";
import { Button } from "@asafarim/ui";
import {
  MAX_SKILLS_PARAGRAPH_LENGTH,
  normalizeHandEditedParagraph,
} from "../../lib/tailoring/ai/skillsParagraph/handEditRules";
import { Spinner, useSkillsPending } from "./SkillsPending";

/**
 * The skills paragraph, editable in place in the CV's Skills section
 * ("Edit paragraph" in the skills picker). A view only: the picker owns
 * the request and the status, and this calls its Save and Cancel through
 * the shared context (SkillsPending.tsx). Screen-only; the downloads wait
 * while it is open.
 *
 * Ctrl/Cmd+Enter saves, Escape cancels.
 */
export function SkillsParagraphEditor() {
  const { t } = useTranslation();
  const { edit, setEdit, editActions } = useSkillsPending();
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const baseId = useId();
  const noteId = `${baseId}-note`;
  const countId = `${baseId}-count`;
  const errorId = `${baseId}-error`;

  // Focus once when the editor opens, caret at the end.
  useEffect(() => {
    const input = inputRef.current;
    if (!input) return;
    input.focus();
    input.setSelectionRange(input.value.length, input.value.length);
    input.scrollIntoView({ block: "center", behavior: "smooth" });
  }, []);

  if (!edit) return null;
  const length = normalizeHandEditedParagraph(edit.draft).length;
  const over = length > MAX_SKILLS_PARAGRAPH_LENGTH;

  function onKeyDown(event: KeyboardEvent<HTMLTextAreaElement>) {
    if (edit?.saving) return;
    if (event.key === "Escape") {
      event.preventDefault();
      editActions.current?.cancel();
    } else if (event.key === "Enter" && (event.ctrlKey || event.metaKey)) {
      event.preventDefault();
      editActions.current?.save();
    }
  }

  return (
    <div className="rm-skills-editor rm-screen-only" data-testid="cv-skills-editor">
      <label className="rm-skills-editor__label" htmlFor={`${baseId}-input`}>
        {t("resumatch.preview.skillsEdit.label")}
      </label>
      <p id={noteId} className="rm-skills-editor__note">
        {t("resumatch.preview.skillsEdit.note")}
      </p>
      <textarea
        ref={inputRef}
        id={`${baseId}-input`}
        className="rm-skills-editor__input"
        value={edit.draft}
        rows={8}
        readOnly={edit.saving}
        aria-invalid={over || edit.error === "empty" ? true : undefined}
        aria-describedby={[noteId, countId, edit.error ? errorId : null].filter(Boolean).join(" ")}
        onChange={(event) => {
          const draft = event.target.value;
          setEdit((current) => (current ? { ...current, draft, error: null } : current));
        }}
        onKeyDown={onKeyDown}
        data-testid="cv-skills-editor-input"
      />
      <div className="rm-skills-editor__footer">
        <span
          id={countId}
          className={over ? "rm-skills-editor__count is-over" : "rm-skills-editor__count"}
          data-testid="cv-skills-editor-count"
        >
          {t("resumatch.preview.skillsEdit.count", { count: length, max: MAX_SKILLS_PARAGRAPH_LENGTH })}
        </span>
        <span className="rm-skills-editor__keys">{t("resumatch.preview.skillsEdit.keys")}</span>
        <span className="rm-skills-editor__actions">
          <Button
            variant="ghost"
            disabled={edit.saving}
            onClick={() => editActions.current?.cancel()}
            data-testid="cv-skills-editor-cancel"
          >
            {t("resumatch.preview.skillsEdit.cancel")}
          </Button>
          <Button
            disabled={edit.saving || over}
            onClick={() => editActions.current?.save()}
            data-testid="cv-skills-editor-save"
          >
            {edit.saving ? (
              <>
                <Spinner />
                {t("resumatch.preview.skillsEdit.saving")}
              </>
            ) : (
              t("resumatch.preview.skillsEdit.save")
            )}
          </Button>
        </span>
      </div>
      {edit.error ? (
        <p id={errorId} role="alert" className="rm-skills-editor__error" data-testid="cv-skills-editor-error">
          {t(`resumatch.preview.skillsEdit.error.${edit.error}`)}
        </p>
      ) : null}
    </div>
  );
}
