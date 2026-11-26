"use client";

import { useEffect, useState } from "react";
import { useOptionalLocale } from "@asafarim/shared-i18n";
import { formatZoned } from "../../lib/applications/zonedTime";

/**
 * An instant shown in the zone it was recorded in, with the zone's short
 * name ("14:30 CET"). The server render and first paint show a fixed UTC
 * stamp, like LocalTime, so hydration never differs; the formatted text
 * follows after mount.
 */
export function ZonedTimeText({ iso, timeZone, testId }: { iso: string; timeZone: string | null; testId?: string }) {
  const locale = useOptionalLocale() ?? undefined;
  const [text, setText] = useState(() => `${iso.slice(0, 10)} ${iso.slice(11, 16)} UTC`);
  useEffect(() => {
    setText(formatZoned(iso, timeZone, locale));
  }, [iso, timeZone, locale]);
  return (
    <time dateTime={iso} data-testid={testId} data-zone={timeZone ?? undefined}>
      {text}
    </time>
  );
}
