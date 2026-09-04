/**
 * Deterministic `My-Job` CSV export (JM-051, JM-053).
 *
 * Two properties this module holds itself to:
 *
 * **Deterministic.** The same tracked-job rows always produce the exact
 * same bytes: a fixed, versioned column order, no locale-dependent number
 * or date formatting, and no timestamp of "when this export ran" mixed
 * into the data rows (it belongs in the filename, not the content) — so a
 * candidate's own diff tool can tell them what actually changed between
 * two exports of their tracker.
 *
 * **Safe to open.** A CSV cell that starts with `=`, `+`, `-`, or `@` is
 * executed as a formula by Excel, Google Sheets, and most spreadsheet
 * software the moment the file is opened — a posting title or note
 * containing one is untrusted text (the title came from a job source, the
 * note is free-typed by the candidate) reaching an application that will
 * run it. `escapeFormula` neutralises that before `escapeCsvField` handles
 * ordinary CSV quoting.
 */

export const MY_JOB_EXPORT_VERSION = "1.0.0";

export const MY_JOB_CSV_COLUMNS = [
  "exportVersion",
  "status",
  "title",
  "employer",
  "location",
  "canonicalUrl",
  "notes",
  "appliedAt",
  "interviewAt",
  "followUpAt",
  "trackedSince",
] as const;

export interface MyJobExportRow {
  status: string;
  title: string;
  employer: string;
  location: string | null;
  canonicalUrl: string;
  notes: string | null;
  appliedAt: Date | null;
  interviewAt: Date | null;
  followUpAt: Date | null;
  trackedSince: Date;
}

/** A leading `=`, `+`, `-`, or `@` is prefixed with a `'` so spreadsheet
 *  software treats the cell as text rather than evaluating it as a formula
 *  the moment the file is opened. */
function escapeFormula(value: string): string {
  return /^[=+\-@]/.test(value) ? `'${value}` : value;
}

/** Quotes a field only when it needs it, and always escapes embedded
 *  quotes — RFC 4180, not a locale-specific spreadsheet convention. */
function escapeCsvField(value: string): string {
  const safe = escapeFormula(value);
  if (/[",\n\r]/.test(safe)) {
    return `"${safe.replace(/"/g, '""')}"`;
  }
  return safe;
}

/** ISO 8601, UTC, no locale — the one date format that reads back
 *  identically regardless of where the file is opened. */
function formatDate(value: Date | null): string {
  return value ? value.toISOString() : "";
}

export function buildMyJobCsv(rows: MyJobExportRow[]): string {
  const header = MY_JOB_CSV_COLUMNS.join(",");
  const lines = rows.map((row) =>
    [
      MY_JOB_EXPORT_VERSION,
      row.status,
      row.title,
      row.employer,
      row.location ?? "",
      row.canonicalUrl,
      row.notes ?? "",
      formatDate(row.appliedAt),
      formatDate(row.interviewAt),
      formatDate(row.followUpAt),
      formatDate(row.trackedSince),
    ]
      .map((value) => escapeCsvField(String(value)))
      .join(","),
  );
  // CRLF line endings: the RFC 4180 convention that keeps the file
  // unambiguous for Excel, the most common consumer of a My-Job export.
  return [header, ...lines].join("\r\n");
}
