import type { ReportResultRow } from "@/lib/queries";

export interface IssueDraft {
  title: string;
  body: string;
}

// The subset of a result row needed to describe a failure — shared by the
// deterministic template and the AI generator. A full ReportResultRow satisfies
// it, so callers can pass the row straight through.
export type IssueFacts = Pick<
  ReportResultRow,
  | "caseTitle"
  | "fixtureTitle"
  | "suiteTitle"
  | "frTitle"
  | "status"
  | "targetBaseUrl"
  | "durationMs"
  | "createdAt"
  | "errorMessage"
  | "screenshot"
>;

/**
 * Build a default issue (title + markdown body) from a failed/errored result
 * row. Everything here comes off the row the Results table already has, so no
 * extra fetch is needed. The body is plain GitHub-flavoured markdown so it reads
 * well both on the issue page and once pushed to GitHub. Used both as the instant
 * seed in the UI and as the fallback when AI generation is off or fails.
 */
export function buildIssueDraft(row: IssueFacts): IssueDraft {
  const title = `[e2e] ${row.caseTitle} failed`;
  const when = new Date(row.createdAt).toLocaleString();
  const lines: string[] = [
    `**Test case:** ${row.caseTitle}`,
    `**Fixture:** ${row.fixtureTitle}`,
    `**Suite:** ${row.suiteTitle}`,
    `**Requirement:** ${row.frTitle}`,
    `**Status:** ${row.status}`,
    row.targetBaseUrl ? `**Target:** ${row.targetBaseUrl}` : null,
    row.durationMs != null ? `**Duration:** ${row.durationMs} ms` : null,
    `**When:** ${when}`,
    "",
    "## Error",
    "",
    "```",
    (row.errorMessage ?? "No error message captured.").trim(),
    "```",
  ].filter((l): l is string => l !== null);

  if (row.screenshot) {
    lines.push(
      "",
      "## Screenshot",
      "",
      "_A failure screenshot was captured at run time; attach it from the issue page if needed._",
    );
  }

  lines.push("", "---", "_Filed from testora results._");

  return { title, body: lines.join("\n") };
}
