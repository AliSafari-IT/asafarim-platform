"use client";

import { useEffect, useState } from "react";
import { useOptionalLocale, useTranslation } from "@asafarim/shared-i18n";

function utc(iso: string): string {
  return `${iso.slice(0, 10)} ${iso.slice(11, 16)} UTC`;
}

/**
 * Server and first client paint show a deterministic UTC stamp (a
 * locale-formatted server render caused hydration mismatches elsewhere in
 * this app — see tailor/history/HistoryList.tsx); after mount it switches
 * to the UI language (the language bar) and the viewer's own timezone. The machine-readable instant
 * stays in `dateTime` either way.
 */
export function LocalTime({ iso, dateOnly = false }: { iso: string; dateOnly?: boolean }) {
  // Optional, not useTranslation(): CostItem (and so this) also renders
  // without an I18nProvider in its server-render test.
  const locale = useOptionalLocale() ?? undefined;
  const [text, setText] = useState(() => (dateOnly ? iso.slice(0, 10) : utc(iso)));
  useEffect(() => {
    const date = new Date(iso);
    setText(
      new Intl.DateTimeFormat(locale, dateOnly ? { dateStyle: "medium" } : { dateStyle: "medium", timeStyle: "short" }).format(date),
    );
  }, [iso, dateOnly, locale]);
  return <time dateTime={iso}>{text}</time>;
}

/**
 * "Totals use UTC day boundaries" explained in the viewer's timezone, so
 * a late-evening call landing in "tomorrow's" UTC day is not a surprise.
 */
export function RangeNote({ from, to }: { from: string; to: string }) {
  const { t, locale } = useTranslation();
  const [zone, setZone] = useState<string | null>(null);
  const [local, setLocal] = useState<string | null>(null);
  useEffect(() => {
    const fmt = new Intl.DateTimeFormat(locale, { dateStyle: "medium", timeStyle: "short" });
    setZone(Intl.DateTimeFormat().resolvedOptions().timeZone);
    setLocal(`${fmt.format(new Date(from))} – ${fmt.format(new Date(to))}`);
  }, [from, to, locale]);
  return (
    <p className="rm-cost-range">
      {zone && local
        ? t("resumatch.cost.range.local", { from: utc(from), to: utc(to), local, zone })
        : t("resumatch.cost.range.utc", { from: utc(from), to: utc(to) })}
    </p>
  );
}
