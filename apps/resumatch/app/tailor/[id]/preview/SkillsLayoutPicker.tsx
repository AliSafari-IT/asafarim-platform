"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useTranslation } from "@asafarim/shared-i18n";
import { SKILLS_LAYOUTS, type SkillsLayout } from "../../../../lib/tailoring/skillsLayout";

type Status =
  | { kind: "idle" }
  | { kind: "busy"; writing: boolean }
  | { kind: "removed"; count: number }
  | { kind: "error"; code: string };

/**
 * "Skills layout" on the CV preview: grouped by category, compact columns,
 * or a written, fact-checked paragraph. Saved on this CV only
 * (PATCH /api/tailor/[id]), and the PDF and DOCX follow it. Choosing the
 * paragraph the first time asks the AI to write one
 * (POST /api/tailor/[id]/skills-paragraph); the CV switches only once a
 * paragraph passed the check, so a failure never leaves an empty section.
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
  const busy = status.kind === "busy";

  async function writeParagraph(): Promise<boolean> {
    setStatus({ kind: "busy", writing: true });
    const response = await fetch(`/api/tailor/${id}/skills-paragraph`, { method: "POST" }).catch(() => null);
    if (!response?.ok) {
      const body = (await response?.json().catch(() => null)) as { code?: string } | null;
      setStatus({ kind: "error", code: body?.code ?? "failed" });
      return false;
    }
    // The body only carries feedback; a failed read still means it saved.
    const body = (await response.json().catch(() => null)) as { removedSentences?: number } | null;
    setStatus(body?.removedSentences ? { kind: "removed", count: body.removedSentences } : { kind: "idle" });
    return true;
  }

  async function change(next: SkillsLayout) {
    const previous = value;
    setValue(next);
    let ok: boolean;
    if (next === "paragraph" && !hasParagraph) {
      ok = await writeParagraph();
    } else {
      setStatus({ kind: "busy", writing: false });
      const response = await fetch(`/api/tailor/${id}`, {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ skillsLayout: next }),
      }).catch(() => null);
      ok = Boolean(response?.ok);
      setStatus(ok ? { kind: "idle" } : { kind: "error", code: "save" });
    }
    if (ok) router.refresh();
    else setValue(previous);
  }

  async function rewrite() {
    if (await writeParagraph()) router.refresh();
  }

  return (
    <div className="rm-preview-photo rm-skills-layout">
      <label className="rm-skills-layout__label">
        {t("resumatch.preview.skillsLayout.label")}{" "}
        <select
          className="ui-select rm-skills-layout__select"
          value={value}
          disabled={busy}
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
          type="button"
          className="ui-btn ui-btn--ghost ui-btn--sm"
          disabled={busy}
          onClick={() => void rewrite()}
          data-testid="cv-skills-rewrite"
        >
          {t("resumatch.preview.skillsLayout.rewrite")}
        </button>
      ) : null}
      <span className="rm-preview-photo__hint" aria-live="polite">
        {status.kind === "busy" && status.writing
          ? t("resumatch.preview.skillsLayout.writing")
          : status.kind === "removed"
            ? t("resumatch.preview.skillsLayout.removed", { count: status.count })
            : status.kind === "error"
              ? null
              : t(`resumatch.preview.skillsLayout.hint.${value}`)}
      </span>
      {status.kind === "error" ? (
        <span role="alert" className="rm-photo-toggle__error">
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
      ) : null}
    </div>
  );
}
