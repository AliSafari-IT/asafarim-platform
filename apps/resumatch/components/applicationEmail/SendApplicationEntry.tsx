"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useTranslation } from "@asafarim/shared-i18n";
import { Button } from "@asafarim/ui";
import type { PdfStatusView } from "../../lib/documentPdfs/describe";

/**
 * "Send application", or what is missing before it can be offered
 * (send-application.md). Shown on the CV and cover-letter pages and on each
 * application card. Opening the composer never changes the status.
 *
 * - no CV: tailor one first (card only);
 * - no cover letter: add one;
 * - no PDFs yet: create them here (server-side, the same layout as the
 *   printed PDF);
 * - both PDFs: Send application.
 */
export function SendApplicationEntry({
  tailoredResumeId,
  applicationId,
  hasCoverLetter,
  pdfs,
  layout = "card",
}: {
  tailoredResumeId: string | null;
  /** Null on the CV pages when the job isn't in the tracker yet. */
  applicationId: string | null;
  hasCoverLetter: boolean;
  pdfs: PdfStatusView | null;
  layout?: "card" | "toolbar";
}) {
  const { t } = useTranslation();
  const router = useRouter();
  const [phase, setPhase] = useState<"idle" | "creating" | "opening">("idle");
  const [error, setError] = useState<string | null>(null);

  async function createPdfs() {
    if (!tailoredResumeId) return;
    setPhase("creating");
    setError(null);
    try {
      const res = await fetch(`/api/tailor/${encodeURIComponent(tailoredResumeId)}/pdfs`, { method: "POST" });
      const data = (await res.json().catch(() => ({}))) as { error?: string };
      if (!res.ok) {
        setError(data.error ?? t("resumatch.send.entry.pdfFailed"));
        setPhase("idle");
        return;
      }
      setPhase("idle");
      router.refresh();
    } catch {
      setError(t("resumatch.send.entry.pdfFailed"));
      setPhase("idle");
    }
  }

  async function open() {
    if (applicationId) {
      setPhase("opening");
      router.push(`/applications/${encodeURIComponent(applicationId)}/send`);
      return;
    }
    if (!tailoredResumeId) return;
    setPhase("opening");
    setError(null);
    try {
      const res = await fetch("/api/applications/ensure", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ tailoredResumeId }),
      });
      const data = (await res.json().catch(() => ({}))) as { applicationId?: string };
      if (!res.ok || !data.applicationId) throw new Error("ensure failed");
      router.push(`/applications/${encodeURIComponent(data.applicationId)}/send`);
    } catch {
      setError(t("resumatch.send.entry.openFailed"));
      setPhase("idle");
    }
  }

  const className = `rm-send-entry rm-send-entry--${layout}`;

  if (!tailoredResumeId) {
    return (
      <p className={className} data-testid="send-entry">
        <span className="rm-send-entry__hint">{t("resumatch.send.entry.needCv")}</span>
      </p>
    );
  }

  if (!hasCoverLetter) {
    return (
      <p className={className} data-testid="send-entry">
        <span className="rm-send-entry__hint">{t("resumatch.send.entry.needLetter")}</span>
        {layout === "card" ? (
          <a href={`/tailor?from=${encodeURIComponent(tailoredResumeId)}&letter=1#tailor-flow`}>{t("resumatch.send.entry.addLetter")}</a>
        ) : null}
      </p>
    );
  }

  if (!pdfs?.ready) {
    const missing = !pdfs?.cv && !pdfs?.letter ? "both" : !pdfs?.cv ? "cv" : "letter";
    return (
      <div className={className} data-testid="send-entry">
        <span className="rm-send-entry__hint" id={`send-entry-hint-${tailoredResumeId}`}>
          {t(`resumatch.send.entry.needPdfs.${missing}`)}
        </span>
        <Button
          variant="secondary"
          size={layout === "card" ? "sm" : "md"}
          onClick={createPdfs}
          disabled={phase !== "idle"}
          aria-describedby={`send-entry-hint-${tailoredResumeId}`}
        >
          {phase === "creating" ? t("resumatch.send.entry.creatingPdfs") : t("resumatch.send.entry.createPdfs")}
        </Button>
        <span className="rm-save-status" role="status" aria-live="polite">
          {phase === "creating" ? t("resumatch.send.entry.creatingPdfsLong") : ""}
        </span>
        {error ? (
          <span className="rm-send-entry__error" role="alert">
            {error}
          </span>
        ) : null}
      </div>
    );
  }

  return (
    <div className={className} data-testid="send-entry">
      <Button variant={layout === "card" ? "secondary" : "primary"} size={layout === "card" ? "sm" : "md"} onClick={open} disabled={phase !== "idle"} data-testid="send-application">
        {phase === "opening" ? t("resumatch.send.entry.opening") : t("resumatch.send.entry.send")}
      </Button>
      {error ? (
        <span className="rm-send-entry__error" role="alert">
          {error}
        </span>
      ) : null}
    </div>
  );
}
