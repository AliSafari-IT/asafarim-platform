"use client";

import { useCallback, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { useTranslation } from "@asafarim/shared-i18n";
import { Alert, Badge, Button, Card } from "@asafarim/ui";
import { MAX_DOCUMENT_BYTES } from "../../lib/documents/fileType";
import { ShowcaseNotice } from "../components/ShowcaseNotice";
import { AlertCard } from "./AlertCard";

export interface DocumentRow {
  id: string;
  originalFilename: string;
  byteSize: number;
  status: string;
  reasonCode: string | null;
  explanation: string | null;
  /** Whether this document was quarantined because the scanner was
   *  unavailable specifically — never true for a real malware verdict. */
  canRetryScan: boolean;
  uploadedAt: string;
  retainUntil: string | null;
}

const STATUS_TONE: Record<string, "success" | "warning" | "danger" | "neutral"> = {
  EXTRACTED: "success",
  CLEAN: "success",
  QUARANTINED: "danger",
  FAILED: "danger",
  UPLOADED: "neutral",
  SCANNING: "neutral",
  EXTRACTING: "neutral",
};

/** Statuses with their own label (resumatch.upload.status.<STATUS>). */
const LABELLED_STATUSES = new Set(Object.keys(STATUS_TONE));

/** Reason codes lib/documents/pipeline.ts#explainReasonCode knows. Those
 *  are explained in the UI language (resumatch.docReason.<CODE>); anything
 *  else falls back to the server's own English explanation. */
const EXPLAINED_REASONS = new Set([
  "MALWARE_DETECTED",
  "SCANNER_UNAVAILABLE",
  "UNSUPPORTED_TYPE",
  "DECLARED_TYPE_MISMATCH",
  "FILE_TOO_LARGE",
  "EMPTY_FILE",
  "ENCRYPTED_DOCUMENT",
  "NO_TEXT_LAYER",
  "LAYOUT_UNRELIABLE",
  "EXTRACTION_IN_PROGRESS",
  "EXTRACTION_ERROR",
  "BYTES_MISSING",
]);

function formatSize(bytes: number): string {
  return bytes < 1024 * 1024
    ? `${Math.max(1, Math.round(bytes / 1024))} KB`
    : `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export function UploadPanel({ documents }: { documents: DocumentRow[] }) {
  const router = useRouter();
  const { t } = useTranslation();
  const explain = useCallback(
    (reasonCode: string | null | undefined, fallback: string | null | undefined) =>
      reasonCode && EXPLAINED_REASONS.has(reasonCode) ? t(`resumatch.docReason.${reasonCode}`) : fallback,
    [t],
  );
  const inputRef = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [dragActive, setDragActive] = useState(false);
  const [message, setMessage] = useState<{ tone: "info" | "warning" | "error"; text: string } | null>(
    null,
  );
  const maxSizeLabel = `${Math.round(MAX_DOCUMENT_BYTES / (1024 * 1024))} MB`;

  const upload = useCallback(
    async (file: File) => {
      // Checked here for a fast, clear message; the server checks again on
      // the real byte length, because nothing from the browser is trusted.
      if (file.size > MAX_DOCUMENT_BYTES) {
        setMessage({ tone: "error", text: t("resumatch.upload.msg.tooLarge", { max: maxSizeLabel }) });
        return;
      }

      setBusy(true);
      setMessage(null);
      try {
        const form = new FormData();
        form.set("file", file);
        const response = await fetch("/api/documents", { method: "POST", body: form });
        const body = (await response.json()) as {
          error?: string;
          explanation?: string;
          reasonCode?: string | null;
          status?: string;
        };

        if (!response.ok) {
          setMessage({ tone: "error", text: body.error ?? t("resumatch.upload.msg.uploadFailed") });
          return;
        }
        if (body.status !== "EXTRACTED") {
          setMessage({
            tone: "warning",
            text: explain(body.reasonCode, body.explanation) ?? t("resumatch.upload.msg.uploadedUnread"),
          });
        } else {
          setMessage({ tone: "info", text: t("resumatch.upload.msg.read") });
        }
        router.refresh();
      } catch {
        setMessage({ tone: "error", text: t("resumatch.upload.msg.uploadNetwork") });
      } finally {
        setBusy(false);
        if (inputRef.current) inputRef.current.value = "";
      }
    },
    [router, t, explain, maxSizeLabel],
  );

  const rescan = useCallback(
    async (documentId: string) => {
      setBusy(true);
      setMessage(null);
      try {
        const response = await fetch(`/api/documents/${documentId}/rescan`, { method: "POST" });
        const body = (await response.json()) as {
          error?: string;
          explanation?: string;
          reasonCode?: string | null;
          status?: string;
        };
        if (!response.ok) {
          setMessage({
            tone: "error",
            text:
              explain(body.error, body.explanation) ??
              (body.error === "NOT_ELIGIBLE_FOR_RESCAN"
                ? t("resumatch.upload.msg.notEligible")
                : t("resumatch.upload.msg.rescanFailed")),
          });
          return;
        }
        if (body.status !== "EXTRACTED") {
          setMessage({
            tone: "warning",
            text: explain(body.reasonCode, body.explanation) ?? t("resumatch.upload.msg.rescannedUnread"),
          });
        } else {
          setMessage({ tone: "info", text: t("resumatch.upload.msg.read") });
        }
        router.refresh();
      } catch {
        setMessage({ tone: "error", text: t("resumatch.upload.msg.rescanNetwork") });
      } finally {
        setBusy(false);
      }
    },
    [router, t, explain],
  );

  const remove = useCallback(
    async (documentId: string) => {
      setBusy(true);
      setMessage(null);
      try {
        const response = await fetch(`/api/documents/${documentId}`, { method: "DELETE" });
        if (!response.ok) {
          // The server refuses to drop the row unless it has confirmed the
          // stored bytes are gone, so a failure here means the file is still
          // there. Saying so beats a silent refresh that looks like success.
          setMessage({
            tone: "error",
            text: t("resumatch.upload.msg.deleteFailed"),
          });
          return;
        }
        router.refresh();
      } catch {
        setMessage({ tone: "error", text: t("resumatch.upload.msg.deleteNetwork") });
      } finally {
        setBusy(false);
      }
    },
    [router, t],
  );

  return (
    <Card title={t("resumatch.upload.title")}>
      <p style={{ color: "var(--muted)" }}>
        {t("resumatch.upload.intro", { max: maxSizeLabel })}
      </p>
      <p style={{ color: "var(--muted)", fontSize: "0.85rem" }}>
        {t("resumatch.upload.noCv")}
      </p>

      <div style={{ margin: "1rem 0" }}>
        <ShowcaseNotice variant="compact" />
      </div>

      {/* A <label> around the file input, not a div with role="button":
          the (invisible, full-size) input is the one real control, so it
          takes the click and the keyboard focus natively and gets its
          accessible name from this label's text. The old role="button"
          wrapper nested a second interactive control around it and left
          the input itself unnamed. */}
      <label
        className={`jm-dropzone${dragActive ? " jm-dropzone--active" : ""}${busy ? " jm-dropzone--busy" : ""}`}
        onDragOver={(event) => {
          event.preventDefault();
          if (!busy) setDragActive(true);
        }}
        onDragLeave={() => setDragActive(false)}
        onDrop={(event) => {
          event.preventDefault();
          setDragActive(false);
          const file = event.dataTransfer.files?.[0];
          if (file && !busy) void upload(file);
        }}
      >
        <span className="jm-dropzone__glow" aria-hidden="true" />
        <svg
          className="jm-dropzone__icon"
          width="44"
          height="44"
          viewBox="0 0 24 24"
          fill="none"
          aria-hidden="true"
        >
          <path
            d="M7 18a4.5 4.5 0 0 1-.6-8.96A5.5 5.5 0 0 1 17.2 8.06 4 4 0 0 1 17 16H7Z"
            stroke="currentColor"
            strokeWidth="1.5"
            strokeLinejoin="round"
          />
          <path
            d="M12 11v6.5M12 11l-2.5 2.5M12 11l2.5 2.5"
            stroke="currentColor"
            strokeWidth="1.5"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>
        <span className="jm-dropzone__title">
          {dragActive ? t("resumatch.upload.drop") : t("resumatch.upload.cta")}
        </span>
        <span className="jm-dropzone__subtitle">
          {t("resumatch.upload.formats", { max: maxSizeLabel })}
        </span>
        <input
          ref={inputRef}
          type="file"
          accept=".pdf,.docx,.txt,application/pdf,application/vnd.openxmlformats-officedocument.wordprocessingml.document,text/plain"
          disabled={busy}
          onChange={(event) => {
            const file = event.target.files?.[0];
            if (file) void upload(file);
          }}
          className="jm-dropzone__input"
        />
      </label>

      {busy ? <p className="jm-mono">{t("resumatch.upload.working")}</p> : null}
      {message ? <Alert tone={message.tone}>{message.text}</Alert> : null}

      {documents.length > 0 ? (
        <ul className="jm-list" style={{ marginTop: "1rem" }}>
          {documents.map((document) => (
            <li key={document.id}>
              <div style={{ display: "flex", alignItems: "center", gap: "0.5rem", flexWrap: "wrap" }}>
                <strong>{document.originalFilename}</strong>
                {/* A document can be read *and* carry a caveat. Showing a
                    plain green "read" for a CV whose layout defeated the
                    parser would tell the candidate everything went fine
                    while most of their form sits empty. */}
                <Badge
                  tone={
                    document.status === "EXTRACTED" && document.reasonCode
                      ? "warning"
                      : (STATUS_TONE[document.status] ?? "neutral")
                  }
                >
                  {document.status === "EXTRACTED" && document.reasonCode
                    ? t("resumatch.upload.status.partlyRead")
                    : LABELLED_STATUSES.has(document.status)
                      ? t(`resumatch.upload.status.${document.status}`)
                      : document.status.toLowerCase()}
                </Badge>
                <span className="jm-mono" style={{ color: "var(--muted)", fontSize: "0.75rem" }}>
                  {formatSize(document.byteSize)}
                </span>
                {document.status !== "QUARANTINED" ? (
                  <a href={`/api/documents/${document.id}/file`} className="jm-mono">
                    {t("resumatch.upload.download")}
                  </a>
                ) : null}
                {document.canRetryScan ? (
                  <Button size="sm" variant="ghost" disabled={busy} onClick={() => void rescan(document.id)}>
                    {t("resumatch.upload.retryScan")}
                  </Button>
                ) : null}
                <Button size="sm" variant="ghost" disabled={busy} onClick={() => void remove(document.id)}>
                  {t("resumatch.upload.delete")}
                </Button>
              </div>
              {document.explanation ? (
                <AlertCard
                  tone={document.reasonCode === "MALWARE_DETECTED" ? "critical" : "warning"}
                  title={
                    document.reasonCode === "MALWARE_DETECTED"
                      ? t("resumatch.upload.alert.flagged")
                      : document.status === "QUARANTINED"
                        ? t("resumatch.upload.alert.quarantined")
                        : t("resumatch.upload.alert.needsLook")
                  }
                  technicalDetail={document.reasonCode}
                >
                  {explain(document.reasonCode, document.explanation)}
                </AlertCard>
              ) : null}
              {document.retainUntil ? (
                <p className="jm-mono" style={{ color: "var(--muted)", fontSize: "0.75rem", margin: "0.25rem 0 0" }}>
                  {t("resumatch.upload.keptUntil", { date: document.retainUntil.slice(0, 10) })}
                </p>
              ) : null}
            </li>
          ))}
        </ul>
      ) : null}
    </Card>
  );
}
