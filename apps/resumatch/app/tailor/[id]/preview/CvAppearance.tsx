"use client";

import { useEffect, useRef, type ReactNode } from "react";
import { useTranslation } from "@asafarim/shared-i18n";

const STORAGE_KEY = "resumatch.preview.appearanceOpen";

/**
 * "CV appearance": the photo switch and the skills layout, folded away
 * under the action buttons until they are needed. Closed, its summary still
 * says what the CV shows now (`summary`). It opens by itself when something
 * inside needs reading (`forceOpen`, e.g. sentences of a hand-edited skills
 * paragraph worth a second look), and otherwise remembers whether this
 * viewer last left it open (browser storage, a convenience only).
 *
 * A native <details>: keyboard and screen readers get the disclosure for
 * free, and its content stays mounted while closed, so a skills paragraph
 * being written keeps its state and its live status.
 */
export function CvAppearance({
  summary,
  forceOpen,
  children,
}: {
  summary: string;
  forceOpen: boolean;
  children: ReactNode;
}) {
  const { t } = useTranslation();
  const ref = useRef<HTMLDetailsElement>(null);
  // Set when the viewer clicks the summary (Enter and Space click it too),
  // so only their own choice is remembered, not an open for the advice.
  const byViewer = useRef(false);

  useEffect(() => {
    if (!ref.current) return;
    if (forceOpen) {
      ref.current.open = true;
      return;
    }
    try {
      if (window.localStorage.getItem(STORAGE_KEY) === "1")
        ref.current.open = true;
    } catch {
      // Storage blocked: start closed.
    }
  }, [forceOpen]);

  function onToggle() {
    if (!byViewer.current) return;
    byViewer.current = false;
    try {
      window.localStorage.setItem(STORAGE_KEY, ref.current?.open ? "1" : "0");
    } catch {
      // Not remembered; nothing else depends on it.
    }
  }

  return (
    <details
      ref={ref}
      className="rm-appearance"
      onToggle={onToggle}
      data-testid="cv-appearance"
    >
      <summary
        className="rm-appearance__summary"
        onClick={() => {
          byViewer.current = true;
        }}
      >
        <svg
          className="rm-appearance__chevron"
          viewBox="0 0 12 12"
          width="12"
          height="12"
          aria-hidden="true"
          focusable="false"
        >
          <path
            d="M4.5 2.5 8 6l-3.5 3.5"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.6"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>
        <span className="rm-appearance__title">
          {t("resumatch.preview.appearance.title")}
        </span>
        <span className="rm-appearance__current">{summary}</span>
      </summary>
      <div className="rm-appearance__body">{children}</div>
    </details>
  );
}
