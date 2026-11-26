import { followUpDayToDate, parseFollowUpDay } from "../followUp";
import { formatZoned, isValidTimeZone } from "../zonedTime";

/**
 * One-time calendar export (issue #969, calendar-export.md). Client-safe and
 * framework-free: the download routes build the file, the tests read it.
 *
 * A small RFC 5545 writer instead of a dependency: two event shapes, plain
 * text only. It handles what a serializer must:
 *
 * - TEXT escaping (backslash, semicolon, comma, newline);
 * - CRLF line endings;
 * - folding at 75 octets of UTF-8, never inside a multi-byte character.
 *
 * What goes in is the minimum: a title with the job and company, the date
 * or time, and a link back to the application. Never notes, messages,
 * sender/recipient, attachments or CV text. A plain calendar object: no
 * iTIP METHOD (PUBLISH would require an ORGANIZER), no ORGANIZER or
 * ATTENDEE, so importing it can't send an invitation.
 *
 * - A follow-up date is a calendar day (follow-up-dates.md), so it is an
 *   all-day event: `DTSTART;VALUE=DATE` with the exclusive next day as
 *   `DTEND`. A floating date has no time zone to move it.
 * - An interview is the saved instant, written in UTC (`…Z`). That names
 *   the same moment in every client and across daylight-saving changes,
 *   with no VTIMEZONE to get wrong; the calendar shows it in the viewer's
 *   zone and the description repeats the time as saved, in its zone.
 *   No duration is recorded, so none is invented: no DTEND, which RFC 5545
 *   reads as an event ending when it starts.
 *
 * The UID is stable per follow-up / interview. Some calendars replace the
 * earlier import when it is imported again; not all do.
 */

export const ICS_CONTENT_TYPE = "text/calendar; charset=utf-8";
export const PRODID = "-//ASafariM//ResuMatch//EN";
const UID_DOMAIN = "resumatch.asafarim.com";

/** RFC 5545 §3.3.11 TEXT escaping. CR is dropped, LF becomes `\n`. */
export function escapeText(value: string): string {
  return value
    .replace(/\\/g, "\\\\")
    .replace(/;/g, "\\;")
    .replace(/,/g, "\\,")
    .replace(/\r\n?/g, "\n")
    .replace(/\n/g, "\\n");
}

/** RFC 5545 §3.1: lines longer than 75 octets continue on the next line
 *  after CRLF + one space. Splits only between characters. */
export function foldLine(line: string): string {
  const encoder = new TextEncoder();
  if (encoder.encode(line).length <= 75) return line;
  const out: string[] = [];
  let current = "";
  let size = 0;
  // The first line holds 75 octets; continuation lines start with a space,
  // so they hold 74 more.
  let limit = 75;
  for (const char of line) {
    const bytes = encoder.encode(char).length;
    if (size + bytes > limit) {
      out.push(current);
      current = "";
      size = 0;
      limit = 74;
    }
    current += char;
    size += bytes;
  }
  out.push(current);
  return out.join("\r\n ");
}

const pad = (n: number, w = 2) => String(n).padStart(w, "0");

/** `20261203` */
function icsDate(day: string): string {
  return day.replace(/-/g, "");
}

/** `20261120T133000Z` */
export function icsUtc(date: Date): string {
  return (
    `${pad(date.getUTCFullYear(), 4)}${pad(date.getUTCMonth() + 1)}${pad(date.getUTCDate())}` +
    `T${pad(date.getUTCHours())}${pad(date.getUTCMinutes())}${pad(date.getUTCSeconds())}Z`
  );
}

function nextDay(day: string): string {
  const date = followUpDayToDate(day);
  date.setUTCDate(date.getUTCDate() + 1);
  return date.toISOString().slice(0, 10);
}

/** Only what an event needs; nothing private can be passed in. */
export interface CalendarJob {
  applicationId: string;
  jobTitle: string | null;
  employer: string | null;
}

/** Already-translated wording (lib/i18n/calendar.ts), so this module stays
 *  free of the i18n runtime. */
export interface CalendarWording {
  /** "Follow up: {job}" */
  followUpTitle: (job: string) => string;
  /** "Interview: {job}" */
  interviewTitle: (job: string) => string;
  /** "{title} at {employer}" */
  jobAt: (title: string, employer: string) => string;
  untitledJob: string;
  /** "Application in ResuMatch: {url}" */
  link: (url: string) => string;
  /** "Time as saved in ResuMatch: {time} ({zone})" */
  savedTime: (time: string, zone: string) => string;
  /** "Exported once from ResuMatch: changes there don't update this event." */
  oneTime: string;
}

