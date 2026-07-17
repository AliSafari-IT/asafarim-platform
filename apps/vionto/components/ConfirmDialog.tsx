"use client";

import { useEffect } from "react";
import { AlertTriangle, X } from "lucide-react";

export type ConfirmDialogProps = {
  open: boolean;
  title: string;
  message: string;
  confirmLabel?: string;
  cancelLabel?: string;
  /** "danger" uses a red confirm button for destructive actions. */
  tone?: "default" | "danger";
  onConfirm: () => void;
  onCancel: () => void;
};

/**
 * A small, theme-aware confirmation modal used in place of the browser's
 * native `confirm()` dialog. Closes on Escape or backdrop click.
 */
export function ConfirmDialog({
  open,
  title,
  message,
  confirmLabel = "Confirm",
  cancelLabel = "Cancel",
  tone = "default",
  onConfirm,
  onCancel,
}: ConfirmDialogProps) {
  useEffect(() => {
    if (!open) return;
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") onCancel();
    }
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [open, onCancel]);

  if (!open) return null;

  const confirmClasses =
    tone === "danger"
      ? "bg-red-500 hover:bg-red-500/90 text-white"
      : "bg-[var(--color-accent)] hover:bg-[var(--color-accent)]/90 text-white";

  return (
    <div
      className="fixed inset-0 z-[70] flex items-center justify-center bg-black/50 p-4"
      onClick={onCancel}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-label={title}
        className="w-full max-w-sm rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)] p-5 shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-start gap-3">
          <span
            className={`mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-full ${
              tone === "danger"
                ? "bg-red-500/15 text-red-400"
                : "bg-[var(--color-accent)]/15 text-[var(--color-accent)]"
            }`}
          >
            <AlertTriangle size={16} />
          </span>
          <div className="min-w-0 flex-1">
            <h3 className="text-sm font-semibold text-[var(--color-text)]">{title}</h3>
            <p className="mt-1 whitespace-pre-line text-xs leading-relaxed text-[var(--color-text-muted)]">
              {message}
            </p>
          </div>
          <button
            type="button"
            onClick={onCancel}
            className="rounded-md p-1 text-[var(--color-text-subtle)] transition hover:text-[var(--color-text)]"
            aria-label={cancelLabel}
          >
            <X size={15} />
          </button>
        </div>
        <div className="mt-5 flex justify-end gap-2">
          <button
            type="button"
            onClick={onCancel}
            className="rounded-lg border border-[var(--color-border)] bg-[var(--color-surface-soft)] px-3 py-1.5 text-xs font-medium text-[var(--color-text-muted)] transition hover:text-[var(--color-text)]"
          >
            {cancelLabel}
          </button>
          <button
            type="button"
            onClick={onConfirm}
            className={`rounded-lg px-3 py-1.5 text-xs font-semibold transition ${confirmClasses}`}
          >
            {confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}
