"use client";

import { useCallback, useRef, useState } from "react";
import { useRouter } from "next/navigation";
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

const STATUS_LABEL: Record<string, string> = {
  EXTRACTED: "read",
  CLEAN: "scanned",
  QUARANTINED: "quarantined",
  FAILED: "could not be read",
  UPLOADED: "uploaded",
  SCANNING: "scanning",
  EXTRACTING: "reading",
};

function formatSize(bytes: number): string {
  return bytes < 1024 * 1024
    ? `${Math.max(1, Math.round(bytes / 1024))} KB`
    : `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export function UploadPanel({ documents }: { documents: DocumentRow[] }) {
  const router = useRouter();
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
        setMessage({ tone: "error", text: "That file is larger than the 10 MB limit." });
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
          status?: string;
        };

        if (!response.ok) {
          setMessage({ tone: "error", text: body.error ?? "That file could not be uploaded." });
          return;
        }
        if (body.status !== "EXTRACTED") {
          setMessage({
            tone: "warning",
            text: body.explanation ?? "That file was uploaded but could not be read.",
          });
        } else {
          setMessage({ tone: "info", text: "Your CV was read. Check the fields below before confirming." });
        }
        router.refresh();
      } catch {
        setMessage({ tone: "error", text: "The upload failed. Check your connection and try again." });
      } finally {
        setBusy(false);
        if (inputRef.current) inputRef.current.value = "";
      }
    },
    [router],
  );

  const rescan = useCallback(
    async (documentId: string) => {
      setBusy(true);
      setMessage(null);
      try {
        const response = await fetch(`/api/documents/${documentId}/rescan`, { method: "POST" });
        const body = (await response.json()) as { error?: string; explanation?: string; status?: string };
        if (!response.ok) {
          setMessage({
            tone: "error",
            text:
              body.explanation ??
              (body.error === "NOT_ELIGIBLE_FOR_RESCAN"
                ? "This file cannot be rescanned."
                : "That file could not be rescanned. Please try again."),
          });
          return;
        }
        if (body.status !== "EXTRACTED") {
          setMessage({
            tone: "warning",
            text: body.explanation ?? "That file was rescanned but could not be read.",
          });
        } else {
          setMessage({ tone: "info", text: "Your CV was read. Check the fields below before confirming." });
        }
        router.refresh();
      } catch {
        setMessage({ tone: "error", text: "The rescan failed. Check your connection and try again." });
      } finally {
        setBusy(false);
      }
    },
    [router],
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
            text: "That file could not be deleted, so it has not been removed. Please try again.",
          });
          return;
        }
        router.refresh();
      } catch {
        setMessage({ tone: "error", text: "That file could not be deleted. Check your connection and try again." });
      } finally {
        setBusy(false);
      }
    },
    [router],
  );

  return (
    <Card title="Your CV">
      <p style={{ opacity: 0.85 }}>
        PDF, Word (.docx), or plain text, up to 10 MB. Your file is scanned before anything reads it,
        stored privately, and never shared with an employer. You can delete it at any time.
      </p>

      <div style={{ margin: "1rem 0" }}>
        <ShowcaseNotice variant="compact" />
      </div>

      <div
        className={`jm-dropzone${dragActive ? " jm-dropzone--active" : ""}${busy ? " jm-dropzone--busy" : ""}`}
        role="button"
        tabIndex={busy ? -1 : 0}
        aria-disabled={busy}
        onClick={() => {
          if (!busy) inputRef.current?.click();
        }}
        onKeyDown={(event) => {
          if (!busy && (event.key === "Enter" || event.key === " ")) {
            event.preventDefault();
            inputRef.current?.click();
          }
        }}
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
        <div className="jm-dropzone__glow" aria-hidden="true" />
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
        <p className="jm-dropzone__title">
          {dragActive ? "Drop to upload" : "Upload Your Resume"}
        </p>
        <p className="jm-dropzone__subtitle">
          PDF, DOCX, or plain text &middot; up to {maxSizeLabel}
        </p>
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
      </div>

      {busy ? <p className="jm-mono">Working…</p> : null}
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
                    ? "partly read"
                    : (STATUS_LABEL[document.status] ?? document.status.toLowerCase())}
                </Badge>
                <span className="jm-mono" style={{ opacity: 0.6, fontSize: "0.75rem" }}>
                  {formatSize(document.byteSize)}
                </span>
                {document.status !== "QUARANTINED" ? (
                  <a href={`/api/documents/${document.id}/file`} className="jm-mono">
                    download
                  </a>
                ) : null}
                {document.canRetryScan ? (
                  <Button size="sm" variant="ghost" disabled={busy} onClick={() => void rescan(document.id)}>
                    retry scan
                  </Button>
                ) : null}
                <Button size="sm" variant="ghost" disabled={busy} onClick={() => void remove(document.id)}>
                  delete
                </Button>
              </div>
              {document.explanation ? (
                <AlertCard
                  tone={document.reasonCode === "MALWARE_DETECTED" ? "critical" : "warning"}
                  title={
                    document.reasonCode === "MALWARE_DETECTED"
                      ? "This file was flagged"
                      : document.status === "QUARANTINED"
                        ? "Quarantined"
                        : "Needs a look"
                  }
                  technicalDetail={document.reasonCode}
                >
                  {document.explanation}
                </AlertCard>
              ) : null}
              {document.retainUntil ? (
                <p className="jm-mono" style={{ opacity: 0.6, fontSize: "0.75rem", margin: "0.25rem 0 0" }}>
                  kept until {document.retainUntil.slice(0, 10)}
                </p>
              ) : null}
            </li>
          ))}
        </ul>
      ) : null}
    </Card>
  );
}
