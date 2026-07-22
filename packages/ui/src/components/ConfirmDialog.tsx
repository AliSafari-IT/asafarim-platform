"use client";

import { useEffect, useRef, type ReactNode } from "react";

/**
 * The platform's one shared confirmation dialog — never `window.confirm`/
 * `window.alert` (see apps/vionto's own ConfirmDialog for the prior,
 * app-local convention this promotes and completes). Unlike that prior
 * version, this one implements a REAL focus trap: focus moves into the
 * dialog on open, Tab/Shift+Tab cycle only among the dialog's own focusable
 * elements, Escape closes it, and focus is restored to whatever triggered
 * it on close — required for any destructive-change confirmation flow to
 * be keyboard-accessible (WAI-ARIA APG "Alert and Message Dialogs" pattern).
 *
 * This is the first client-interactive component in `@asafarim/ui` — every
 * other component in this package is a plain server-compatible function
 * component; a real modal cannot be one.
 */
export interface ConfirmDialogProps {
  open: boolean;
  title: string;
  /** Plain-text message. For richer content (e.g. a structured diff), use `children` instead/additionally. */
  message?: string;
  children?: ReactNode;
  confirmLabel?: string;
  cancelLabel?: string;
  tone?: "default" | "danger";
  /** Disables the confirm button and shows it as busy — e.g. while an async confirmation request is in flight. */
  confirmDisabled?: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}

const FOCUSABLE_SELECTOR =
  'a[href], button:not([disabled]), textarea:not([disabled]), input:not([disabled]), select:not([disabled]), [tabindex]:not([tabindex="-1"])';

export function ConfirmDialog({
  open,
  title,
  message,
  children,
  confirmLabel = "Confirm",
  cancelLabel = "Cancel",
  tone = "default",
  confirmDisabled = false,
  onConfirm,
  onCancel,
}: ConfirmDialogProps) {
  const dialogRef = useRef<HTMLDivElement>(null);
  const previouslyFocused = useRef<HTMLElement | null>(null);

  useEffect(() => {
    if (!open) return;

    previouslyFocused.current = document.activeElement as HTMLElement | null;
    const dialog = dialogRef.current;
    const focusables = dialog ? Array.from(dialog.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR)) : [];
    (focusables[0] ?? dialog)?.focus();

    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        event.preventDefault();
        onCancel();
        return;
      }
      if (event.key !== "Tab" || !dialog) return;

      const current = Array.from(dialog.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR)).filter(
        (el) => el.offsetParent !== null,
      );
      if (current.length === 0) {
        event.preventDefault();
        return;
      }
      const first = current[0];
      const last = current[current.length - 1];
      const active = document.activeElement;

      if (event.shiftKey && active === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && active === last) {
        event.preventDefault();
        first.focus();
      } else if (!current.includes(active as HTMLElement)) {
        // Focus somehow escaped the dialog (e.g. programmatic focus
        // elsewhere) — pull it back in rather than letting Tab continue
        // into background page content.
        event.preventDefault();
        first.focus();
      }
    }

    document.addEventListener("keydown", onKeyDown, true);
    return () => {
      document.removeEventListener("keydown", onKeyDown, true);
      previouslyFocused.current?.focus();
    };
  }, [open, onCancel]);

  if (!open) return null;

  const titleId = "ui-confirm-dialog-title";
  const messageId = "ui-confirm-dialog-message";

  return (
    <div className="ui-dialog-overlay" onClick={onCancel}>
      <div
        ref={dialogRef}
        className={["ui-dialog", tone === "danger" ? "ui-dialog--danger" : null].filter(Boolean).join(" ")}
        role="alertdialog"
        aria-modal="true"
        aria-labelledby={titleId}
        aria-describedby={message ? messageId : undefined}
        tabIndex={-1}
        onClick={(event) => event.stopPropagation()}
      >
        <h2 id={titleId} className="ui-dialog__title">
          {title}
        </h2>
        {message ? (
          <p id={messageId} className="ui-dialog__message">
            {message}
          </p>
        ) : null}
        {children ? <div className="ui-dialog__body">{children}</div> : null}
        <div className="ui-dialog__actions">
          <button type="button" className="ui-btn ui-btn--ghost" onClick={onCancel}>
            {cancelLabel}
          </button>
          <button
            type="button"
            className={`ui-btn ${tone === "danger" ? "ui-btn--danger" : "ui-btn--primary"}`}
            onClick={onConfirm}
            disabled={confirmDisabled}
            aria-busy={confirmDisabled || undefined}
          >
            {confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}
