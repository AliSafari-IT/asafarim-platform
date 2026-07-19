"use client";

import { useEffect } from "react";
import { useTranslation } from "@asafarim/shared-i18n";
import { AlertCircle, X } from "lucide-react";

export type AlertDialogProps = {
  open: boolean;
  title: string;
  message: string;
  /** "error" uses a red icon; defaults to "info". */
  tone?: "info" | "error";
  onClose: () => void;
};

/**
 * A small, theme-aware alert modal used in place of the browser's native
 * `alert()` dialog. Closes on Escape, backdrop click, or the OK button.
 */
export function AlertDialog({
  open,
  title,
  message,
  tone = "info",
  onClose,
}: AlertDialogProps) {
  const { t } = useTranslation();
  useEffect(() => {
    if (!open) return;
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-[70] flex items-center justify-center bg-black/50 p-4"
      onClick={onClose}
    >
      <div
        role="alertdialog"
        aria-modal="true"
        aria-label={title}
        className="w-full max-w-sm rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)] p-5 shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-start gap-3">
          <span
            className={`mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-full ${
              tone === "error"
                ? "bg-red-500/15 text-red-400"
                : "bg-[var(--color-accent)]/15 text-[var(--color-accent)]"
            }`}
          >
            <AlertCircle size={16} />
          </span>
          <div className="min-w-0 flex-1">
            <h3 className="text-sm font-semibold text-[var(--color-text)]">{title}</h3>
            <p className="mt-1 whitespace-pre-line text-xs leading-relaxed text-[var(--color-text-muted)]">
              {message}
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-md p-1 text-[var(--color-text-subtle)] transition hover:text-[var(--color-text)]"
            aria-label={t("common.close")}
          >
            <X size={15} />
          </button>
        </div>
        <div className="mt-5 flex justify-end">
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg bg-[var(--color-accent)] px-3 py-1.5 text-xs font-semibold text-white transition hover:bg-[var(--color-accent)]/90"
          >
            {t("common.ok")}
          </button>
        </div>
      </div>
    </div>
  );
}
