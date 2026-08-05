"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useTranslation } from "@asafarim/shared-i18n";
import { uploadErrorMessage } from "@/lib/upload-error";

/**
 * A persisted inquiry attachment — the shape stored on the EduInquiry row and
 * sent to `POST /api/inquiries`. Mirrors `attachmentSchema` in
 * `lib/server/validation.ts`.
 */
export type UploadedAttachment = {
  key: string;
  url: string;
  mime: string;
  sizeBytes: number;
  filename: string;
};

/** Client mirror of the server allow-list (`lib/server/validation.ts`). */
export const ACCEPTED_MIME_TYPES = [
  "image/jpeg",
  "image/png",
  "image/webp",
  "image/heic",
  "video/mp4",
  "video/quicktime",
  "audio/mp4",
  "audio/mpeg",
  "audio/wav",
  "audio/webm",
  "text/plain",
  "application/pdf",
  "application/msword",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  "application/vnd.openxmlformats-officedocument.presentationml.presentation",
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
] as const;

export const MAX_FILES = 5;
export const MAX_FILE_BYTES = 50 * 1024 * 1024; // 50 MB — keep in sync with server

type ItemStatus = "uploading" | "done" | "error";

/** One file as tracked locally while the user assembles their question. */
type UploadItem = {
  id: string;
  file: File;
  status: ItemStatus;
  progress: number; // 0–100
  error?: string;
  previewUrl?: string; // object URL for image thumbnails
  attachment?: UploadedAttachment; // set once the upload settles
};

export function humanSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function isImage(mime: string) {
  return mime.startsWith("image/");
}

function FileTypeIcon({ mime }: { mime: string }) {
  if (mime.startsWith("image/")) return <span aria-hidden="true">🖼</span>;
  if (mime.startsWith("audio/")) return <span aria-hidden="true">🎤</span>;
  if (mime.startsWith("video/")) return <span aria-hidden="true">🎬</span>;
  if (mime === "application/pdf") return <span aria-hidden="true">📄</span>;
  if (mime.includes("word") || mime === "application/msword")
    return <span aria-hidden="true">📝</span>;
  if (mime.includes("presentation")) return <span aria-hidden="true">📊</span>;
  if (mime.includes("spreadsheet")) return <span aria-hidden="true">📈</span>;
  return <span aria-hidden="true">📎</span>;
}

/**
 * POST the file to our own proxy endpoint (`/api/uploads/upload`).
 * The server presigns and PUTs to storage — the browser never makes a
 * cross-origin request, so no CORS configuration is needed on the bucket.
 * XHR is used so we can report real upload-to-server progress.
 */
function uploadFile(
  file: File,
  onProgress: (pct: number) => void,
): Promise<UploadedAttachment> {
  return new Promise((resolve, reject) => {
    const body = new FormData();
    body.append("file", file);

    const xhr = new XMLHttpRequest();
    xhr.open("POST", "/api/uploads/upload", true);

    xhr.upload.onprogress = (e) => {
      if (e.lengthComputable) onProgress(Math.round((e.loaded / e.total) * 100));
    };

    xhr.onload = () => {
      if (xhr.status >= 200 && xhr.status < 300) {
        try {
          resolve(JSON.parse(xhr.responseText) as UploadedAttachment);
        } catch {
          reject(new Error("Invalid response from upload"));
        }
      } else {
        let detail: string | undefined;
        try {
          const d = JSON.parse(xhr.responseText) as {
            error?: string;
            message?: string; // dev-mode detail from serverError
          };
          detail = d.message ?? d.error;
        } catch { /* non-JSON body — nothing to show beyond the status */ }

        // Always log the server's full text: it is the only place a developer
        // can read a stack trace or a Prisma code frame in one piece.
        console.error(`[edumatch][upload] ${xhr.status}`, detail ?? xhr.responseText);

        // An empty message means "use the localized generic message" — the
        // row renders `it.error || t(errGeneric)`.
        reject(new Error(uploadErrorMessage(detail, xhr.status) ?? ""));
      }
    };

    xhr.onerror = () => reject(new Error("Network error during upload"));
    xhr.send(body);
  });
}

type Props = {
  /** Reports the currently-uploaded attachments to the parent form. */
  onChange: (attachments: UploadedAttachment[]) => void;
  /** True while any file is still uploading — parent should block submit. */
  onUploadingChange?: (uploading: boolean) => void;
};

/**
 * Drag-and-drop + browse uploader for inquiry attachments. Owns the per-file
 * upload lifecycle and reports the settled attachment list up to the form.
 */
