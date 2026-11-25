"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { useTranslation } from "@asafarim/shared-i18n";
import { ConfirmDialog } from "@asafarim/ui";
import { SKILLS_LAYOUTS, type SkillsLayout } from "../../../../lib/tailoring/skillsLayout";
import { handEditProblem } from "../../../../lib/tailoring/ai/skillsParagraph/handEditRules";
import type { HandEditAdvice } from "../../../../lib/tailoring/ai/skillsParagraph/advice";
import { Spinner, useSkillsPending } from "../../../../components/tailoring/SkillsPending";

/** What a failed attempt was, so "Try again" can repeat exactly that. */
type Attempt = { kind: "layout"; layout: SkillsLayout } | { kind: "rewrite" };

type Status =
  | { kind: "idle" }
  | { kind: "busy"; writing: boolean }
  | { kind: "done"; removed: number }
  | { kind: "saved" }
  | { kind: "error"; code: string; retry: Attempt };

/** After this long, the status says that a slow answer is normal. */
const SLOW_AFTER_MS = 12_000;

/**
 * "Skills layout" on the CV preview: grouped by category, compact columns,
 * or a written, fact-checked paragraph. Saved on this CV only
 * (PATCH /api/tailor/[id]), and the PDF and DOCX follow it. Choosing the
 * paragraph the first time asks the AI to write one
 * (POST /api/tailor/[id]/skills-paragraph); the CV switches only once a
 * paragraph passed the check, so a failure never leaves an empty section.
 *
 * Writing takes a while, so while it runs (and until the refreshed CV is
 * on screen) the picker shows a spinner and a live status, the CV's Skills
 * section shows a "writing" overlay, and the downloads wait
 * (components/tailoring/SkillsPending.tsx).
 *
 * "Edit paragraph" opens the paragraph for small changes by hand, in place
 * in the CV's Skills section (SkillsParagraphEditor). Saving stores the
 * candidate's own text on this CV (PUT /api/tailor/[id]/skills-paragraph),
 * with no AI call; the PDF and DOCX use it. Their words are not
 * fact-checked away, but the sentences the AI check would not have kept
 * are listed as "worth a second look" (`advice`, computed by the page).
 * Rewrite asks before it replaces a hand-edited paragraph.
 */
