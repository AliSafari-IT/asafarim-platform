import { describe, expect, it } from "vitest";
import {
  calendarContentDisposition,
  calendarFilename,
  escapeText,
  foldLine,
  followUpCalendar,
  interviewCalendar,
  type CalendarWording,
} from "./ics";
import { zonedLocalToUtc } from "../zonedTime";

const wording: CalendarWording = {
  followUpTitle: (job) => `Follow up: ${job}`,
  interviewTitle: (job) => `Interview: ${job}`,
  jobAt: (title, employer) => `${title} at ${employer}`,
  untitledJob: "Job application",
  link: (url) => `Application in ResuMatch: ${url}`,
  savedTime: (time, zone) => `Time as saved in ResuMatch: ${time} (${zone})`,
  oneTime: "Exported once from ResuMatch.",
};
const job = { applicationId: "app_1", jobTitle: "Data Engineer", employer: "Acme" };
const NOW = new Date("2026-11-26T12:00:00Z");
const APP_URL = "https://resumatch.asafarim.com";

/** Unfolds and splits into "NAME[;params]" → value, as a parser would. */
function props(ics: string): Map<string, string> {
  const map = new Map<string, string>();
  for (const line of ics.replace(/\r\n /g, "").split("\r\n")) {
    const i = line.indexOf(":");
    if (i > 0) map.set(line.slice(0, i), line.slice(i + 1));
  }
  return map;
}

describe("escapeText", () => {
  it("escapes backslash, semicolon, comma and newlines", () => {
    expect(escapeText("a\\b;c,d\r\ne\nf")).toBe("a\\\\b\\;c\\,d\\ne\\nf");
  });
});

describe("foldLine", () => {
  it("leaves short lines alone", () => {
    expect(foldLine("SUMMARY:short")).toBe("SUMMARY:short");
  });
  it("folds at 75 octets and never splits a multi-byte character", () => {
    const line = `SUMMARY:${"é".repeat(60)}${"💼".repeat(10)}`;
    const folded = foldLine(line);
    const parts = folded.split("\r\n");
    const enc = new TextEncoder();
    expect(enc.encode(parts[0]).length).toBeLessThanOrEqual(75);
    for (const part of parts.slice(1)) {
      expect(part.startsWith(" ")).toBe(true);
      expect(enc.encode(part).length).toBeLessThanOrEqual(75);
    }
    expect(folded.replace(/\r\n /g, "")).toBe(line);
    expect(folded).not.toContain("�");
  });
});

describe("followUpCalendar", () => {
  it("is an all-day event on exactly the saved day", () => {
    const ics = followUpCalendar({ job, day: "2026-12-03", appUrl: APP_URL, wording, now: NOW })!;
    const p = props(ics);
    expect(p.get("DTSTART;VALUE=DATE")).toBe("20261203");
    expect(p.get("DTEND;VALUE=DATE")).toBe("20261204");
    expect(p.get("SUMMARY")).toBe("Follow up: Data Engineer at Acme");
    expect(p.get("UID")).toBe("follow-up-app_1@resumatch.asafarim.com");
    expect(p.get("URL")).toBe("https://resumatch.asafarim.com/applications/app_1/timeline");
    expect(p.get("DTSTAMP")).toBe("20261126T120000Z");
    expect(ics).not.toMatch(/DTSTART:|TZID/);
  });

  it("rolls over month and year ends for the exclusive end day", () => {
    expect(props(followUpCalendar({ job, day: "2026-12-31", appUrl: APP_URL, wording, now: NOW })!).get("DTEND;VALUE=DATE")).toBe("20270101");
    expect(props(followUpCalendar({ job, day: "2028-02-28", appUrl: APP_URL, wording, now: NOW })!).get("DTEND;VALUE=DATE")).toBe("20280229");
  });

  it("does not depend on the runtime time zone", () => {
    // The day is a string end to end; nothing goes through local time.
    const ics = followUpCalendar({ job, day: "2026-03-29", appUrl: APP_URL, wording, now: NOW })!;
    expect(props(ics).get("DTSTART;VALUE=DATE")).toBe("20260329");
  });

  it("refuses a missing or invalid day instead of writing a broken file", () => {
    expect(followUpCalendar({ job, day: "", appUrl: APP_URL, wording, now: NOW })).toBeNull();
    expect(followUpCalendar({ job, day: "2026-02-30", appUrl: APP_URL, wording, now: NOW })).toBeNull();
  });

  it("is a well-formed calendar: CRLF only, PUBLISH, no attendee or organizer", () => {
    const ics = followUpCalendar({ job, day: "2026-12-03", appUrl: APP_URL, wording, now: NOW })!;
    expect(ics.startsWith("BEGIN:VCALENDAR\r\nVERSION:2.0\r\n")).toBe(true);
    expect(ics.endsWith("END:VCALENDAR\r\n")).toBe(true);
    expect(ics.replace(/\r\n/g, "")).not.toMatch(/[\r\n]/);
    expect(ics).not.toMatch(/METHOD|ATTENDEE|ORGANIZER|VALARM/);
  });

  it("keeps Unicode and punctuation, escaped", () => {
    const ics = followUpCalendar({
      job: { applicationId: "app_2", jobTitle: "Développeur, Full-stack; R&D \\ “Ops”", employer: "Zürich AG" },
      day: "2026-12-03",
      appUrl: APP_URL,
      wording,
      now: NOW,
    })!;
    expect(props(ics).get("SUMMARY")).toBe("Follow up: Développeur\\, Full-stack\\; R&D \\\\ “Ops” at Zürich AG");
  });

  it("falls back to a neutral title with no job details", () => {
    const ics = followUpCalendar({ job: { applicationId: "a", jobTitle: null, employer: "  " }, day: "2026-12-03", appUrl: APP_URL, wording, now: NOW })!;
    expect(props(ics).get("SUMMARY")).toBe("Follow up: Job application");
  });
});

