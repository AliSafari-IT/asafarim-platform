"use client";

import { useId, useRef } from "react";
import { useTranslation } from "@asafarim/shared-i18n";
import { Button } from "@asafarim/ui";
import { ATTACHMENT_ACCEPT, checkAttachmentSelection, MAX_ATTACHMENTS_PER_EVENT } from "../../lib/applications/timeline/attachments";
import { formatBytes } from "./client";

/** Picks screenshots, PDFs or saved emails; checks counts and sizes before
 *  anything is sent (the server checks again, and sniffs the bytes). */
export function AttachmentPicker({
  files,
  onChange,
  already = 0,
  testId,
  label,
}: {
  files: File[];
  onChange: (files: File[]) => void;
  already?: number;
  testId: string;
  label?: string;
}) {
  const { t } = useTranslation();
  const id = useId();
  const input = useRef<HTMLInputElement>(null);
  const problem = checkAttachmentSelection(files, already);
  return (
    <div className="rm-tl-files" data-testid={testId}>
      <label className="jm-field" htmlFor={id}>
        <span>
          {label ?? t("resumatch.tl.files.label")} <span className="rm-tl-optional">{t("resumatch.tl.optional")}</span>
        </span>
      </label>
      <input
        id={id}
        ref={input}
        type="file"
        multiple
        accept={ATTACHMENT_ACCEPT}
        aria-describedby={`${id}-hint`}
        data-testid={`${testId}-input`}
        onChange={(e) => {
          const picked = Array.from(e.target.files ?? []);
          const seen = new Set(files.map((f) => `${f.name}:${f.size}`));
          onChange([...files, ...picked.filter((f) => !seen.has(`${f.name}:${f.size}`))]);
          if (input.current) input.current.value = "";
        }}
      />
      <p className="rm-tl-hint" id={`${id}-hint`}>
        {t("resumatch.tl.files.hint", { max: MAX_ATTACHMENTS_PER_EVENT })}
      </p>
      {files.length > 0 ? (
        <ul className="rm-tl-files__list">
          {files.map((file, index) => (
            <li key={`${file.name}:${file.size}:${index}`}>
              <span>
                {file.name} <span className="rm-tl-hint">({formatBytes(file.size)})</span>
              </span>
              <Button
                type="button"
                variant="ghost"
                size="sm"
                aria-label={t("resumatch.tl.files.removeNamed", { name: file.name })}
                onClick={() => onChange(files.filter((_, i) => i !== index))}
              >
                {t("resumatch.tl.files.remove")}
              </Button>
            </li>
          ))}
        </ul>
      ) : null}
      {problem ? (
        <p className="rm-field-error" role="alert">
          {t(`resumatch.tl.files.problem.${problem}`, { max: MAX_ATTACHMENTS_PER_EVENT })}
        </p>
      ) : null}
    </div>
  );
}