export function SkillsLayoutPicker({
  id,
  layout,
  paragraph,
  edited,
  advice,
}: {
  id: string;
  layout: SkillsLayout;
  /** The CV's current paragraph, AI-written or hand-edited; null before one is written. */
  paragraph: string | null;
  /** Whether the candidate edited the paragraph by hand. */
  edited: boolean;
  /** Sentences of a hand-edited paragraph worth a second look. */
  advice: HandEditAdvice[];
}) {
  const hasParagraph = Boolean(paragraph?.trim());
  const { t } = useTranslation();
  const router = useRouter();
  const [value, setValue] = useState<SkillsLayout>(layout);
  const [status, setStatus] = useState<Status>({ kind: "idle" });
  const [refreshing, startRefresh] = useTransition();
  const [slow, setSlow] = useState(false);
  const { setPending, edit, setEdit, editActions } = useSkillsPending();
  const selectRef = useRef<HTMLSelectElement>(null);
  const rewriteRef = useRef<HTMLButtonElement>(null);
  const editRef = useRef<HTMLButtonElement>(null);
  const [confirmRewrite, setConfirmRewrite] = useState(false);
  // A saved edit keeps the editor open (saving) until the refreshed CV is
  // on screen, so the old paragraph never flashes back in between.
  const closeEditorAfterRefresh = useRef(false);
  const editing = edit !== null;
  // Which control had focus when the work started: disabling it drops
  // focus to <body>, so it gets focus back once the work is done.
  const focusBack = useRef<HTMLElement | null>(null);
  // Whether the running work (request, then refresh) is an AI write.
  const [isWrite, setIsWrite] = useState(false);

  const requesting = status.kind === "busy";
  const busy = requesting || refreshing;
  const writing = busy && isWrite;

  useEffect(() => {
    setPending(busy ? (isWrite ? "writing" : "saving") : null);
  }, [busy, isWrite, setPending]);
  useEffect(() => () => setPending(null), [setPending]);

  useEffect(() => {
    if (!writing) {
      setSlow(false);
      return;
    }
    const timer = window.setTimeout(() => setSlow(true), SLOW_AFTER_MS);
    return () => window.clearTimeout(timer);
  }, [writing]);

  // Close the editor once its saved text is on screen, and give focus
  // back to "Edit paragraph".
  useEffect(() => {
    if (refreshing || !closeEditorAfterRefresh.current) return;
    closeEditorAfterRefresh.current = false;
    setEdit(null);
    setIsWrite(false);
    focusBack.current = editRef.current;
  }, [refreshing, setEdit]);
  // Leaving the page with the editor open must not leave it open on the next CV.
  useEffect(() => () => setEdit(null), [setEdit]);

  useEffect(() => {
    if (busy || editing || !focusBack.current) return;
    const target = focusBack.current.isConnected ? focusBack.current : selectRef.current;
    focusBack.current = null;
    if (document.activeElement === document.body || document.activeElement === null) target?.focus();
  }, [busy, editing]);

  function begin(isWriting: boolean) {
    setIsWrite(isWriting);
    const active = document.activeElement;
    focusBack.current =
      active === selectRef.current || active === rewriteRef.current || active === editRef.current
        ? (active as HTMLElement)
        : null;
    setStatus({ kind: "busy", writing: isWriting });
  }

  /** Show the saved CV, keeping the pending state until it is on screen. */
  function refresh() {
    startRefresh(() => router.refresh());
  }

  async function writeParagraph(retry: Attempt): Promise<boolean> {
    begin(true);
    const response = await fetch(`/api/tailor/${id}/skills-paragraph`, { method: "POST" }).catch(() => null);
    if (!response?.ok) {
      const body = (await response?.json().catch(() => null)) as { code?: string } | null;
      setStatus({ kind: "error", code: body?.code ?? "failed", retry });
      return false;
    }
    // The body only carries feedback; a failed read still means it saved.
    const body = (await response.json().catch(() => null)) as { removedSentences?: number } | null;
    setStatus({ kind: "done", removed: body?.removedSentences ?? 0 });
    return true;
  }

  async function change(next: SkillsLayout) {
    const previous = value;
    setValue(next);
    let ok: boolean;
    if (next === "paragraph" && !hasParagraph) {
      ok = await writeParagraph({ kind: "layout", layout: next });
    } else {
      begin(false);
      const response = await fetch(`/api/tailor/${id}`, {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ skillsLayout: next }),
      }).catch(() => null);
      ok = Boolean(response?.ok);
      setStatus(ok ? { kind: "idle" } : { kind: "error", code: "save", retry: { kind: "layout", layout: next } });
    }
    if (ok) refresh();
    else setValue(previous);
  }

  async function rewrite() {
    if (await writeParagraph({ kind: "rewrite" })) refresh();
  }

  /** Rewrite replaces a hand edit, so it asks first. */
  function requestRewrite() {
    if (edited) setConfirmRewrite(true);
    else void rewrite();
  }

  function startEdit() {
    setStatus({ kind: "idle" });
    setEdit({ draft: paragraph ?? "", saving: false, error: null });
  }

  function cancelEdit() {
    setEdit(null);
    focusBack.current = editRef.current;
  }

  async function saveEdit(draft: string) {
    const problem = handEditProblem(draft);
    if (problem) {
      setEdit((current) => (current ? { ...current, error: problem } : current));
      return;
    }
    setEdit((current) => (current ? { ...current, saving: true, error: null } : current));
    const response = await fetch(`/api/tailor/${id}/skills-paragraph`, {
      method: "PUT",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ paragraph: draft }),
    }).catch(() => null);
    if (!response?.ok) {
      const body = (await response?.json().catch(() => null)) as { code?: string } | null;
      const error = body?.code === "empty" || body?.code === "too_long" ? body.code : "save";
      setEdit((current) => (current ? { ...current, saving: false, error } : current));
      return;
    }
    setValue("paragraph");
    setStatus({ kind: "saved" });
    closeEditorAfterRefresh.current = true;
    refresh();
  }

  // The editor in the CV calls Save and Cancel through the shared context.
  useEffect(() => {
    editActions.current = {
      save: () => {
        if (edit && !edit.saving) void saveEdit(edit.draft);
      },
      cancel: cancelEdit,
    };
  });

  function retry(attempt: Attempt) {
    if (attempt.kind === "rewrite") void rewrite();
    else void change(attempt.layout);
  }

  // One polite live region, always rendered, so every change is announced.
  let message: string;
  if (editing) {
    message = t(
      edit.saving ? "resumatch.preview.skillsEdit.savingStatus" : "resumatch.preview.skillsEdit.editing",
    );
  } else if (writing) {
    message = t(slow ? "resumatch.preview.skillsLayout.writingSlow" : "resumatch.preview.skillsLayout.writing");
  } else if (status.kind === "done") {
    message = status.removed
      ? t("resumatch.preview.skillsLayout.removed", { count: status.removed })
      : t("resumatch.preview.skillsLayout.done");
  } else if (status.kind === "saved") {
    message = t("resumatch.preview.skillsEdit.saved");
  } else if (status.kind === "error") {
    message = "";
  } else if (value === "paragraph" && edited) {
    message = t("resumatch.preview.skillsEdit.hint");
  } else {
    message = t(`resumatch.preview.skillsLayout.hint.${value}`);
  }

  const showAdvice = value === "paragraph" && edited && advice.length > 0 && !editing && !busy;

  // "Try again" makes sense when writing or saving failed, not when the
  // budget is spent or the CV has no skills to describe.
  const canRetry = status.kind === "error" && status.code !== "budget" && status.code !== "no_skills";

  return (
    <div className="rm-appearance__setting rm-skills-layout" data-busy={busy ? "true" : undefined}>
      <div className="rm-appearance__control rm-skills-layout__controls">
        <label className="rm-skills-layout__label">
          {t("resumatch.preview.skillsLayout.label")}{" "}
          <select
            ref={selectRef}
            className="ui-select rm-skills-layout__select"
            value={value}
            disabled={busy || editing}
            aria-describedby="cv-skills-status"
            onChange={(event) => void change(event.target.value as SkillsLayout)}
            data-testid="cv-skills-layout"
          >
            {SKILLS_LAYOUTS.map((option) => (
              <option key={option} value={option}>
                {t(`resumatch.preview.skillsLayout.${option}`)}
              </option>
            ))}
          </select>
        </label>
        {value === "paragraph" && hasParagraph ? (
          <button
            ref={editRef}
            type="button"
            className="ui-btn ui-btn--ghost rm-skills-layout__rewrite"
            disabled={busy || editing}
            onClick={startEdit}
            data-testid="cv-skills-edit"
          >
            {t("resumatch.preview.skillsEdit.edit")}
          </button>
        ) : null}
        {value === "paragraph" && hasParagraph ? (
          <button
            ref={rewriteRef}
            type="button"
            className="ui-btn ui-btn--ghost rm-skills-layout__rewrite"
            disabled={busy || editing}
            onClick={requestRewrite}
            data-testid="cv-skills-rewrite"
          >
            {writing ? (
              <>
                <Spinner />
                {t("resumatch.preview.skillsLayout.rewriting")}
              </>
            ) : (
              t("resumatch.preview.skillsLayout.rewrite")
            )}
          </button>
        ) : null}
      </div>
      <span
        id="cv-skills-status"
        className={writing ? "rm-appearance__hint rm-skills-layout__status is-writing" : "rm-appearance__hint rm-skills-layout__status"}
        role="status"
        data-testid="cv-skills-status"
      >
        {writing ? <Spinner /> : null}
        <span>
          {message}
          {writing ? <span className="rm-skills-layout__wait"> {t("resumatch.preview.skillsLayout.downloadsWait")}</span> : null}
        </span>
      </span>
      {showAdvice ? (
        <div className="rm-skills-advice" data-testid="cv-skills-advice">
          <p className="rm-skills-advice__title">{t("resumatch.preview.skillsEdit.advice.title")}</p>
          <p className="rm-skills-advice__intro">{t("resumatch.preview.skillsEdit.advice.intro")}</p>
          <ul className="rm-skills-advice__list">
            {advice.map((item, index) => (
              <li key={index}>
                <q>{item.sentence}</q>
                <span className="rm-skills-advice__why">
                  {item.concerns.map((concern) => t(`resumatch.preview.skillsEdit.advice.${concern}`)).join(" · ")}
                </span>
              </li>
            ))}
          </ul>
        </div>
      ) : null}
      {status.kind === "error" ? (
        <div role="alert" className="rm-skills-layout__error" data-testid="cv-skills-error">
          <span>
            {t(
              status.code === "budget"
                ? "resumatch.preview.skillsLayout.error.budget"
                : status.code === "nothing_left"
                  ? "resumatch.preview.skillsLayout.error.nothingLeft"
                  : status.code === "save"
                    ? "resumatch.preview.skillsLayout.error.save"
                    : "resumatch.preview.skillsLayout.error.failed",
            )}
          </span>
          {canRetry ? (
            <button
              type="button"
              className="ui-btn ui-btn--ghost"
              onClick={() => retry(status.retry)}
              data-testid="cv-skills-retry"
            >
              {t("resumatch.preview.skillsLayout.retry")}
            </button>
          ) : null}
        </div>
      ) : null}
      <ConfirmDialog
        open={confirmRewrite}
        title={t("resumatch.preview.skillsEdit.confirm.title")}
        message={t("resumatch.preview.skillsEdit.confirm.message")}
        confirmLabel={t("resumatch.preview.skillsEdit.confirm.confirm")}
        cancelLabel={t("resumatch.preview.skillsEdit.confirm.cancel")}
        onConfirm={() => {
          setConfirmRewrite(false);
          void rewrite();
        }}
        onCancel={() => {
          setConfirmRewrite(false);
          rewriteRef.current?.focus();
        }}
      />
    </div>
  );
}