describe("interviewCalendar", () => {
  const base = { job, eventId: "evt_1", appUrl: APP_URL, locale: "en-US", wording, now: NOW };

  it("writes the saved instant in UTC, with no invented duration", () => {
    const at = zonedLocalToUtc("2026-11-24T10:00", "Europe/Brussels")!;
    const ics = interviewCalendar({ ...base, occurredAt: at, timeZone: "Europe/Brussels" })!;
    const p = props(ics);
    expect(p.get("DTSTART")).toBe("20261124T090000Z");
    expect(ics).not.toMatch(/DTEND|DURATION/);
    expect(p.get("SUMMARY")).toBe("Interview: Data Engineer at Acme");
    expect(p.get("UID")).toBe("interview-evt_1@resumatch.asafarim.com");
    expect(p.get("DESCRIPTION")).toContain("(Europe/Brussels)");
    expect(p.get("DESCRIPTION")).toContain("10:00");
  });

  it("keeps the intended wall-clock time on both sides of a daylight-saving change", () => {
    // Brussels: CEST (UTC+2) until 25 Oct 2026 03:00, CET (UTC+1) after.
    const before = zonedLocalToUtc("2026-10-24T10:00", "Europe/Brussels")!;
    const after = zonedLocalToUtc("2026-10-26T10:00", "Europe/Brussels")!;
    expect(props(interviewCalendar({ ...base, occurredAt: before, timeZone: "Europe/Brussels" })!).get("DTSTART")).toBe("20261024T080000Z");
    expect(props(interviewCalendar({ ...base, occurredAt: after, timeZone: "Europe/Brussels" })!).get("DTSTART")).toBe("20261026T090000Z");
    // New York changes on 1 Nov 2026.
    const ny = zonedLocalToUtc("2026-11-02T09:30", "America/New_York")!;
    expect(props(interviewCalendar({ ...base, occurredAt: ny, timeZone: "America/New_York" })!).get("DTSTART")).toBe("20261102T143000Z");
  });

  it("refuses an invalid instant", () => {
    expect(interviewCalendar({ ...base, occurredAt: new Date("nope"), timeZone: "UTC" })).toBeNull();
  });
});

describe("file names", () => {
  it("names the file from the job and keeps .ics in the ASCII fallback", () => {
    const name = calendarFilename("Follow-up", { applicationId: "a", jobTitle: "Ingénieur/QA: «Senior»", employer: "Zürich AG" });
    expect(name).toBe("Follow-up – Ingénieur QA «Senior» – Zürich AG.ics");
    const header = calendarContentDisposition(name);
    expect(header).toMatch(/^attachment; filename="Follow-up {1,2}Ingenieur QA Senior {1,2}Zurich AG\.ics"; filename\*=UTF-8''/);
    expect(decodeURIComponent(header.split("UTF-8''")[1])).toBe(name);
  });

  it("never splits an emoji at the length limit", () => {
    const title = `${"x".repeat(59)}💼 tail`;
    const name = calendarFilename("Follow-up", { applicationId: "a", jobTitle: title, employer: null });
    expect(name).toBe(`Follow-up – ${"x".repeat(59)}💼.ics`);
    expect(() => calendarContentDisposition(name)).not.toThrow();
  });

  it("percent-encodes ' ( ) * in filename*", () => {
    const header = calendarContentDisposition("Interview – Dev (Ops) O'Brien*.ics");
    const extended = header.split("UTF-8''")[1];
    expect(extended).not.toMatch(/['()*]/);
    expect(decodeURIComponent(extended)).toBe("Interview – Dev (Ops) O'Brien*.ics");
  });

  it("falls back to event.ics when nothing ASCII is left", () => {
    expect(calendarContentDisposition("面接.ics")).toContain('filename="event.ics"');
  });
});