export function jobLabel(job: CalendarJob, wording: CalendarWording): string {
  const title = job.jobTitle?.trim() || null;
  const employer = job.employer?.trim() || null;
  if (title && employer) return wording.jobAt(title, employer);
  return title ?? employer ?? wording.untitledJob;
}

function applicationUrl(appUrl: string, applicationId: string): string {
  return `${appUrl.replace(/\/+$/, "")}/applications/${encodeURIComponent(applicationId)}/timeline`;
}

function calendar(lines: string[]): string {
  return [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    `PRODID:${PRODID}`,
    "CALSCALE:GREGORIAN",
    ...lines,
    "END:VCALENDAR",
  ]
    .map(foldLine)
    .join("\r\n")
    .concat("\r\n");
}

export interface FollowUpEventInput {
  job: CalendarJob;
  /** `YYYY-MM-DD` as stored (followUpDateToDay). */
  day: string;
  appUrl: string;
  wording: CalendarWording;
  now: Date;
}

/** An all-day event on exactly that day, or null for a missing or invalid
 *  day (never an invalid file). */
export function followUpCalendar(input: FollowUpEventInput): string | null {
  const day = parseFollowUpDay(input.day);
  if (!day) return null;
  const url = applicationUrl(input.appUrl, input.job.applicationId);
  return calendar([
    "BEGIN:VEVENT",
    `UID:follow-up-${input.job.applicationId}@${UID_DOMAIN}`,
    `DTSTAMP:${icsUtc(input.now)}`,
    `DTSTART;VALUE=DATE:${icsDate(day)}`,
    `DTEND;VALUE=DATE:${icsDate(nextDay(day))}`,
    `SUMMARY:${escapeText(input.wording.followUpTitle(jobLabel(input.job, input.wording)))}`,
    `DESCRIPTION:${escapeText(`${input.wording.link(url)}\n${input.wording.oneTime}`)}`,
    `URL:${url}`,
    "TRANSP:TRANSPARENT",
    "END:VEVENT",
  ]);
}

export interface InterviewEventInput {
  job: CalendarJob;
  eventId: string;
  occurredAt: Date;
  timeZone: string;
  appUrl: string;
  locale: string;
  wording: CalendarWording;
  now: Date;
}

export function interviewCalendar(input: InterviewEventInput): string | null {
  if (Number.isNaN(input.occurredAt.getTime())) return null;
  const zone = isValidTimeZone(input.timeZone) ? input.timeZone : "UTC";
  const url = applicationUrl(input.appUrl, input.job.applicationId);
  const saved = input.wording.savedTime(formatZoned(input.occurredAt, zone, input.locale), zone);
  return calendar([
    "BEGIN:VEVENT",
    `UID:interview-${input.eventId}@${UID_DOMAIN}`,
    `DTSTAMP:${icsUtc(input.now)}`,
    `DTSTART:${icsUtc(input.occurredAt)}`,
    `SUMMARY:${escapeText(input.wording.interviewTitle(jobLabel(input.job, input.wording)))}`,
    `DESCRIPTION:${escapeText(`${saved}\n${input.wording.link(url)}\n${input.wording.oneTime}`)}`,
    `URL:${url}`,
    "END:VEVENT",
  ]);
}

const UNSAFE = /[\\/:*?"<>|\u0000-\u001f\u007f]+/g;

/** "Follow-up – Data Engineer – Acme.ics": the same cleaning as the PDF
 *  names; the parts come from stored data, never from the request. */
export function calendarFilename(kind: string, job: CalendarJob): string {
  // Cut by code point, so an emoji at the limit is never split into a lone
  // surrogate (which encodeURIComponent would throw on).
  const clean = (part: string | null) =>
    part ? Array.from(part.replace(UNSAFE, " ").replace(/\s+/g, " ").trim()).slice(0, 60).join("").trim() || null : null;
  const parts = [clean(kind) ?? "Event", clean(job.jobTitle), clean(job.employer)].filter(Boolean);
  return `${parts.join(" – ")}.ics`;
}

/** RFC 6266 with an ASCII fallback that keeps the `.ics` extension. */
export function calendarContentDisposition(filename: string): string {
  const ascii =
    filename
      .normalize("NFKD")
      .replace(/[^\x20-\x7e]/g, "")
      .replace(/["\\]/g, "")
      .replace(/\s+/g, " ")
      .replace(/^[\s.-]+/, "")
      .trim() || "event.ics";
  const fallback = ascii.toLowerCase().endsWith(".ics") && ascii.length > 4 ? ascii : "event.ics";
  // RFC 8187 attr-chars exclude ' ( ) *, which encodeURIComponent leaves.
  const extended = encodeURIComponent(filename).replace(/['()*]/g, (c) => `%${c.charCodeAt(0).toString(16).toUpperCase()}`);
  return `attachment; filename="${fallback}"; filename*=UTF-8''${extended}`;
}
