"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Button, Textarea } from "@asafarim/ui";
import styles from "./ConversationPanel.module.css";
import {
  acceptAttribute,
  addFiles,
  formatBytes,
  removeAttachment,
  retryUpload,
  setDraftText,
  useAttachmentDraft,
} from "./attachmentDraft";
import type { AttachmentPolicy, DraftAttachment } from "./types";

/** A short, human type label for the file card — "PNG", "PDF", "CSV" — derived from the type, falling back to the extension. */
export function typeLabel(mimeType: string, filename: string): string {
  const subtype = mimeType.split("/")[1] ?? "";
  const known: Record<string, string> = {
    png: "PNG",
    jpeg: "JPEG",
    webp: "WEBP",
    gif: "GIF",
    pdf: "PDF",
    plain: "TXT",
    markdown: "MD",
    json: "JSON",
    csv: "CSV",
  };
  return known[subtype] ?? (filename.split(".").pop() ?? "FILE").toUpperCase().slice(0, 5);
}

function isImage(mimeType: string): boolean {
  return mimeType.startsWith("image/");
}

interface ChipProps {
  appId: string;
  attachment: DraftAttachment;
  disabled: boolean;
}

/**
 * One composer chip. Deliberately a real list item with real buttons rather
 * than a clickable div: remove and retry must be reachable by keyboard and
 * announced with the file they act on, since "Remove" alone is meaningless
 * when eight chips are on screen.
 */
function AttachmentChip({ appId, attachment, disabled }: ChipProps) {
  const { filename, sizeBytes, declaredMimeType, status, progress, previewUrl, attachmentId, error } = attachment;
  const percent = Math.round(progress * 100);
  const thumbnailSrc =
    previewUrl ??
    (status === "ready" && attachmentId && isImage(declaredMimeType)
      ? `/api/apps/${appId}/conversation/attachments/${attachmentId}/content`
      : null);

  return (
    <li className={styles.chip} data-status={status}>
      <span className={styles.chipThumb} aria-hidden="true">
        {thumbnailSrc ? (
          // eslint-disable-next-line @next/next/no-img-element -- an authorized, per-actor API route, not an optimizable static asset
          <img src={thumbnailSrc} alt="" className={styles.chipImage} />
        ) : (
          <span className={styles.chipTypeLabel}>{typeLabel(declaredMimeType, filename)}</span>
        )}
      </span>

      <span className={styles.chipBody}>
        <span className={styles.chipName} title={filename}>
          {filename}
        </span>
        <span className={styles.chipMeta}>
          {status === "uploading" ? (
            <>
              <span
                className={styles.progressTrack}
                role="progressbar"
                aria-valuenow={percent}
                aria-valuemin={0}
                aria-valuemax={100}
                aria-label={`Uploading ${filename}`}
              >
                <span className={styles.progressFill} style={{ width: `${percent}%` }} />
              </span>
              <span className={styles.chipStatusText}>{percent}%</span>
            </>
          ) : status === "failed" ? (
            <span className={styles.chipError}>{error ?? "Upload failed."}</span>
          ) : (
            <span className={styles.chipStatusText}>
              {formatBytes(sizeBytes)} · {typeLabel(declaredMimeType, filename)} · Ready
            </span>
          )}
        </span>
      </span>

      <span className={styles.chipActions}>
        {status === "failed" && attachment.retryable ? (
          <button
            type="button"
            className="ui-btn ui-btn--ghost ui-btn--sm"
            onClick={() => retryUpload(appId, attachment.localId)}
            disabled={disabled}
            aria-label={`Retry uploading ${filename}`}
          >
            Retry
          </button>
        ) : null}
        <button
          type="button"
          className="ui-btn ui-btn--ghost ui-btn--sm"
          onClick={() => removeAttachment(appId, attachment.localId)}
          disabled={disabled}
          aria-label={`Remove ${filename}`}
        >
          Remove
        </button>
      </span>
    </li>
  );
}

export interface AttachmentComposerProps {
  appId: string;
  policy: AttachmentPolicy | null;
  /** Disables everything while a send or an active modification job is in flight. */
  disabled: boolean;
  sending: boolean;
  onSend: () => void;
}

/**
 * M13 slice C composer: text plus an evidence channel. Files arrive three
 * ways — the picker, a clipboard paste (the screenshot case the milestone
 * exists for), and drag/drop — and all three funnel into the same store
 * operation, so validation, progress, retry, and removal behave identically
 * whichever way a file got here.
 *
 * The draft itself lives in `attachmentDraft.ts`, outside React, so
 * switching workspace panels does not abort uploads or lose typed text.
 */
