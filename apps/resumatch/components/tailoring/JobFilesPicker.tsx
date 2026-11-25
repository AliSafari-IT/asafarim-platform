"use client";

import { useRef, useState, type DragEvent } from "react";
import { useTranslation } from "@asafarim/shared-i18n";
import { Button } from "@asafarim/ui";
import {
  JOB_FILE_ACCEPT,
  MAX_JOB_FILES,
  MAX_JOB_FILES_TOTAL_BYTES,
  addFiles,
  checkSelection,
  fileKey,
} from "../../lib/tailoring/jobFiles";

/** A file's problem from the server (by file key), shown under its name. */
export type JobFileErrors = Record<string, { code: string; error: string }>;

/** Reason codes with their own job-file wording; anything else is the
 *  server's message or the generic one. */
const FILE_ERROR_CODES = new Set([
  "FILE_TOO_LARGE",
  "EMPTY_FILE",
  "UNSUPPORTED_TYPE",
  "ENCRYPTED_DOCUMENT",
  "NO_TEXT_LAYER",
  "EXTRACTION_ERROR",
  "MALWARE_DETECTED",
  "SCANNER_UNAVAILABLE",
]);

export function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${Math.max(1, Math.round(bytes / 1024))} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1).replace(/\.0$/, "")} MB`;
}

interface JobFilesPickerProps {
  files: File[];
  onChange: (files: File[]) => void;
  errors: JobFileErrors;
  busy: boolean;
  /** The upload is running (busy covers other requests too). */
  reading: boolean;
  onSubmit: () => void;
}

/**
 * Tailor's "Upload files": up to MAX_JOB_FILES files for one job, listed
 * with their size and a Remove button, checked against the same limits
 * the route enforces (lib/tailoring/jobFiles.ts) before anything is sent.
 * Picking again adds to the list rather than replacing it, and files can
 * be dropped on the panel.
 */
export function JobFilesPicker({ files, onChange, errors, busy, reading, onSubmit }: JobFilesPickerProps) {
  const { t } = useTranslation();
  const inputRef = useRef<HTMLInputElement>(null);
  const [dragging, setDragging] = useState(false);
  const check = checkSelection(files);
  const maxSize = formatBytes(MAX_JOB_FILES_TOTAL_BYTES);

  const add = (picked: FileList | null) => {
    if (!picked || picked.length === 0) return;
    onChange(addFiles(files, Array.from(picked)));
  };

  const onDrop = (event: DragEvent<HTMLDivElement>) => {
    event.preventDefault();
    setDragging(false);
    if (!busy) add(event.dataTransfer.files);
  };

  const fileMessage = (file: File, index: number): string | null => {
    const local = check.perFile[index];
    const server = errors[fileKey(file)];
    const code = local ?? server?.code ?? null;
    if (!code) return null;
    if (FILE_ERROR_CODES.has(code)) return t(`resumatch.flow.upload.fileError.${code}`);
    return server?.error ?? t("resumatch.flow.upload.fileError.default");
  };

  return (
    <div
      className="rm-job-files"
      data-dragging={dragging ? "true" : undefined}
      onDragOver={(event) => {
        event.preventDefault();
        if (!busy) setDragging(true);
      }}
      onDragLeave={() => setDragging(false)}
      onDrop={onDrop}
      data-testid="job-files"
    >
      <input
        ref={inputRef}
        type="file"
        multiple
        hidden
        aria-label={t("resumatch.flow.upload.aria")}
        aria-describedby="rm-upload-job-hint"
        accept={JOB_FILE_ACCEPT}
        onChange={(event) => {
          add(event.target.files);
          // Lets the same file be picked again after it was removed.
          event.target.value = "";
        }}
        disabled={busy}
      />
      <div className="rm-job-files__add">
        <Button variant="ghost" onClick={() => inputRef.current?.click()} disabled={busy} data-testid="job-files-add">
          {files.length === 0 ? t("resumatch.flow.upload.add") : t("resumatch.flow.upload.addMore")}
        </Button>
        <span className="rm-job-files__drop">{t("resumatch.flow.upload.drop")}</span>
      </div>

      {files.length > 0 ? (
        <>
          <ul className="rm-job-files__list" aria-label={t("resumatch.flow.upload.listLabel")}>
            {files.map((file, index) => {
              const message = fileMessage(file, index);
              return (
                <li key={fileKey(file)} className="rm-job-files__item" data-invalid={message ? "true" : undefined}>
                  <span className="rm-job-files__name">{file.name}</span>
                  <span className="rm-job-files__size">{formatBytes(file.size)}</span>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => onChange(files.filter((_, i) => i !== index))}
                    disabled={busy}
                    aria-label={t("resumatch.flow.upload.remove", { name: file.name })}
                  >
                    {t("resumatch.flow.upload.removeShort")}
                  </Button>
                  {message ? (
                    <span className="rm-job-files__error" role="alert">
                      {message}
                    </span>
                  ) : null}
                </li>
              );
            })}
          </ul>
          <p className="rm-job-files__summary" aria-live="polite">
            {t("resumatch.flow.upload.count", {
              count: String(files.length),
              max: String(MAX_JOB_FILES),
              size: formatBytes(check.totalBytes),
              maxSize,
            })}
          </p>
          {check.overall === "TOO_MANY_FILES" ? (
            <p className="rm-job-files__error" role="alert">
              {t("resumatch.flow.upload.tooMany", { max: String(MAX_JOB_FILES), extra: String(files.length - MAX_JOB_FILES) })}
            </p>
          ) : check.overall === "TOTAL_TOO_LARGE" ? (
            <p className="rm-job-files__error" role="alert">
              {t("resumatch.flow.upload.totalTooLarge", { maxSize })}
            </p>
          ) : null}
        </>
      ) : null}

      <div style={{ marginTop: "0.5rem" }}>
        <Button onClick={onSubmit} disabled={!check.ok || busy} data-testid="job-files-submit">
          {reading
            ? t("resumatch.flow.reading")
            : files.length > 1
              ? t("resumatch.flow.upload.submitMany", { count: String(files.length) })
              : t("resumatch.flow.upload.submit")}
        </Button>
      </div>
    </div>
  );
}
