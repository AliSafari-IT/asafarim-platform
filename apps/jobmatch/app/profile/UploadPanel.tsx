"use client";

import { useCallback, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Alert, Badge, Button, Card } from "@asafarim/ui";
import { MAX_DOCUMENT_BYTES } from "../../lib/documents/fileType";

export interface DocumentRow {
  id: string;
  originalFilename: string;
  byteSize: number;
  status: string;
  reasonCode: string | null;
  explanation: string | null;
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
  const [message, setMessage] = useState<{ tone: "info" | "warning" | "error"; text: string } | null>(
    null,
  );

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

  const remove = useCallback(
    async (documentId: string) => {
      setBusy(true);
      try {
        await fetch(`/api/documents/${documentId}`, { method: "DELETE" });
        router.refresh();
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

      <input
        ref={inputRef}
        type="file"
        accept=".pdf,.docx,.txt,application/pdf,application/vnd.openxmlformats-officedocument.wordprocessingml.document,text/plain"
        disabled={busy}
        onChange={(event) => {
          const file = event.target.files?.[0];
          if (file) void upload(file);
        }}
        style={{ display: "block", margin: "1rem 0" }}
      />

      {busy ? <p className="jm-mono">Working…</p> : null}
      {message ? <Alert tone={message.tone}>{message.text}</Alert> : null}

      {documents.length > 0 ? (
        <ul className="jm-list" style={{ marginTop: "1rem" }}>
          {documents.map((document) => (
            <li key={document.id}>
              <div style={{ display: "flex", alignItems: "center", gap: "0.5rem", flexWrap: "wrap" }}>
                <strong>{document.originalFilename}</strong>
                <Badge tone={STATUS_TONE[document.status] ?? "neutral"}>
                  {STATUS_LABEL[document.status] ?? document.status.toLowerCase()}
                </Badge>
                <span className="jm-mono" style={{ opacity: 0.6, fontSize: "0.75rem" }}>
                  {formatSize(document.byteSize)}
                </span>
                {document.status !== "QUARANTINED" ? (
                  <a href={`/api/documents/${document.id}/file`} className="jm-mono">
                    download
                  </a>
                ) : null}
                <Button size="sm" variant="ghost" disabled={busy} onClick={() => void remove(document.id)}>
                  delete
                </Button>
              </div>
              {document.explanation ? (
                <p style={{ opacity: 0.8, margin: "0.35rem 0 0" }}>{document.explanation}</p>
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
