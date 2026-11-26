"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useTranslation } from "@asafarim/shared-i18n";
import { Button } from "@asafarim/ui";
import type { PdfStatusView } from "../../lib/documentPdfs/describe";

/**
 * "Send application" ("Send by email" on application cards, beside "Mark
 * as applied externally"), or what is missing before it can be offered
 * (send-application.md). Shown on the CV and cover-letter pages and on each
 * application card. Opening the composer never changes the status.
 *
 * - no CV: tailor one first (card only);
 * - no cover letter: add one;
 * - otherwise: Send application, always. "Save to applications" already
 *   made the PDFs; any still missing are made when the composer opens.
 *   On application cards, "Create PDFs" beside it is an optional refresh
 *   (server-side, the same layout as the printed PDF); it only adds PDFs
 *   for documents that changed. It is not a download: the PDFs are the
 *   email's attachments. The CV and cover-letter pages (`layout="toolbar"`)
 *   leave it out, because the composer that Send application opens already
 *   makes missing PDFs and offers "Make a new PDF" for out-of-date ones,
 *   and their Download buttons are where files are downloaded.
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
  /** What the last "Create PDFs" did: new files, or nothing to redo. */
  const [refreshed, setRefreshed] = useState<"created" | "current" | null>(null);

  async function createPdfs() {
    if (!tailoredResumeId) return;
    setPhase("creating");
    setError(null);
    setRefreshed(null);
    try {
      const res = await fetch(`/api/tailor/${encodeURIComponent(tailoredResumeId)}/pdfs`, { method: "POST" });
      const data = (await res.json().catch(() => ({}))) as { error?: string; created?: string[] };
      if (!res.ok) {
        setError(data.error ?? t("resumatch.send.entry.pdfFailed"));
        setPhase("idle");
        return;
      }
      setRefreshed(data.created && data.created.length > 0 ? "created" : "current");
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

  // A CV with a cover letter can always be sent: PDFs made when it was saved
  // to applications are attached, and missing ones are made when the
  // composer opens. "Create PDFs" stays as an optional refresh, e.g. after
  // the CV was edited.
  const hintId = `send-entry-hint-${tailoredResumeId}`;
  const stale = Boolean(pdfs?.ready && (pdfs.cv?.current === false || pdfs.letter?.current === false));
  return (
    <div className={className} data-testid="send-entry">
      <Button
        variant={layout === "card" ? "secondary" : "primary"}
        size={layout === "card" ? "sm" : "md"}
        onClick={open}
        disabled={phase !== "idle"}
        data-testid="send-application"
        aria-describedby={pdfs?.ready ? undefined : hintId}
      >
        {phase === "opening" ? t("resumatch.send.entry.opening") : layout === "card" ? t("resumatch.send.entry.sendByEmail") : t("resumatch.send.entry.send")}
      </Button>
      {layout === "card" ? (
        <Button
          variant="ghost"
          size="sm"
          onClick={createPdfs}
          disabled={phase !== "idle"}
          data-testid="create-pdfs"
          aria-describedby={hintId}
        >
          {phase === "creating" ? t("resumatch.send.entry.creatingPdfs") : t("resumatch.send.entry.createPdfs")}
        </Button>
      ) : null}
      <span className={layout === "card" ? "rm-send-entry__hint" : "sr-only"} id={hintId}>
        {!pdfs?.ready ? t("resumatch.send.entry.pdfsOnOpen") : stale ? t("resumatch.send.entry.pdfsStale") : t("resumatch.send.entry.pdfsReady")}
      </span>
      {layout === "card" ? (
        <span className="rm-save-status" role="status" aria-live="polite">
          {phase === "creating" ? t("resumatch.send.entry.creatingPdfsLong") : refreshed ? t(`resumatch.send.entry.refreshed.${refreshed}`) : ""}
        </span>
      ) : null}
      {error ? (
        <span className="rm-send-entry__error" role="alert">
          {error}
        </span>
      ) : null}
    </div>
  );
}
