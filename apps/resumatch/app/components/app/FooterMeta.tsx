"use client";

import { createContext, useContext, useEffect, useState, type ReactNode } from "react";
import { useTranslation } from "@asafarim/shared-i18n";

/**
 * The footer's last line: "asafarim-platform | ResuMatch app | <date>".
 * On a CV page the date is that CV's own date (set by <FooterDate>, which
 * the page renders); everywhere else it is the app's version. The footer
 * lives in the root layout, which can't read the page's data, so the page
 * hands its date over through this context.
 */
const FooterDateContext = createContext<{ date: string | null; setDate: (date: string | null) => void } | null>(null);

export function FooterMetaProvider({ children }: { children: ReactNode }) {
  const [date, setDate] = useState<string | null>(null);
  return <FooterDateContext.Provider value={{ date, setDate }}>{children}</FooterDateContext.Provider>;
}

export function FooterMeta({ version }: { version: string }) {
  const { t, locale } = useTranslation();
  const date = useContext(FooterDateContext)?.date ?? null;
  const parsed = date ? new Date(date) : null;
  const valid = parsed && !Number.isNaN(parsed.getTime()) ? parsed : null;
  return (
    <span data-testid="footer-meta">
      asafarim-platform | ResuMatch app |{" "}
      {valid ? (
        <time dateTime={valid.toISOString()} title={t("resumatch.footer.cvDate", { date: formatDate(valid, locale) })}>
          {formatDate(valid, locale)}
        </time>
      ) : (
        <>v{version}</>
      )}
    </span>
  );
}

function formatDate(date: Date, locale: string): string {
  try {
    return new Intl.DateTimeFormat(locale, { day: "numeric", month: "short", year: "numeric" }).format(date);
  } catch {
    return date.toISOString().slice(0, 10);
  }
}

/** Rendered by a CV page: puts the CV's date in the footer while it is shown. */
export function FooterDate({ date }: { date: string }) {
  const setDate = useContext(FooterDateContext)?.setDate;
  useEffect(() => {
    if (!setDate) return;
    setDate(date);
    return () => setDate(null);
  }, [date, setDate]);
  return null;
}
