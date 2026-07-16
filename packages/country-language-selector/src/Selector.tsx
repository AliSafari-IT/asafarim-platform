"use client";

import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { useTranslation, type Locale } from "@asafarim/shared-i18n";
import {
  BENELUX_COUNTRIES,
  COUNTRY_ORDER,
  LOCALE_LABELS,
  countryForLocale,
  type CountryCode,
} from "./countries";

export type CountryLanguageSelectorProps = {
  lockCountry?: CountryCode;
  onChange?: (next: Locale, country: CountryCode | null) => void;
  className?: string;
  compact?: boolean;
};

export function CountryLanguageSelector({
  lockCountry,
  onChange,
  className,
  compact = false,
}: CountryLanguageSelectorProps) {
  const { locale, setLocale, t } = useTranslation();
  const [open, setOpen] = useState(false);
  const [country, setCountry] = useState<CountryCode>(() =>
    lockCountry ?? countryForLocale(locale) ?? "NL"
  );
  const [dropdownStyle, setDropdownStyle] = useState<Record<string, number | string>>({});
  const rootRef = useRef<HTMLDivElement | null>(null);
  const dropdownRef = useRef<HTMLDivElement | null>(null);
  const manualRef = useRef(false);

  /* Sync country only when locale changes *externally* (cookie, another tab).
     Do NOT snap back when the user manually picked a different country. */
  useEffect(() => {
    if (lockCountry) return;
    if (manualRef.current) return;
    const derived = countryForLocale(locale);
    if (derived && derived !== country) setCountry(derived);
  }, [locale, lockCountry]); // eslint-disable-line react-hooks/exhaustive-deps

  /* Close on outside click / Escape */
  useEffect(() => {
    if (!open) return;
    function onDocClick(e: MouseEvent) {
      const target = e.target as Node;
      const clickedTrigger = rootRef.current?.contains(target);
      const clickedDropdown = dropdownRef.current?.contains(target);
      if (!clickedTrigger && !clickedDropdown) {
        setOpen(false);
      }
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") setOpen(false);
    }
    document.addEventListener("mousedown", onDocClick);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDocClick);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  useLayoutEffect(() => {
    if (!open) return;

    function positionDropdown() {
      if (!rootRef.current) return;
      const rect = rootRef.current.getBoundingClientRect();
      const viewportWidth = window.innerWidth;
      const width = Math.min(224, viewportWidth - 16);
      const left = Math.max(8, Math.min(rect.right - width, viewportWidth - width - 8));

      setDropdownStyle({
        position: "fixed",
        top: rect.bottom + 8,
        left,
        width,
        visibility: "visible",
      });
    }

    positionDropdown();
    window.addEventListener("resize", positionDropdown);
    window.addEventListener("scroll", positionDropdown, true);

    return () => {
      window.removeEventListener("resize", positionDropdown);
      window.removeEventListener("scroll", positionDropdown, true);
    };
  }, [open]);

  const activeCountry = BENELUX_COUNTRIES[country];
  const languages = activeCountry.languages;
  const activeLabel = LOCALE_LABELS[locale];
  const dropdown = open ? (
    <div
      ref={dropdownRef}
      role="listbox"
      className="cls-dropdown"
      style={{ visibility: "hidden", ...dropdownStyle }}
    >
      {/* Countries */}
      {!lockCountry && (
        <div className="cls-countries">
          {COUNTRY_ORDER.map((code) => {
            const c = BENELUX_COUNTRIES[code];
            const active = code === country;
            return (
              <button
                key={code}
                type="button"
                onClick={() => pickCountry(code)}
                className={`cls-country${active ? " is-active" : ""}`}
                aria-pressed={active}
              >
                <img
                  src={c.flagUrl}
                  alt={c.name}
                  className="cls-flag"
                  loading="lazy"
                />
                <span className="cls-country-code">{c.code}</span>
                {active && <span className="cls-active-dot" />}
              </button>
            );
          })}
        </div>
      )}

      {/* Languages */}
      <div className="cls-langs">
        <ul className="cls-lang-list">
          {languages.map((lng) => {
            const active = lng === locale;
            const label = LOCALE_LABELS[lng];
            return (
              <li key={lng}>
                <button
                  type="button"
                  onClick={() => pickLocale(lng)}
                  role="option"
                  aria-selected={active}
                  className={`cls-lang${active ? " is-active" : ""}`}
                >
                  <span className="cls-lang-label">{label.long}</span>
                  {active ? (
                    <svg
                      viewBox="0 0 16 16"
                      className="cls-check"
                      fill="none"
                      aria-hidden="true"
                    >
                      <path
                        d="M3 8l3.5 3.5L13 5"
                        stroke="currentColor"
                        strokeWidth="1.5"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                      />
                    </svg>
                  ) : (
                    <span className="cls-lang-code">{lng}</span>
                  )}
                </button>
              </li>
            );
          })}
        </ul>
      </div>
    </div>
  ) : null;

  function pickCountry(code: CountryCode) {
    manualRef.current = true;
    setCountry(code);
  }

  function pickLocale(next: Locale) {
    setLocale(next);
    onChange?.(next, country);
    setOpen(false);
  }

  return (
    <div ref={rootRef} className={`cls-root ${className ?? ""}`}>
      {/* Trigger */}
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-haspopup="listbox"
        aria-expanded={open}
        className="cls-trigger"
        title={`${t("common.country")} · ${t("common.language")}`}
      >
        <img
          src={activeCountry.flagUrl}
          alt={activeCountry.name}
          className="cls-flag"
          loading="lazy"
        />
        {!compact && <span className="cls-trigger-label">{activeLabel.short}</span>}
        <svg
          viewBox="0 0 16 16"
          className={`cls-caret${open ? " is-open" : ""}`}
          fill="none"
          aria-hidden="true"
        >
          <path
            d="M4 6l4 4 4-4"
            stroke="currentColor"
            strokeWidth="1.5"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>
      </button>

      {dropdown && typeof document !== "undefined"
        ? createPortal(dropdown, document.body)
        : null}
    </div>
  );
}
