import { describe, expect, it } from "vitest";
import { buildMyJobCsv, MY_JOB_CSV_COLUMNS, MY_JOB_EXPORT_VERSION, type MyJobExportRow } from "./myJobCsv";

function row(overrides: Partial<MyJobExportRow> = {}): MyJobExportRow {
  return {
    status: "SAVED",
    title: "Backend Engineer",
    employer: "Example NV",
    location: "Hasselt, Belgium",
    canonicalUrl: "https://jobs.example.test/vacancy/1",
    notes: null,
    appliedAt: null,
    interviewAt: null,
    followUpAt: null,
    trackedSince: new Date("2026-09-01T00:00:00.000Z"),
    ...overrides,
  };
}

describe("My-Job CSV export", () => {
  it("emits a fixed, versioned header", () => {
    const csv = buildMyJobCsv([]);
    expect(csv).toBe(MY_JOB_CSV_COLUMNS.join(","));
  });

  it("produces the exact same bytes for the same input, twice", () => {
    const rows = [row()];
    expect(buildMyJobCsv(rows)).toBe(buildMyJobCsv(rows));
  });

  it("carries the export version on every row", () => {
    const csv = buildMyJobCsv([row()]);
    const [, dataLine] = csv.split("\r\n");
    expect(dataLine.startsWith(MY_JOB_EXPORT_VERSION + ",")).toBe(true);
  });

  it("formats dates as ISO 8601 UTC, and blanks null dates", () => {
    const csv = buildMyJobCsv([
      row({ location: "Hasselt", appliedAt: new Date("2026-08-15T09:30:00.000Z"), interviewAt: null }),
    ]);
    expect(csv).toContain("2026-08-15T09:30:00.000Z");
    const fields = csv.split("\r\n")[1].split(",");
    const interviewIndex = MY_JOB_CSV_COLUMNS.indexOf("interviewAt");
    expect(fields[interviewIndex]).toBe("");
  });

  it("neutralises a formula-injection payload in a note", () => {
    const csv = buildMyJobCsv([row({ notes: "=cmd|'/c calc'!A1" })]);
    expect(csv).toContain("'=cmd|'/c calc'!A1");
  });

  it("neutralises a formula-injection payload in a title", () => {
    const csv = buildMyJobCsv([row({ title: "+HYPERLINK(\"https://evil.test\")" })]);
    expect(csv).toContain("'+HYPERLINK");
  });

  it("quotes and escapes a field containing a comma or quote", () => {
    const csv = buildMyJobCsv([row({ employer: 'Example, "The Best" NV' })]);
    expect(csv).toContain('"Example, ""The Best"" NV"');
  });

  it("does not touch a field that merely contains those characters mid-string", () => {
    const csv = buildMyJobCsv([row({ title: "Senior C++ = Backend Engineer" })]);
    const fields = csv.split("\r\n")[1].split(",");
    const titleIndex = MY_JOB_CSV_COLUMNS.indexOf("title");
    expect(fields[titleIndex]).toBe("Senior C++ = Backend Engineer");
  });
});
