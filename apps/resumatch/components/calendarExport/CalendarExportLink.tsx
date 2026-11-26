"use client";

import { useId } from "react";
import { useTranslation } from "@asafarim/shared-i18n";

/**
 * "Add to calendar" (#969, calendar-export.md): a plain download link to
 * the owner-only .ics route, with the one-time-export note beside it. A
 * link, not a request from script, so nothing about the application
 * changes and the browser handles the file like any download.
 */
export function CalendarExportLink({
  href,
  testId,
}: {
  href: string;
  testId: string;
}) {
  const { t } = useTranslation();
  const noteId = useId();
  return (
    <div className="rm-cal" data-testid={testId}>
      <a
        className="ui-btn ui-btn--secondary ui-btn--sm rm-cal__link"
        href={href}
        download
        aria-describedby={noteId}
        data-testid={`${testId}-link`}
      >
        {t("resumatch.cal.add")}
      </a>
      <p id={noteId} className="rm-cal__note" data-testid={`${testId}-note`}>
        {t("resumatch.cal.note")}
      </p>
    </div>
  );
}
