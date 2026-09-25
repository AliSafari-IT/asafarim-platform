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
> & {
  // Human-readable app name (e.g. "ASafariM · TimelineAI"). Optional because
  // it isn't on ReportResultRow itself — callers thread it through from the
  // project the row belongs to. Used for the "App/Package affected" line.
  projectName?: string | null;
};

/**
 * Build a default issue (title + markdown body) from a failed/errored result
 * row. Everything here comes off the row the Results table already has, so no
 * extra fetch is needed. The body is plain GitHub-flavoured markdown, shaped
 * to match this repo's own bug_report.md issue template (Bug description,
 * App/Package affected, Steps to reproduce, Expected/Actual behavior,
 * Environment, Logs, Additional context) so a report reads the same whether
 * a human filed it or Testora did — and written for someone who's new to the
 * codebase: plain language, no assumed context, a concrete next action.
 * Used both as the instant seed in the UI and as the fallback when AI
 * generation is off or fails.
 */
export function buildIssueDraft(row: IssueFacts): IssueDraft {
  const title = `[e2e] ${row.caseTitle} failed`;
  const when = new Date(row.createdAt).toLocaleString();
  const app = row.projectName ?? "this app";

  const lines: string[] = [
    "## Bug description",
    "",
    `The automated end-to-end test **"${row.caseTitle}"** failed. It's part of the ` +
      `*${row.suiteTitle}* suite, which is checked under the *${row.frTitle}* requirement. ` +
      `In plain terms: this test opens **${row.fixtureTitle}** and checks that it behaves ` +
      `as expected — right now it doesn't.`,
    "",
    "## App/Package affected",
    "",
    `\`${app}\` — auto-detected by Testora from the test that failed, no need to guess.`,
    "",
    "## Steps to reproduce",
    "",
    "You don't need to reproduce this by hand — Testora can re-run the exact same test:",
    "",
    "1. Open Testora and go to **Run Tests**.",
    `2. Pick the fixture **"${row.fixtureTitle}"** (or run the whole *${row.suiteTitle}* suite).`,
    `3. Point the target environment at ${row.targetBaseUrl ? `**${row.targetBaseUrl}**` : "the same environment this ran against"}.`,
    '4. Click **Run fixture** and watch it fail live — the "Live console" shows each step as it happens.',
    "",
    "## Expected behavior",
    "",
    `The test case **"${row.caseTitle}"** should finish with a **passed** status — that's the whole point of the assertion(s) it makes.`,
    "",
    "## Actual behavior",
    "",
    `It finished with status **${row.status}** instead. The error Testora captured is below — start there, ` +
      "it almost always points at the exact step or assertion that broke.",
    "",
    "## Environment",
    "",
    `- Target: ${row.targetBaseUrl ?? "not recorded"}`,
    `- Run at: ${when}`,
    `- Duration: ${row.durationMs != null ? `${row.durationMs} ms` : "not recorded"}`,
    "",
    "## Logs/Error messages",
    "",
    "```",
    (row.errorMessage ?? "No error message captured.").trim(),
    "```",
  ];

  if (row.screenshot) {
    lines.push(
      "",
      "_A screenshot of the page at the moment of failure was captured — attach it from the issue page if it isn't already included._",
    );
  }

  lines.push(
    "",
    "## Additional context",
    "",
    `- Fixture: ${row.fixtureTitle}`,
    `- Suite: ${row.suiteTitle}`,
    `- Functional requirement: ${row.frTitle}`,
    "",
    "---",
    "_Filed automatically by Testora from a failed test run — new here? The **Run Tests** page in Testora " +
      "lets you re-run just this one fixture so you can watch it fail (or pass) yourself before digging in._",
  );

  return { title, body: lines.join("\n") };
}
