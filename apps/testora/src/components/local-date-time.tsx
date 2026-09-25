"use client";

import { useEffect, useState } from "react";

const UTC_FORMAT = new Intl.DateTimeFormat("en-GB", {
  timeZone: "UTC",
  day: "2-digit",
  month: "2-digit",
  year: "numeric",
  hour: "2-digit",
  minute: "2-digit",
  second: "2-digit",
});

/**
 * A timestamp that hydrates cleanly. `toLocaleString()` during render differs
 * between the server (its locale + UTC in production) and the browser (the
 * user's locale + timezone), which made React throw a hydration error and
 * re-render the whole page on the client. This renders a fixed UTC format
 * first — identical on both sides — then switches to the viewer's local time
 * after mount.
 */
export function LocalDateTime({ value }: { value: string | number | Date }) {
  const date = new Date(value);
  const [local, setLocal] = useState<string | null>(null);

  useEffect(() => {
    setLocal(date.toLocaleString());
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [date.getTime()]);

  return (
    <time dateTime={date.toISOString()} title={date.toISOString()}>
      {local ?? `${UTC_FORMAT.format(date)} UTC`}
    </time>
  );
}
