"use client";

import { useEffect, useState } from "react";

function utc(iso: string): string {
  return `${iso.slice(0, 10)} ${iso.slice(11, 16)} UTC`;
}

/**
 * Server and first client paint show a deterministic UTC stamp (a
 * locale-formatted server render caused hydration mismatches elsewhere in
 * this app — see tailor/history/HistoryList.tsx); after mount it switches
 * to the viewer's own locale and timezone. The machine-readable instant
 * stays in `dateTime` either way.
 */
export function LocalTime({ iso, dateOnly = false }: { iso: string; dateOnly?: boolean }) {
  const [text, setText] = useState(() => (dateOnly ? iso.slice(0, 10) : utc(iso)));
  useEffect(() => {
    const date = new Date(iso);
    setText(
      new Intl.DateTimeFormat(undefined, dateOnly ? { dateStyle: "medium" } : { dateStyle: "medium", timeStyle: "short" }).format(date),
    );
  }, [iso, dateOnly]);
  return <time dateTime={iso}>{text}</time>;
}

/**
 * "Totals use UTC day boundaries" explained in the viewer's timezone, so
 * a late-evening call landing in "tomorrow's" UTC day is not a surprise.
 */
export function RangeNote({ from, to }: { from: string; to: string }) {
  const [zone, setZone] = useState<string | null>(null);
  const [local, setLocal] = useState<string | null>(null);
  useEffect(() => {
    const fmt = new Intl.DateTimeFormat(undefined, { dateStyle: "medium", timeStyle: "short" });
    setZone(Intl.DateTimeFormat().resolvedOptions().timeZone);
    setLocal(`${fmt.format(new Date(from))} – ${fmt.format(new Date(to))}`);
  }, [from, to]);
  return (
    <p className="rm-cost-range">
      Totals cover {utc(from)} up to {utc(to)} (UTC day boundaries)
      {zone && local ? (
        <>
          {" "}
          — that is {local} in your timezone ({zone}).
        </>
      ) : (
        "."
      )}
    </p>
  );
}