export function AttachmentUploader({ onChange, onUploadingChange }: Props) {
  const { t } = useTranslation();
  const [items, setItems] = useState<UploadItem[]>([]);
  const [dragActive, setDragActive] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  // Report settled attachments + in-flight state to the parent.
  useEffect(() => {
    const attachments = items
      .filter((it) => it.status === "done" && it.attachment)
      .map((it) => it.attachment as UploadedAttachment);
    onChange(attachments);
    onUploadingChange?.(items.some((it) => it.status === "uploading"));
  }, [items, onChange, onUploadingChange]);

  // Revoke object URLs on unmount to avoid leaks.
  useEffect(() => {
    return () => {
      setItems((prev) => {
        prev.forEach((it) => it.previewUrl && URL.revokeObjectURL(it.previewUrl));
        return prev;
      });
    };
  }, []);

  const runUpload = useCallback((id: string, file: File) => {
    uploadFile(file, (pct) =>
      setItems((prev) =>
        prev.map((it) => (it.id === id ? { ...it, progress: pct } : it)),
      ),
    )
      .then((attachment) =>
        setItems((prev) =>
          prev.map((it) =>
            it.id === id
              ? { ...it, status: "done", progress: 100, attachment }
              : it,
          ),
        ),
      )
      .catch((err: unknown) =>
        setItems((prev) =>
          prev.map((it) =>
            it.id === id
              ? {
                  ...it,
                  status: "error",
                  error: err instanceof Error ? err.message : String(err),
                }
              : it,
          ),
        ),
      );
  }, []);

  const addFiles = useCallback(
    (fileList: FileList | File[]) => {
      setNotice(null);
      const incoming = Array.from(fileList);
      const accepted: UploadItem[] = [];
      const errors: string[] = [];

      setItems((prev) => {
        let slots = MAX_FILES - prev.length;
        for (const file of incoming) {
          if (slots <= 0) {
            errors.push(t("edumatch.inquiry.new.attach.errTooMany", { n: MAX_FILES }));
            break;
          }
          if (!ACCEPTED_MIME_TYPES.includes(file.type as never)) {
            errors.push(
              t("edumatch.inquiry.new.attach.errType", { name: file.name }),
            );
            continue;
          }
          if (file.size > MAX_FILE_BYTES) {
            errors.push(
              t("edumatch.inquiry.new.attach.errSize", { name: file.name }),
            );
            continue;
          }
          if (file.size < 1) {
            errors.push(
              t("edumatch.inquiry.new.attach.errEmpty", { name: file.name }),
            );
            continue;
          }
          const id = `${file.name}-${file.size}-${crypto.randomUUID()}`;
          accepted.push({
            id,
            file,
            status: "uploading",
            progress: 0,
            previewUrl: isImage(file.type)
              ? URL.createObjectURL(file)
              : undefined,
          });
          slots -= 1;
        }
        return [...prev, ...accepted];
      });

      if (errors.length > 0) setNotice(errors.join(" "));
      // Kick off uploads outside the state updater.
      accepted.forEach((it) => runUpload(it.id, it.file));
    },
    [runUpload, t],
  );

  const removeItem = useCallback((id: string) => {
    setItems((prev) => {
      const target = prev.find((it) => it.id === id);
      if (target?.previewUrl) URL.revokeObjectURL(target.previewUrl);
      return prev.filter((it) => it.id !== id);
    });
  }, []);

  const retryItem = useCallback(
    (id: string) => {
      setItems((prev) =>
        prev.map((it) =>
          it.id === id ? { ...it, status: "uploading", progress: 0, error: undefined } : it,
        ),
      );
      const target = items.find((it) => it.id === id);
      if (target) runUpload(id, target.file);
    },
    [items, runUpload],
  );

  const onDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setDragActive(false);
    if (e.dataTransfer.files?.length) addFiles(e.dataTransfer.files);
  };

  const isFull = items.length >= MAX_FILES;

  return (
    <div>
      <div className="flex items-center justify-between mb-2">
        <label className="block text-sm font-medium text-[var(--color-text)]">
          {t("edumatch.inquiry.new.attach.label")}{" "}
          <span className="font-normal text-[var(--color-text-muted)]">
            {t("edumatch.inquiry.new.attach.optional")}
          </span>
        </label>
        <span className="text-xs text-[var(--color-text-muted)]">
          {items.length} / {MAX_FILES}
        </span>
      </div>

      {/* Drop zone */}
      <div
        role="button"
        tabIndex={isFull ? -1 : 0}
        aria-disabled={isFull}
        onClick={() => !isFull && inputRef.current?.click()}
        onKeyDown={(e) => {
          if (!isFull && (e.key === "Enter" || e.key === " ")) {
            e.preventDefault();
            inputRef.current?.click();
          }
        }}
        onDragOver={(e) => {
          e.preventDefault();
          if (!isFull) setDragActive(true);
        }}
        onDragLeave={() => setDragActive(false)}
        onDrop={onDrop}
        className={`flex flex-col items-center justify-center gap-1 rounded-lg border-2 border-dashed px-4 py-6 text-center transition ${
          isFull
            ? "cursor-not-allowed border-[var(--color-border)] opacity-50"
            : dragActive
              ? "cursor-pointer border-[var(--color-primary)] bg-[color:color-mix(in_srgb,var(--color-primary)_8%,transparent)]"
              : "cursor-pointer border-[var(--color-border-strong)] hover:border-[var(--color-primary)]"
        }`}
      >
        <span className="text-2xl" aria-hidden="true">
          📎
        </span>
        <span className="text-sm font-medium text-[var(--color-text)]">
          {isFull
            ? t("edumatch.inquiry.new.attach.full")
            : t("edumatch.inquiry.new.attach.dropzone")}
        </span>
        <span className="text-xs text-[var(--color-text-muted)]">
          {t("edumatch.inquiry.new.attach.hint")}
        </span>
        <input
          ref={inputRef}
          type="file"
          multiple
          accept={ACCEPTED_MIME_TYPES.join(",")}
          className="hidden"
          onChange={(e) => {
            if (e.target.files?.length) addFiles(e.target.files);
            e.target.value = ""; // allow re-selecting the same file
          }}
        />
      </div>

      {notice && (
        <div
          role="alert"
          className="mt-2 rounded-lg border border-amber-300 bg-amber-50 px-3 py-2 text-xs text-amber-800"
        >
          {notice}
        </div>
      )}

      {/* File list */}
      {items.length > 0 && (
        <ul className="mt-3 space-y-2">
          {items.map((it) => (
            <li
              key={it.id}
              className="flex items-center gap-3 rounded-lg border border-[var(--color-border)] bg-[var(--color-surface)] p-2"
            >
              {/* Thumbnail / icon */}
              <div className="flex h-10 w-10 shrink-0 items-center justify-center overflow-hidden rounded bg-[var(--color-panel)] text-lg">
                {it.previewUrl ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={it.previewUrl}
                    alt={it.file.name}
                    className="h-full w-full object-cover"
                  />
                ) : (
                  <FileTypeIcon mime={it.file.type} />
                )}
              </div>

              {/* Name + meta */}
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm text-[var(--color-text)]">
                  {it.file.name}
                </p>
                <p className="text-xs text-[var(--color-text-muted)]">
                  {humanSize(it.file.size)}
                  {it.status === "uploading" &&
                    ` · ${t("edumatch.inquiry.new.attach.uploading")} ${it.progress}%`}
                  {it.status === "done" &&
                    ` · ${t("edumatch.inquiry.new.attach.done")}`}
                </p>
                {it.status === "uploading" && (
                  <div className="mt-1 h-1 w-full overflow-hidden rounded bg-[var(--color-border)]">
                    <div
                      className="h-full bg-[var(--color-primary)] transition-all"
                      style={{ width: `${it.progress}%` }}
                    />
                  </div>
                )}
                {it.status === "error" && (
                  // break-all, not break-words: the tokens that overflow here
                  // (bundler chunk ids, file paths) contain no spaces, so
                  // normal word wrapping leaves them to spill past the card.
                  <p className="break-all text-xs text-red-500">
                    {it.error || t("edumatch.inquiry.new.attach.errGeneric")}
                  </p>
                )}
              </div>

              {/* Actions */}
              <div className="flex shrink-0 items-center gap-1">
                {it.status === "error" && (
                  <button
                    type="button"
                    onClick={() => retryItem(it.id)}
                    className="rounded px-2 py-1 text-xs font-medium text-[var(--color-primary)] hover:underline"
                  >
                    {t("edumatch.inquiry.new.attach.retry")}
                  </button>
                )}
                <button
                  type="button"
                  onClick={() => removeItem(it.id)}
                  aria-label={t("edumatch.inquiry.new.attach.remove")}
                  className="rounded px-2 py-1 text-xs text-[var(--color-text-muted)] hover:text-red-500"
                >
                  ✕
                </button>
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
