/**
 * Wall-clock times in a named time zone (application-timeline.md).
 * Client-safe and framework-free: the forms, the API and the timeline
 * share it.
 *
 * An applied time or a timeline entry is an instant. The candidate types it
 * as a wall-clock time ("20 Nov 2026, 14:30") in a time zone they can see
 * and change (their browser's by default). The server turns that pair into
 * UTC for storage and keeps the zone, so the entry shows the same wall-clock
 * time again, whoever looks at it and from wherever.
 */

/** `YYYY-MM-DDTHH:mm`, what `<input type="datetime-local">` gives. */
const LOCAL = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})$/;

export const TIME_ZONE_MAX_LENGTH = 64;

/** Earliest and latest instants accepted, the same range as follow-up days. */
export const ZONED_MIN = Date.UTC(2000, 0, 1);
export const ZONED_MAX = Date.UTC(2100, 11, 31, 23, 59);

/** True for a zone the runtime knows ("Europe/Brussels", "UTC"). */
export function isValidTimeZone(zone: string): boolean {
  if (!zone || zone.length > TIME_ZONE_MAX_LENGTH || !/^[A-Za-z0-9_+\-/]+$/.test(zone)) return false;
  try {
    new Intl.DateTimeFormat("en-US", { timeZone: zone });
    return true;
  } catch {
    return false;
  }
}

/** The browser's own zone, or UTC when the runtime can't say. */
export function runtimeTimeZone(): string {
  try {
    const zone = Intl.DateTimeFormat().resolvedOptions().timeZone;
    return zone && isValidTimeZone(zone) ? zone : "UTC";
  } catch {
    return "UTC";
  }
}

interface Parts {
  year: number;
  month: number;
  day: number;
  hour: number;
  minute: number;
}

function partsIn(instant: number, zone: string): Parts {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: zone,
    hourCycle: "h23",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  }).formatToParts(new Date(instant));
  const get = (type: string) => Number(parts.find((p) => p.type === type)?.value ?? "0");
  return { year: get("year"), month: get("month"), day: get("day"), hour: get("hour") % 24, minute: get("minute") };
}

function asUtc(p: Parts): number {
  return Date.UTC(p.year, p.month - 1, p.day, p.hour, p.minute);
}

/** The zone's offset from UTC at `instant`, in milliseconds. */
function offsetAt(instant: number, zone: string): number {
  return asUtc(partsIn(instant, zone)) - Math.floor(instant / 60_000) * 60_000;
}

/**
 * The UTC instant for a wall-clock time in `zone`, or null when the text is
 * not a real `YYYY-MM-DDTHH:mm`, the zone is unknown, or it falls outside
 * the accepted range. A time skipped by a daylight-saving jump (02:30 on
 * the spring-forward night) resolves to the instant just after the jump; an
 * hour that happens twice takes its first occurrence.
 */
export function zonedLocalToUtc(local: string, zone: string): Date | null {
  const m = LOCAL.exec(local);
  if (!m || !isValidTimeZone(zone)) return null;
  const want: Parts = { year: +m[1], month: +m[2], day: +m[3], hour: +m[4], minute: +m[5] };
  const naive = asUtc(want);
  const check = new Date(naive);
  if (
    check.getUTCFullYear() !== want.year ||
    check.getUTCMonth() !== want.month - 1 ||
    check.getUTCDate() !== want.day ||
    want.hour > 23 ||
    want.minute > 59
  ) {
    return null;
  }
  // Two passes settle the offset, including across a transition.
  let instant = naive - offsetAt(naive, zone);
  instant = naive - offsetAt(instant, zone);
  // An earlier candidate with the same wall-clock time (the first of a
  // repeated hour) wins.
  const earlier = instant - 60 * 60_000;
  if (asUtc(partsIn(earlier, zone)) === naive) instant = earlier;
  if (instant < ZONED_MIN || instant > ZONED_MAX) return null;
  return new Date(instant);
}

/** The `YYYY-MM-DDTHH:mm` an instant shows as in `zone` (for an input). */
export function utcToZonedLocal(date: Date | string, zone: string): string {
  const instant = typeof date === "string" ? Date.parse(date) : date.getTime();
  const p = partsIn(instant, isValidTimeZone(zone) ? zone : "UTC");
  const pad = (n: number, w = 2) => String(n).padStart(w, "0");
  return `${pad(p.year, 4)}-${pad(p.month)}-${pad(p.day)}T${pad(p.hour)}:${pad(p.minute)}`;
}

/** "20 Nov 2026, 14:30 CET" in the viewer's language, in the stored zone. */
export function formatZoned(date: Date | string, zone: string | null, locale?: string): string {
  const value = typeof date === "string" ? new Date(date) : date;
  const timeZone = zone && isValidTimeZone(zone) ? zone : undefined;
  // dateStyle/timeStyle can't be combined with timeZoneName.
  return new Intl.DateTimeFormat(locale, {
    year: "numeric",
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    timeZone,
    timeZoneName: "short",
  }).format(value);
}

/** Every zone the runtime lists, for the picker; `current` always included. */
export function timeZoneOptions(current: string): string[] {
  let zones: string[] = [];
  try {
    zones = (Intl as unknown as { supportedValuesOf?: (key: string) => string[] }).supportedValuesOf?.("timeZone") ?? [];
  } catch {
    zones = [];
  }
  const set = new Set(zones);
  set.add("UTC");
  if (current) set.add(current);
  return [...set].sort();
}
