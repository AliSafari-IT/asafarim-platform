"use client";

import styles from "./ConversationPanel.module.css";
import { typeLabel } from "./AttachmentComposer";
import { formatBytes } from "./attachmentDraft";
import type { SafeAttachment } from "./types";

/**
 * The persisted attachment cards under a sent message — the "Attachment"
 * conversation card from the M13 spec: thumbnail/metadata plus processing
 * status. These come from the server on every conversation load, so they
 * survive refresh, sign-out, and another device exactly like the message
 * text they belong to.
 *
 * Images render through the app-scoped content route (never a storage URL).
 * A quarantined or failed attachment shows its safe failure message and no
 * thumbnail at all — the bytes behind it must never be fetched back.
 */
export function MessageAttachments({ appId, attachments }: { appId: string; attachments: SafeAttachment[] }) {
  if (attachments.length === 0) return null;

  return (
    <ul className={styles.cardList} aria-label="Attachments">
      {attachments.map((attachment) => {
        const mimeType = attachment.detectedMimeType ?? attachment.declaredMimeType;
        const isImage = mimeType.startsWith("image/");
        const showThumbnail = isImage && attachment.status === "ready";
        const sizeBytes = attachment.actualSizeBytes ?? attachment.declaredSizeBytes;

        return (
          <li key={attachment.id} className={styles.card} data-status={attachment.status}>
            <span className={styles.chipThumb} aria-hidden="true">
              {showThumbnail ? (
                // eslint-disable-next-line @next/next/no-img-element -- an authorized, per-actor API route, not an optimizable static asset
                <img
                  src={`/api/apps/${appId}/conversation/attachments/${attachment.id}/content`}
                  alt=""
                  className={styles.chipImage}
                />
              ) : (
                <span className={styles.chipTypeLabel}>{typeLabel(mimeType, attachment.originalFilename)}</span>
              )}
            </span>
            <span className={styles.chipBody}>
              <span className={styles.chipName} title={attachment.originalFilename}>
                {attachment.originalFilename}
              </span>
              <span className={styles.chipStatusText}>
                {formatBytes(sizeBytes)} · {typeLabel(mimeType, attachment.originalFilename)}
                {attachment.status === "ready" ? "" : ` · ${attachment.status}`}
              </span>
              {attachment.failureMessage ? <span className={styles.chipError}>{attachment.failureMessage}</span> : null}
            </span>
          </li>
        );
      })}
    </ul>
  );
}
