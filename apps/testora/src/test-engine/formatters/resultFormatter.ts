import type { FormattedReport, TestCaseDefinition, TestFixtureDefinition, TestRunResult } from "@/test-engine/types";

export function toJsonReport(
  suiteTitle: string,
  fixture: TestFixtureDefinition,
  cases: TestCaseDefinition[],
  results: TestRunResult[],
): FormattedReport[] {
  const casesById = new Map(cases.map((testCase) => [testCase.caseId, testCase]));
  return results.map((result) => ({
    suite: suiteTitle,
    fixture: fixture.title,
    fixtureId: fixture.fixtureId,
    caseId: result.caseId,
    case: casesById.get(result.caseId)?.title ?? result.caseId,
    status: result.status,
    details: {
      runIndex: result.runIndex,
      durationMs: result.durationMs,
      errorMessage: result.errorMessage,
      ...result.details,
    },
  }));
}

export function toHtmlReport(reports: FormattedReport[]): string {
  const rows = reports
    .map(
      (report) => `
      <tr class="status-${report.status}">
        <td>${escapeHtml(report.suite)}</td>
        <td>${escapeHtml(report.fixture)}</td>
        <td>${escapeHtml(report.case)}</td>
        <td>${escapeHtml(report.status)}</td>
        <td><pre>${escapeHtml(JSON.stringify(report.details, null, 2))}</pre></td>
      </tr>`,
    )
    .join("\n");

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <title>e2e-testora results</title>
  <style>
    body { font-family: system-ui, sans-serif; margin: 2rem; background: #0b0e14; color: #e6e6e6; }
    table { width: 100%; border-collapse: collapse; }
    th, td { border: 1px solid #2a2f3a; padding: 0.5rem 0.75rem; text-align: left; vertical-align: top; }
    th { background: #161a23; }
    tr.status-passed { color: #4ade80; }
    tr.status-failed, tr.status-error { color: #f87171; }
    pre { margin: 0; white-space: pre-wrap; }
  </style>
</head>
<body>
  <h1>e2e-testora results</h1>
  <table>
    <thead>
      <tr><th>Suite</th><th>Fixture</th><th>Case</th><th>Status</th><th>Details</th></tr>
    </thead>
    <tbody>
      ${rows}
    </tbody>
  </table>
</body>
</html>`;
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}
