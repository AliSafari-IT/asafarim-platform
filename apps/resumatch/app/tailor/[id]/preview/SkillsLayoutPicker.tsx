"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { useTranslation } from "@asafarim/shared-i18n";
import { SKILLS_LAYOUTS, type SkillsLayout } from "../../../../lib/tailoring/skillsLayout";
import { Spinner, useSkillsPending } from "../../../../components/tailoring/SkillsPending";

/** What a failed attempt was, so "Try again" can repeat exactly that. */
type Attempt = { kind: "layout"; layout: SkillsLayout } | { kind: "rewrite" };

type Status =
  | { kind: "idle" }
  | { kind: "busy"; writing: boolean }
  | { kind: "done"; removed: number }
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
 */
export function SkillsLayoutPicker({
  id,
  layout,
  hasParagraph,
}: {
  id: string;
  layout: SkillsLayout;
  hasParagraph: boolean;
}) {
  const { t } = useTranslation();
  const router = useRouter();
  const [value, setValue] = useState<SkillsLayout>(layout);
  const [status, setStatus] = useState<Status>({ kind: "idle" });
  const [refreshing, startRefresh] = useTransition();
  const [slow, setSlow] = useState(false);
  const { setPending } = useSkillsPending();
  const selectRef = useRef<HTMLSelectElement>(null);
  const rewriteRef = useRef<HTMLButtonElement>(null);
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

  useEffect(() => {
    if (busy || !focusBack.current) return;
    const target = focusBack.current.isConnected ? focusBack.current : selectRef.current;
    focusBack.current = null;
    if (document.activeElement === document.body || document.activeElement === null) target?.focus();
  }, [busy]);

  function begin(isWriting: boolean) {
    setIsWrite(isWriting);
    const active = document.activeElement;
    focusBack.current = active === selectRef.current || active === rewriteRef.current ? (active as HTMLElement) : null;
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

  function retry(attempt: Attempt) {
    if (attempt.kind === "rewrite") void rewrite();
    else void change(attempt.layout);
  }

  // One polite live region, always rendered, so every change is announced.
  let message: string;
  if (writing) {
    message = t(slow ? "resumatch.preview.skillsLayout.writingSlow" : "resumatch.preview.skillsLayout.writing");
  } else if (status.kind === "done") {
    message = status.removed
      ? t("resumatch.preview.skillsLayout.removed", { count: status.removed })
      : t("resumatch.preview.skillsLayout.done");
  } else if (status.kind === "error") {
    message = "";
  } else {
    message = t(`resumatch.preview.skillsLayout.hint.${value}`);
  }

  // "Try again" makes sense when writing or saving failed, not when the
  // budget is spent or the CV has no skills to describe.
  const canRetry = status.kind === "error" && status.code !== "budget" && status.code !== "no_skills";

  return (
    <div className="rm-preview-photo rm-skills-layout" data-busy={busy ? "true" : undefined}>
      <label className="rm-skills-layout__label">
        {t("resumatch.preview.skillsLayout.label")}{" "}
        <select
          ref={selectRef}
          className="ui-select rm-skills-layout__select"
          value={value}
          disabled={busy}
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
          ref={rewriteRef}
          type="button"
          className="ui-btn ui-btn--ghost rm-skills-layout__rewrite"
          disabled={busy}
          onClick={() => void rewrite()}
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
      <span
        id="cv-skills-status"
        className={writing ? "rm-preview-photo__hint rm-skills-layout__status is-writing" : "rm-preview-photo__hint rm-skills-layout__status"}
        role="status"
        data-testid="cv-skills-status"
      >
        {writing ? <Spinner /> : null}
        <span>
          {message}
          {writing ? <span className="rm-skills-layout__wait"> {t("resumatch.preview.skillsLayout.downloadsWait")}</span> : null}
        </span>
      </span>
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
    </div>
  );
}
