"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useTranslation } from "@asafarim/shared-i18n";

/**
 * Ties a tailored resume to the application tracker (#432) — POSTs
 * /api/applications with this resume's job and id, so the candidate can
 * follow up on it later without retyping anything.
 *
 * When the CV has a cover letter, saving also makes the PDFs of both
 * (send-application.md, "Saved with its documents"), so the card in the
 * tracker offers "Send application" straight away. The application is
 * saved first and stays saved whatever happens to the PDFs: if they can't
 * be made now, the composer makes them when the candidate opens it.
 */
export function SaveApplicationButton({
  targetJobId,
  tailoredResumeId,
  hasCoverLetter,
  savedApplicationId = null,
}: {
  targetJobId: string;
  tailoredResumeId: string;
  hasCoverLetter: boolean;
  /** The application this CV is already saved as, if any. */
  savedApplicationId?: string | null;
}) {
  const { t } = useTranslation();
  const router = useRouter();
  const [state, setState] = useState<"idle" | "saving" | "pdfs" | "saved" | "error">(savedApplicationId ? "saved" : "idle");
  /** Both PDFs were just made: say it is ready to send. */
  const [ready, setReady] = useState(false);

  async function save() {
    setState("saving");
    try {
      const res = await fetch("/api/applications", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ targetJobId, tailoredResumeId }),
      });
      if (!res.ok) return setState("error");
    } catch {
      return setState("error");
    }

    if (hasCoverLetter) {
      setState("pdfs");
      try {
        const res = await fetch(`/api/tailor/${encodeURIComponent(tailoredResumeId)}/pdfs`, { method: "POST" });
        setReady(res.ok);
      } catch {
        // Saved anyway; the composer makes the PDFs when it opens.
      }
    }
    setState("saved");
    // The toolbar's "Send application" now has an application (and PDFs).
    router.refresh();
  }

  // A small status line, apart from the action buttons: saved (with a
  // text link to the tracker), saving, or not saved yet (with the action).
  const saved = state === "saved" || state === "pdfs";
  return (
    <div className="rm-preview-status" data-testid="save-application-status">
      <span className="rm-preview-status__text" role="status" aria-live="polite">
        {saved ? (
          <>
            {state === "saved" ? (
              <span className="rm-preview-status__check" aria-hidden="true">
                ✓
              </span>
            ) : null}
            {state === "pdfs"
              ? t("resumatch.preview.savedApplicationPreparing")
              : ready
                ? t("resumatch.preview.savedApplicationReady")
                : t("resumatch.preview.savedApplication")}
          </>
        ) : state === "error" ? (
          <span className="rm-preview-status__error">{t("resumatch.preview.saveApplicationError")}</span>
        ) : (
          t("resumatch.preview.notSavedApplication")
        )}
      </span>
      {saved ? (
        state === "saved" ? (
          <Link href="/applications" className="rm-preview-link">
            {t("resumatch.preview.viewApplications")}
            <span aria-hidden="true"> →</span>
          </Link>
        ) : null
      ) : (
        <button
          type="button"
          className="rm-preview-link"
          onClick={save}
          disabled={state === "saving"}
          data-testid="save-application"
        >
          {state === "saving" ? t("resumatch.saving") : t("resumatch.preview.saveApplication")}
        </button>
      )}
    </div>
  );
}
