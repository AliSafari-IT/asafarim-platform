"use client";

import { useEffect, useId, useRef, useState, type KeyboardEvent } from "react";
import { useTranslation } from "@asafarim/shared-i18n";
import { useSkillsPending } from "../../../../components/tailoring/SkillsPending";

type Item = "pdf" | "docx";
const ITEMS: Item[] = ["pdf", "docx"];

/**
 * "Download ▾" on the CV preview: one menu button for the two downloads.
 *
 * - PDF is the browser's own print-to-PDF against the `@media print`
 *   stylesheet (app/resumatch.css), as before (no server rendering).
 * - Word (.docx) is a plain navigation to the DOCX route (issue #435); the
 *   browser handles its `content-disposition: attachment` response.
 *
 * The menu follows the WAI-ARIA menu button pattern: Enter, Space or
 * Arrow Down opens it on the first item, Arrow Up on the last; arrows,
 * Home and End move; Escape closes it and gives focus back to the button;
 * Tab or a click outside closes it. While the CV's Skills section is being
 * changed (components/tailoring/SkillsPending.tsx) the button waits, so a
 * file never holds a layout that is about to be replaced.
 */
export function DownloadMenu({ id }: { id: string }) {
  const { t } = useTranslation();
  const { pending } = useSkillsPending();
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(0);
  const buttonRef = useRef<HTMLButtonElement>(null);
  const menuRef = useRef<HTMLUListElement>(null);
  const itemRefs = useRef<(HTMLButtonElement | null)[]>([]);
  const menuId = useId();
  const disabled = pending !== null;

  // Focus follows the active item while the menu is open.
  useEffect(() => {
    if (open) itemRefs.current[active]?.focus();
  }, [open, active]);

  // A click anywhere outside closes the menu (without moving focus).
  useEffect(() => {
    if (!open) return;
    function onPointerDown(event: PointerEvent) {
      const target = event.target as Node;
      if (
        !menuRef.current?.contains(target) &&
        !buttonRef.current?.contains(target)
      )
        setOpen(false);
    }
    document.addEventListener("pointerdown", onPointerDown);
    return () => document.removeEventListener("pointerdown", onPointerDown);
  }, [open]);

  // Pending work closes an open menu: its items would download stale files.
  useEffect(() => {
    if (disabled) setOpen(false);
  }, [disabled]);

  function openAt(index: number) {
    setActive(index);
    setOpen(true);
  }

  function close(focusButton: boolean) {
    setOpen(false);
    if (focusButton) buttonRef.current?.focus();
  }

  function choose(item: Item) {
    close(true);
    if (item === "pdf") {
      // After the menu has closed, so the print dialog opens on a calm page.
      window.setTimeout(() => window.print(), 0);
    } else {
      window.location.assign(`/api/tailor/${id}/docx`);
    }
  }

  function onButtonKeyDown(event: KeyboardEvent<HTMLButtonElement>) {
    if (event.key === "ArrowDown") {
      event.preventDefault();
      openAt(0);
    } else if (event.key === "ArrowUp") {
      event.preventDefault();
      openAt(ITEMS.length - 1);
    }
  }

  function onMenuKeyDown(event: KeyboardEvent<HTMLUListElement>) {
    const last = ITEMS.length - 1;
    switch (event.key) {
      case "ArrowDown":
        event.preventDefault();
        setActive((index) => (index >= last ? 0 : index + 1));
        break;
      case "ArrowUp":
        event.preventDefault();
        setActive((index) => (index <= 0 ? last : index - 1));
        break;
      case "Home":
        event.preventDefault();
        setActive(0);
        break;
      case "End":
        event.preventDefault();
        setActive(last);
        break;
      case "Escape":
        event.preventDefault();
        close(true);
        break;
      case "Tab":
        setOpen(false);
        break;
    }
  }

  return (
    <div className="rm-download" data-testid="cv-download">
      <button
        ref={buttonRef}
        type="button"
        className="ui-btn ui-btn--ghost rm-download__button"
        aria-haspopup="menu"
        aria-expanded={open}
        aria-controls={open ? menuId : undefined}
        disabled={disabled}
        aria-describedby={pending ? "cv-skills-status" : undefined}
        onClick={() => (open ? close(false) : openAt(0))}
        onKeyDown={onButtonKeyDown}
        data-testid="cv-download-button"
      >
        {t("resumatch.preview.downloadMenu")}
        <svg
          className="rm-download__chevron"
          viewBox="0 0 12 12"
          width="12"
          height="12"
          aria-hidden="true"
          focusable="false"
        >
          <path
            d="M2.5 4.5 6 8l3.5-3.5"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.6"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>
      </button>
      {open ? (
        <ul
          ref={menuRef}
          id={menuId}
          role="menu"
          aria-label={t("resumatch.preview.downloadMenuLabel")}
          className="rm-download__menu"
          onKeyDown={onMenuKeyDown}
        >
          {ITEMS.map((item, index) => (
            <li key={item} role="none">
              <button
                ref={(node) => {
                  itemRefs.current[index] = node;
                }}
                type="button"
                role="menuitem"
                tabIndex={index === active ? 0 : -1}
                className="rm-download__item"
                onClick={() => choose(item)}
                onMouseEnter={() => setActive(index)}
                data-testid={`cv-download-${item}`}
              >
                <span className="rm-download__item-label">
                  {t(
                    item === "pdf"
                      ? "resumatch.preview.downloadMenuPdf"
                      : "resumatch.preview.downloadMenuDocx"
                  )}
                </span>
                <span className="rm-download__item-hint">
                  {t(
                    item === "pdf"
                      ? "resumatch.preview.downloadMenuPdfHint"
                      : "resumatch.preview.downloadMenuDocxHint"
                  )}
                </span>
              </button>
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}
