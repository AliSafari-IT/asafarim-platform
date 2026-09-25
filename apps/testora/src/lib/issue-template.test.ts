import assert from "node:assert/strict";
import { test } from "node:test";
import { buildIssueDraft, type IssueFacts } from "./issue-template";

const baseFacts: IssueFacts = {
  caseTitle: "GET /api/health reports timelineai service status",
  fixtureTitle: "TimelineAI health endpoint",
  suiteTitle: "TimelineAI · Health API",
  frTitle: "asafarim-timelineai",
  status: "failed",
  targetBaseUrl: "https://tlai.asafarim.com",
  durationMs: 1234,
  createdAt: "2026-09-25T12:00:00.000Z",
  errorMessage: "expected 200 from /api/health, got 500",
  screenshot: null,
  projectName: "ASafariM · TimelineAI",
};

test("buildIssueDraft uses the bug_report.md section headings, in order", () => {
  const { body } = buildIssueDraft(baseFacts);
  const headings = [...body.matchAll(/^## (.+)$/gm)].map((m) => m[1]);
  assert.deepEqual(headings, [
    "Bug description",
    "App/Package affected",
    "Steps to reproduce",
    "Expected behavior",
    "Actual behavior",
    "Environment",
    "Logs/Error messages",
    "Additional context",
  ]);
});

test("buildIssueDraft titles the issue with the [e2e] prefix and the case name", () => {
  const { title } = buildIssueDraft(baseFacts);
  assert.equal(title, "[e2e] GET /api/health reports timelineai service status failed");
});

test("buildIssueDraft names the app under 'App/Package affected' when projectName is known", () => {
  const { body } = buildIssueDraft(baseFacts);
  assert.match(body, /## App\/Package affected\n\n`ASafariM · TimelineAI`/);
});

test("buildIssueDraft falls back to a generic label when projectName is missing", () => {
  const { body } = buildIssueDraft({ ...baseFacts, projectName: null });
  assert.match(body, /## App\/Package affected\n\n`this app`/);
});

test("buildIssueDraft puts the raw error verbatim in a fenced code block under Logs/Error messages", () => {
  const { body } = buildIssueDraft(baseFacts);
  assert.match(
    body,
    /## Logs\/Error messages\n\n```\nexpected 200 from \/api\/health, got 500\n```/,
  );
});

test("buildIssueDraft explains how to re-run the test in Testora, not manual browser steps", () => {
  const { body } = buildIssueDraft(baseFacts);
  const steps = body.split("## Steps to reproduce")[1]?.split("## Expected behavior")[0] ?? "";
  assert.match(steps, /Run Tests/);
  assert.match(steps, /TimelineAI health endpoint/);
  assert.match(steps, /tlai\.asafarim\.com/);
});

test("buildIssueDraft says 'not recorded' rather than omitting Environment fields that are missing", () => {
  const { body } = buildIssueDraft({ ...baseFacts, targetBaseUrl: null, durationMs: null });
  const env = body.split("## Environment")[1]?.split("## Logs/Error messages")[0] ?? "";
  assert.match(env, /Target: not recorded/);
  assert.match(env, /Duration: not recorded/);
});

test("buildIssueDraft adds a screenshot note only when a screenshot was captured", () => {
  const withShot = buildIssueDraft({ ...baseFacts, screenshot: "data:image/png;base64,abc" });
  const withoutShot = buildIssueDraft(baseFacts);
  assert.match(withShot.body, /screenshot of the page/i);
  assert.doesNotMatch(withoutShot.body, /screenshot of the page/i);
});
