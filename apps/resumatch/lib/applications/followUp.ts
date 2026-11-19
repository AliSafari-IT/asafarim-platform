import type { ApplicationStatusName } from "./constants";

/**
 * The follow-up date contract (issue #896). Client-safe and framework-free,
 * so the API, the list row and the later due filters (#897) share it.
 *
 * A follow-up date is a calendar day the candidate picked ("follow up on
 * 3 December"), not an instant. Time zones must never move it to another
 * day, so:
 *
 * - On the wire it is a day string, `YYYY-MM-DD`.
 * - In the database (`Application.followUpDate`, a `DateTime`) it is that
 *   day at 00:00 UTC. Every write goes through `parseFollowUpDay`, so new
 *   rows are always UTC midnight.
 * - Reading always takes the UTC calendar date (`followUpDateToDay`). For a
 *   legacy row written as a timestamp before #896 (the API used to store
 *   any ISO instant as is), that is the day of the instant in UTC. Nothing
 *   in the UI could write one, so this only affects direct API callers.
 *   Re-saving such a row stores it as UTC midnight.
 *
 * "Today" is the candidate's own calendar day, in the browser's time zone
 * (`todayInTimeZone`). It is never the server's day: a candidate in
 * Auckland and one in Los Angeles see a 3 December follow-up become "today"
 * on their own 3 December. Anything server side that needs "today" (such as
 * a due filter) must take that day from the client, then compare days.
 */

/** Earliest and latest day accepted. A range this wide covers any real
 *  follow-up, and rejects a year typed digit by digit ("0002-…"). */
export const FOLLOW_UP_MIN_DAY = "2000-01-01";
export const FOLLOW_UP_MAX_DAY = "2100-12-31";

const DAY = /^(\d{4})-(\d{2})-(\d{2})$/;

/** `YYYY-MM-DD` if it names a real calendar day within the accepted range,
 *  else null. "2026-02-30" and "2026-13-01" are rejected rather than rolled
 *  over to a different day. */
export function parseFollowUpDay(value: string): string | null {
  const match = DAY.exec(value);
  if (!match) return null;
  const [, y, m, d] = match;
  const date = new Date(Date.UTC(Number(y), Number(m) - 1, Number(d)));
  // Date.UTC treats years 0-99 as 1900-1999; the range check below rejects
  // those anyway, and a real date round-trips exactly.
  if (date.getUTCFullYear() !== Number(y) || date.getUTCMonth() !== Number(m) - 1 || date.getUTCDate() !== Number(d)) {
    return null;
  }
  if (value < FOLLOW_UP_MIN_DAY || value > FOLLOW_UP_MAX_DAY) return null;
  return value;
}

/** The stored value for a day: that day at 00:00 UTC. */
export function followUpDayToDate(day: string): Date {
  const [y, m, d] = day.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d));
}

/** The day a stored value stands for: its UTC calendar date. */
export function followUpDateToDay(date: Date | string | null | undefined): string | null {
  if (date === null || date === undefined) return null;
  const value = typeof date === "string" ? new Date(date) : date;
  if (Number.isNaN(value.getTime())) return null;
  return value.toISOString().slice(0, 10);
}

/** The calendar day it is at `now` in `timeZone` (an IANA zone; the
 *  runtime's own zone when omitted, which in the browser is the
 *  candidate's). */
export function todayInTimeZone(now: Date, timeZone?: string): string {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(now);
  const get = (type: string) => parts.find((part) => part.type === type)?.value ?? "";
  return `${get("year")}-${get("month")}-${get("day")}`;
}

/** Statuses where the process has ended: the date is kept, but there is
 *  nothing left to chase, so no due badge. Moving the application back to
 *  an open status shows the badge again. */
export const FOLLOW_UP_CLOSED_STATUSES: readonly ApplicationStatusName[] = ["OFFER", "REJECTED"];

export type FollowUpDueState = "overdue" | "today" | "upcoming";

/** Whether a follow-up is overdue, due today or still ahead, compared as
 *  days (string order is calendar order for `YYYY-MM-DD`). Null when there
 *  is no date or the application is closed. */
export function followUpDueState(
  day: string | null,
  today: string,
  status: ApplicationStatusName,
): FollowUpDueState | null {
  if (!day || FOLLOW_UP_CLOSED_STATUSES.includes(status)) return null;
  if (day < today) return "overdue";
  if (day === today) return "today";
  return "upcoming";
}

/** A day for people to read, in their locale. Formatted in UTC because the
 *  day is stored as UTC midnight; formatting it in the viewer's zone would
 *  show the day before for everyone west of Greenwich. */
export function formatFollowUpDay(day: string, locale: string): string {
  return new Intl.DateTimeFormat(locale, { dateStyle: "medium", timeZone: "UTC" }).format(followUpDayToDate(day));
}
