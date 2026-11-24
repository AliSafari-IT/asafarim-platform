import { lastNDays } from "../../app/components/app/Charts";
import { parseStatusChange } from "./applicationEntries";

/**
 * The /tailor "Last 14 days" chart: several daily series over one window
 * (issue #943). Pure, so the page only queries and this only counts.
 * Days are UTC, the same as `lastNDays`.
 */

export type ActivitySeriesKey = "tailored" | "coverLetters" | "applied" | "responses";

export const ACTIVITY_SERIES_KEYS: readonly ActivitySeriesKey[] = ["tailored", "coverLetters", "applied", "responses"];

export interface ActivitySeries {
  key: ActivitySeriesKey;
  label: string;
  total: number;
  /** One count per entry of `days`, same order. */
  counts: number[];
}

export interface ActivitySeriesData {
  /** YYYY-MM-DD (UTC), oldest first. */
  days: string[];
  series: ActivitySeries[];
}

/** Turn raw timestamps per series into one contiguous, zero-filled window. */
export function buildActivitySeries(
  dates: Record<ActivitySeriesKey, Date[]>,
  labels: Record<ActivitySeriesKey, string>,
  n: number,
  now = new Date(),
): ActivitySeriesData {
  const days = lastNDays([], n, now).map((d) => d.day);
  const series = ACTIVITY_SERIES_KEYS.map((key) => {
    const counts = lastNDays(dates[key], n, now).map((d) => d.count);
    return { key, label: labels[key], total: counts.reduce((a, b) => a + b, 0), counts };
  });
  return { days, series };
}

/** The statuses that mean the employer answered. */
const RESPONSE_STATUSES = new Set(["INTERVIEWING", "OFFER", "REJECTED"]);

/**
 * When an employer answered: one timestamp per `application.status_changed`
 * audit event that moved an application to Interviewing, Offer or
 * Rejected. Malformed rows are skipped. An application that goes to
 * Interviewing and later to Offer counts on both days.
 */
export function responseDates(events: { createdAt: Date; metadata: unknown }[]): Date[] {
  return responseEvents(events).map((e) => e.createdAt);
}

function responseEvents(events: { createdAt: Date; metadata: unknown }[]) {
  return events.flatMap((e) => {
    const change = parseStatusChange(e.metadata);
    return change !== null && RESPONSE_STATUSES.has(change.toStatus)
      ? [{ createdAt: e.createdAt, applicationId: change.applicationId }]
      : [];
  });
}

/**
 * How many of the applications applied in the window got a response
 * (Interviewing, Offer or Rejected) in the window. Each application counts
 * once, however many responses it had, so the rate never passes 100%; a
 * response to an application applied before the window doesn't count.
 */
export function answeredAppliedCount(
  appliedIds: string[],
  events: { createdAt: Date; metadata: unknown }[],
): number {
  const answered = new Set(responseEvents(events).map((e) => e.applicationId));
  return new Set(appliedIds.filter((id) => answered.has(id))).size;
}

type Translate = (key: string, vars?: Record<string, string | number>) => string;

const plural = (n: number) => (n === 1 ? "one" : "other");

/**
 * The subtitle under the chart: "17 tailored CVs, 6 applied, 1 response
 * (17% of applied)." The counts are events, like the bars; the rate is
 * `answeredApplied` (see `answeredAppliedCount`) over the applied count, so
 * it is a share of applications, at most 100%. It is left out when nothing
 * was applied, and a degraded-run note is added only when there were any.
 */
export function activityFunnelLine(
  t: Translate,
  totals: { tailored: number; applied: number; responses: number },
  degraded: number,
  answeredApplied: number,
): string {
  const parts = [
    t(`resumatch.tailor.activity.funnel.tailored.${plural(totals.tailored)}`, { count: totals.tailored }),
    t("resumatch.tailor.activity.funnel.applied", { count: totals.applied }),
    t(`resumatch.tailor.activity.funnel.responses.${plural(totals.responses)}`, { count: totals.responses }),
  ].join(", ");
  const rate =
    totals.applied > 0
      ? ` ${t("resumatch.tailor.activity.funnel.rate", { percent: Math.round((Math.min(answeredApplied, totals.applied) / totals.applied) * 100) })}`
      : "";
  const sentence = t("resumatch.tailor.activity.funnel.sentence", { parts, rate });
  return degraded > 0
    ? `${sentence} ${t(`resumatch.tailor.activity.funnel.degraded.${plural(degraded)}`, { count: degraded })}`
    : sentence;
}
