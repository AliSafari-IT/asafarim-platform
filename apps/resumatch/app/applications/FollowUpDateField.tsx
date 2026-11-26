"use client";

import { useEffect, useId, useRef, useState, type KeyboardEvent } from "react";
import { useTranslation } from "@asafarim/shared-i18n";
import { Alert, Badge, Button, type BadgeTone } from "@asafarim/ui";
import type { ApplicationStatusName } from "../../lib/applications/constants";
import {
  FOLLOW_UP_MAX_DAY,
  FOLLOW_UP_MIN_DAY,
  followUpDueState,
  formatFollowUpDay,
  parseFollowUpDay,
  todayInTimeZone,
  type FollowUpDueState,
} from "../../lib/applications/followUp";
import type { FieldSaveState, FieldSaver, SaveErrorKind } from "../../lib/applications/fieldSaver";
import { CalendarExportLink } from "../../components/calendarExport/CalendarExportLink";

const DUE_TONE: Record<FollowUpDueState, BadgeTone> = {
  overdue: "danger",
  today: "warning",
  upcoming: "info",
};

/** How long a picked or typed date waits before it is saved. Picking from
 *  the calendar saves shortly after; typing a day digit by digit (which
 *  fires a change per digit) sends only the final value. Blur and Enter
 *  save at once. */
const SAVE_DELAY_MS = 800;

/** The candidate's current calendar day, in the browser's time zone. Null
 *  during the server render and hydration, because the server can't know
 *  the zone; the due badge appears once this is known. Re-checked every
 *  minute and when the tab comes back, so a page left open past midnight
 *  moves "upcoming" to "today". */
function useLocalToday(): string | null {
  const [today, setToday] = useState<string | null>(null);
  useEffect(() => {
    const update = () => setToday(todayInTimeZone(new Date()));
    update();
    const timer = window.setInterval(update, 60_000);
    document.addEventListener("visibilitychange", update);
    return () => {
      window.clearInterval(timer);
      document.removeEventListener("visibilitychange", update);
    };
  }, []);
  return today;
}

/** The follow-up date editor for one application (issue #896). The draft
 *  is a `YYYY-MM-DD` day ("" for none) and is kept on failure, like the
 *  notes draft (#895): a failed save leaves the attempted date in the
 *  field with an error and a Retry button. */
