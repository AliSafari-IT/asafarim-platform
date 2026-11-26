import "server-only";
import { getJobmatchDb } from "../../db/client";
import { getEnv } from "../../env";
import { followUpDateToDay } from "../followUp";
import {
  calendarContentDisposition,
  calendarFilename,
  followUpCalendar,
  ICS_CONTENT_TYPE,
  interviewCalendar,
  type CalendarJob,
  type CalendarWording,
} from "./ics";

/**
 * Loads the saved data for a calendar download (#969), always scoped to
 * `{ id, workspaceId }`: another workspace's id answers exactly like an
 * unknown one. Selects only what goes in the file, so notes, messages and
 * attachments are never even read.
 */

type Translate = (key: string, vars?: Record<string, string | number>) => string;

export function calendarWording(t: Translate): CalendarWording {
  return {
    followUpTitle: (job) => t("resumatch.cal.event.followUpTitle", { job }),
    interviewTitle: (job) => t("resumatch.cal.event.interviewTitle", { job }),
    jobAt: (title, employer) => t("resumatch.cal.event.jobAt", { title, employer }),
    untitledJob: t("resumatch.cal.event.untitled"),
    link: (url) => t("resumatch.cal.event.link", { url }),
    savedTime: (time, zone) => t("resumatch.cal.event.savedTime", { time, zone }),
    oneTime: t("resumatch.cal.event.oneTime"),
  };
}

export type CalendarDownload =
  | { ok: true; body: string; filename: string }
  | { ok: false; reason: "not_found" | "no_date" };

const jobSelect = { select: { title: true, employer: true } } as const;

export async function followUpDownload(
  workspaceId: string,
  applicationId: string,
  t: Translate,
  now = new Date(),
): Promise<CalendarDownload> {
  const app = await getJobmatchDb().application.findFirst({
    where: { id: applicationId, workspaceId },
    select: { id: true, followUpDate: true, targetJob: jobSelect },
  });
  if (!app) return { ok: false, reason: "not_found" };
  const job: CalendarJob = { applicationId: app.id, jobTitle: app.targetJob.title, employer: app.targetJob.employer };
  const day = followUpDateToDay(app.followUpDate);
  const body = day ? followUpCalendar({ job, day, appUrl: getEnv().appUrl, wording: calendarWording(t), now }) : null;
  if (!body) return { ok: false, reason: "no_date" };
  return { ok: true, body, filename: calendarFilename(t("resumatch.cal.file.followUp"), job) };
}

export async function interviewDownload(
  workspaceId: string,
  applicationId: string,
  eventId: string,
  t: Translate,
  locale: string,
  now = new Date(),
): Promise<CalendarDownload> {
  const event = await getJobmatchDb().applicationEvent.findFirst({
    where: { id: eventId, applicationId, workspaceId },
    select: {
      id: true,
      kind: true,
      occurredAt: true,
      timeZone: true,
      application: { select: { id: true, targetJob: jobSelect } },
    },
  });
  if (!event) return { ok: false, reason: "not_found" };
  // Only interviews are exported; any other entry has no calendar event.
  if (event.kind !== "INTERVIEW") return { ok: false, reason: "no_date" };
  const job: CalendarJob = {
    applicationId: event.application.id,
    jobTitle: event.application.targetJob.title,
    employer: event.application.targetJob.employer,
  };
  const body = interviewCalendar({
    job,
    eventId: event.id,
    occurredAt: event.occurredAt,
    timeZone: event.timeZone,
    appUrl: getEnv().appUrl,
    locale,
    wording: calendarWording(t),
    now,
  });
  if (!body) return { ok: false, reason: "no_date" };
  return { ok: true, body, filename: calendarFilename(t("resumatch.cal.file.interview"), job) };
}

/** The download response. Private and uncached; nosniff so a browser never
 *  treats it as anything but a calendar file. */
export function calendarResponse(result: CalendarDownload): Response {
  if (!result.ok) {
    return result.reason === "not_found"
      ? Response.json({ error: "Not found", code: "NOT_FOUND" }, { status: 404 })
      : Response.json({ error: "There is no saved date to add to a calendar.", code: "NO_DATE" }, { status: 409 });
  }
  return new Response(result.body, {
    headers: {
      "content-type": ICS_CONTENT_TYPE,
      "content-disposition": calendarContentDisposition(result.filename),
      "cache-control": "private, no-store",
      "x-content-type-options": "nosniff",
    },
  });
}