export function AttachmentComposer({ appId, policy, disabled, sending, onSend }: AttachmentComposerProps) {
  const draft = useAttachmentDraft(appId);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [rejections, setRejections] = useState<string[]>([]);
  const [dragging, setDragging] = useState(false);
  // dragenter/dragleave fire for every child element the pointer crosses;
  // counting them is what stops the drop zone flickering mid-drag.
  const dragDepth = useRef(0);

  const uploading = draft.attachments.filter((a) => a.status === "uploading").length;
  const ready = draft.attachments.filter((a) => a.status === "ready").length;
  const canSend = !disabled && !sending && uploading === 0 && (draft.text.trim().length > 0 || ready > 0);

  const accept = useMemo(() => (policy ? acceptAttribute(policy) : ""), [policy]);

  const acceptFiles = useCallback(
    (files: readonly File[]) => {
      if (!policy || files.length === 0) return;
      const rejected = addFiles(appId, files, policy);
      setRejections(rejected);
    },
    [appId, policy],
  );

  // Clear stale rejection messages once the user acts on them.
  useEffect(() => {
    if (rejections.length === 0) return;
    const timer = setTimeout(() => setRejections([]), 10_000);
    return () => clearTimeout(timer);
  }, [rejections]);

  const onPaste = (event: React.ClipboardEvent<HTMLTextAreaElement>) => {
    const files = Array.from(event.clipboardData?.files ?? []);
    if (files.length === 0) return;
    // A pasted screenshot carries files and no text; a copied rich-text
    // fragment can carry both. Only swallow the paste when there is no text
    // to insert, so pasting formatted text never silently loses it.
    if (!event.clipboardData.getData("text/plain")) event.preventDefault();
    acceptFiles(files);
  };

  const onDrop = (event: React.DragEvent) => {
    event.preventDefault();
    dragDepth.current = 0;
    setDragging(false);
    if (disabled) return;
    acceptFiles(Array.from(event.dataTransfer?.files ?? []));
  };

  const statusMessage =
    uploading > 0
      ? `Uploading ${uploading} file${uploading === 1 ? "" : "s"}.`
      : ready > 0
        ? `${ready} attachment${ready === 1 ? "" : "s"} ready to send.`
        : "";

  return (
    <div
      className={styles.composer}
      data-dragging={dragging ? "true" : "false"}
      onDragEnter={(event) => {
        if (disabled || !event.dataTransfer?.types?.includes("Files")) return;
        dragDepth.current += 1;
        setDragging(true);
      }}
      onDragOver={(event) => {
        if (!disabled && event.dataTransfer?.types?.includes("Files")) event.preventDefault();
      }}
      onDragLeave={() => {
        dragDepth.current = Math.max(0, dragDepth.current - 1);
        if (dragDepth.current === 0) setDragging(false);
      }}
      onDrop={onDrop}
    >
      {draft.attachments.length > 0 ? (
        <ul className={styles.chipList} aria-label="Attachments on this message">
          {draft.attachments.map((attachment) => (
            <AttachmentChip key={attachment.localId} appId={appId} attachment={attachment} disabled={sending} />
          ))}
        </ul>
      ) : null}

      {rejections.length > 0 ? (
        <ul className={styles.rejectionList} aria-label="Files that could not be attached">
          {rejections.map((message, index) => (
            <li key={index} className={styles.chipError}>
              {message}
            </li>
          ))}
        </ul>
      ) : null}

      <div className={styles.composerRow}>
        <Textarea
          value={draft.text}
          onChange={(e) => setDraftText(appId, e.target.value)}
          onPaste={onPaste}
          placeholder="Describe a change, e.g. “Add a priority field to tasks.”"
          rows={2}
          disabled={disabled}
          aria-describedby="ab-composer-hint"
          // `Textarea` spreads props over its own `className="ui-input"`, so
          // the base class has to be repeated here or the field loses its
          // design-system styling entirely.
          className={`ui-input ${styles.composerInput}`}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey) {
              e.preventDefault();
              if (canSend) onSend();
            }
          }}
        />
        <div className={styles.composerActions}>
          <input
            ref={fileInputRef}
            type="file"
            multiple
            accept={accept}
            className={styles.visuallyHidden}
            // Reset between picks so choosing the same file twice in a row
            // still fires a change event.
            onChange={(event) => {
              acceptFiles(Array.from(event.target.files ?? []));
              event.target.value = "";
            }}
            tabIndex={-1}
            aria-hidden="true"
          />
          <Button
            type="button"
            variant="secondary"
            size="sm"
            onClick={() => fileInputRef.current?.click()}
            disabled={disabled || !policy}
          >
            Add files or images
          </Button>
          <Button type="button" onClick={onSend} disabled={!canSend}>
            Send
          </Button>
        </div>
      </div>

      <p id="ab-composer-hint" className="ui-hint">
        Enter sends, Shift+Enter adds a line. Paste or drop images and documents to attach them.
      </p>

      {/* Announced to screen readers only — sighted users already see the chips change. */}
      <p className={styles.visuallyHidden} role="status" aria-live="polite">
        {statusMessage}
      </p>

      {dragging ? (
        <div className={styles.dropOverlay} aria-hidden="true">
          <span>Drop files to attach</span>
        </div>
      ) : null}
    </div>
  );
}