export function FollowUpDateField({
  applicationId,
  status,
  saveState,
  saver,
  draft,
  setDraft,
}: {
  applicationId: string;
  status: ApplicationStatusName;
  saveState: FieldSaveState<string>;
  saver: FieldSaver<string>;
  draft: string;
  setDraft: (value: string) => void;
}) {
  const { t, locale } = useTranslation();
  const inputId = useId();
  const describedById = useId();
  const dueId = useId();
  const today = useLocalToday();
  const timer = useRef<number | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  // The browser reports a half-typed or out-of-range date as "" with a
  // validity flag. Saving that "" would clear the stored date, so it is
  // held back and explained instead.
  const [incomplete, setIncomplete] = useState(false);

  // The input is uncontrolled. A controlled date input is reset to the
  // last accepted value after every keystroke React doesn't adopt, which
  // wipes a date being typed segment by segment (the year passes through
  // "0002", "0020", "0202", all rejected). The DOM is brought in line only
  // when the draft changes from outside: Clear, or a refresh from the
  // server.
  useEffect(() => {
    const input = inputRef.current;
    if (input && input.value !== draft && !input.validity.badInput) input.value = draft;
  }, [draft]);

  useEffect(() => () => {
    if (timer.current !== null) window.clearTimeout(timer.current);
  }, []);

  const cancelPending = () => {
    if (timer.current !== null) window.clearTimeout(timer.current);
    timer.current = null;
  };

  const saveNow = (value: string) => {
    cancelPending();
    if (value !== "" && !parseFollowUpDay(value)) return;
    saver.save(value);
  };

  const readInput = (input: HTMLInputElement): string | null => {
    const bad = input.validity.badInput || input.validity.rangeUnderflow || input.validity.rangeOverflow;
    setIncomplete(bad);
    return bad ? null : input.value;
  };

  const onChange = (input: HTMLInputElement) => {
    const value = readInput(input);
    if (value === null) {
      cancelPending();
      return;
    }
    setDraft(value);
    cancelPending();
    timer.current = window.setTimeout(() => saveNow(value), SAVE_DELAY_MS);
  };

  const onBlur = (input: HTMLInputElement) => {
    const value = readInput(input);
    if (value !== null) saveNow(value);
  };

  const onKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
    if (event.key !== "Enter") return;
    event.preventDefault();
    const value = readInput(event.currentTarget);
    if (value !== null) saveNow(value);
  };

  const clear = () => {
    setIncomplete(false);
    if (inputRef.current) inputRef.current.value = "";
    setDraft("");
    saveNow("");
  };

  const dirty = draft !== saveState.persisted;
  let statusText = "";
  if (saveState.phase === "saving") statusText = t("resumatch.app.save.saving");
  else if (saveState.phase !== "error" && dirty) statusText = t("resumatch.app.save.unsaved");
  else if (saveState.phase === "saved") statusText = t("resumatch.app.save.saved");

  // The badge follows what is saved, not the draft, so it never claims a
  // state the server doesn't have.
  const savedDay = saveState.persisted === "" ? null : saveState.persisted;
  const due = today ? followUpDueState(savedDay, today, status) : null;
  // The calendar export is the saved day only: while a different date is
  // being typed or saved, the download would not match the field.
  const exportable = savedDay !== null && !dirty && !incomplete && saveState.phase !== "saving";

  return (
    <div className="rm-followup">
      <label htmlFor={inputId} className="rm-followup__label">
        {t("resumatch.app.followUp.label")}
      </label>
      <div className="rm-followup__controls">
        <input
          id={inputId}
          type="date"
          className="ui-input rm-followup__input"
          lang={locale}
          ref={inputRef}
          defaultValue={draft}
          min={FOLLOW_UP_MIN_DAY}
          max={FOLLOW_UP_MAX_DAY}
          aria-describedby={savedDay ? `${dueId} ${describedById}` : describedById}
          aria-invalid={saveState.phase === "error" || incomplete ? true : undefined}
          onChange={(e) => onChange(e.currentTarget)}
          onBlur={(e) => onBlur(e.currentTarget)}
          onKeyDown={onKeyDown}
        />
        {draft !== "" || saveState.persisted !== "" ? (
          <Button type="button" variant="ghost" size="sm" onClick={clear}>
            {t("resumatch.app.followUp.clear")}
          </Button>
        ) : null}
        {savedDay ? (
          <span id={dueId} className="rm-followup__due">
            {due ? <Badge tone={DUE_TONE[due]}>{t(`resumatch.app.followUp.due.${due}`)}</Badge> : null}
            <time dateTime={savedDay}>{formatFollowUpDay(savedDay, locale)}</time>
          </span>
        ) : null}
      </div>
      {exportable ? (
        <CalendarExportLink href={`/api/applications/${encodeURIComponent(applicationId)}/follow-up/calendar`} testId="follow-up-calendar" />
      ) : savedDay !== null || (draft !== "" && dirty) ? (
        <p className="rm-save-status" data-testid="follow-up-calendar-pending">
          {t("resumatch.cal.saveFirst")}
        </p>
      ) : null}
      <div id={describedById}>
        {incomplete ? <p className="rm-save-status">{t("resumatch.app.followUp.incomplete")}</p> : null}
        <p className="rm-save-status" role="status" aria-live="polite">
          {statusText}
        </p>
        {saveState.phase === "error" ? (
          <div className="rm-save-error">
            <Alert tone="error">
              <p>
                {t("resumatch.app.followUp.failed")} {t(`resumatch.app.save.error.${(saveState.error ?? "server") as SaveErrorKind}`)}
              </p>
            </Alert>
            {saveState.error !== "notFound" ? (
              <Button type="button" variant="secondary" size="sm" onClick={() => saver.retry(draft)}>
                {t("resumatch.app.save.retry")}
              </Button>
            ) : null}
          </div>
        ) : null}
      </div>
    </div>
  );
}
