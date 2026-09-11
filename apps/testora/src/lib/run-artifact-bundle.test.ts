import assert from "node:assert/strict";
import { test } from "node:test";
import { RunArtifactBundle } from "@asafarim/testora-tasksai-contract";
import {
  buildRunArtifactBundle,
  classifyError,
  NonTerminalResultError,
  type BundleSourceRow,
} from "./run-artifact-bundle";

function baseRow(overrides: Partial<BundleSourceRow> = {}): BundleSourceRow {
  return {
    id: "res_1",
    status: "failed",
    runIndex: 0,
    durationMs: 4200,
    errorMessage: "AssertionError: expected '#submit' to exist",
    createdAt: "2026-09-10T10:00:12.000Z",
    details: { targetBaseUrl: "https://staging.example.com", screenshot: "data:image/png;base64,AAAA" },
    caseId: "case_login",
    caseTitle: "User can sign in",
    fixtureId: "fix_1",
    fixtureTitle: "Login form",
    suiteId: "suite_1",
    suiteTitle: "Auth",
    requirementId: "fr_1",
    requirementTitle: "Users can authenticate",
    projectId: "asafarim-web",
    previousPass: { resultId: "res_prev", createdAt: "2026-09-09T09:00:00.000Z" },
    flakeScore: null,
    quarantined: false,
    ...overrides,
  };
}

test("builds a schema-valid bundle for a failed result", () => {
  const bundle = buildRunArtifactBundle(baseRow(), { bundleId: "11111111-1111-1111-1111-111111111111" });
  assert.equal(RunArtifactBundle.safeParse(bundle).success, true);
  assert.equal(bundle.status, "failed");
  assert.equal(bundle.scenarioId, "case_login");
  assert.equal(bundle.appId, "asafarim-web");
  assert.equal(bundle.attempt, 1);
  assert.equal(bundle.errorClass, "assertion");
  assert.equal(bundle.startedAt, "2026-09-10T10:00:07.800Z");
  assert.equal(bundle.finishedAt, "2026-09-10T10:00:12.000Z");
  assert.equal(bundle.artifacts[0]?.kind, "screenshot");
  assert.equal(bundle.context?.previousPass?.resultId, "res_prev");
  assert.equal(bundle.context?.targetBaseUrl, "https://staging.example.com");
});

test("builds a schema-valid bundle for a passed result with no error/screenshot", () => {
  const bundle = buildRunArtifactBundle(
    baseRow({ status: "passed", errorMessage: null, details: { targetBaseUrl: "https://x.test" }, previousPass: null }),
    { bundleId: "22222222-2222-2222-2222-222222222222" },
  );
  assert.equal(RunArtifactBundle.safeParse(bundle).success, true);
  assert.equal(bundle.status, "passed");
  assert.equal(bundle.errorClass, undefined);
  assert.equal(bundle.errorMessage, undefined);
  assert.deepEqual(bundle.artifacts, []);
  assert.equal(bundle.context?.previousPass, null);
});

test("maps status 'error' to 'failed'", () => {
  const bundle = buildRunArtifactBundle(baseRow({ status: "error" }), {
    bundleId: "33333333-3333-3333-3333-333333333333",
  });
  assert.equal(bundle.status, "failed");
});

test("throws NonTerminalResultError for a running result", () => {
  assert.throws(() => buildRunArtifactBundle(baseRow({ status: "running" })), NonTerminalResultError);
});

test("maps details.artifactRefs to access-controlled artifact URLs", () => {
  const future = new Date(Date.now() + 7 * 86_400_000).toISOString();
  const bundle = buildRunArtifactBundle(
    baseRow({
      details: {
        targetBaseUrl: "https://x.test",
        steps: [{ index: 0, label: "click #submit", status: "failed", startedAtMs: 0, durationMs: 0 }],
        artifactRefs: {
          screenshot: { key: "testora/results/res_1/screenshot.png", bytes: 2048, contentType: "image/png", expiresAt: future },
          domSnapshot: { key: "testora/results/res_1/domSnapshot.html", bytes: 4096, contentType: "text/html; charset=utf-8", expiresAt: future },
        },
      },
    }),
    { bundleId: "77777777-7777-7777-7777-777777777777", artifactBaseUrl: "https://testora.asafarim.com" },
  );
  assert.equal(RunArtifactBundle.safeParse(bundle).success, true);
  const shot = bundle.artifacts.find((a) => a.kind === "screenshot");
  const dom = bundle.artifacts.find((a) => a.kind === "dom_snapshot");
  assert.equal(shot?.url, "https://testora.asafarim.com/api/results/res_1/artifact/screenshot");
  assert.equal(shot?.bytes, 2048);
  assert.equal(typeof shot?.expiresInSeconds, "number");
  assert.equal(dom?.url, "https://testora.asafarim.com/api/results/res_1/artifact/domSnapshot");
  assert.equal(bundle.steps.length, 1);
});

test("falls back to a legacy inline screenshot data URL when no artifactRefs", () => {
  const bundle = buildRunArtifactBundle(baseRow(), {
    bundleId: "88888888-8888-8888-8888-888888888888",
  });
  assert.equal(bundle.artifacts[0]?.kind, "screenshot");
  assert.ok(bundle.artifacts[0]?.url.startsWith("data:image/png"));
});

test("keeps only contract-shaped steps from details", () => {
  const bundle = buildRunArtifactBundle(
    baseRow({
      details: {
        steps: [
          { index: 0, label: "open /login", status: "passed", startedAtMs: 0, durationMs: 100 },
          { garbage: true },
        ],
      },
    }),
    { bundleId: "44444444-4444-4444-4444-444444444444" },
  );
  assert.equal(bundle.steps.length, 1);
  assert.equal(bundle.steps[0]?.label, "open /login");
});

test("truncates an over-long error message to the contract limit", () => {
  const bundle = buildRunArtifactBundle(baseRow({ errorMessage: "x".repeat(9000) }), {
    bundleId: "55555555-5555-5555-5555-555555555555",
  });
  assert.equal((bundle.errorMessage ?? "").length, 5000);
  assert.equal(RunArtifactBundle.safeParse(bundle).success, true);
});

test("classifyError buckets common failure texts", () => {
  assert.equal(classifyError("The element with selector '#x' was not found"), "selector_not_found");
  assert.equal(classifyError("Timeout of 5000ms exceeded"), "timeout");
  assert.equal(classifyError("net::ERR_CONNECTION_REFUSED"), "navigation");
  assert.equal(classifyError("AssertionError: expected true to equal false"), "assertion");
  assert.equal(classifyError(null), undefined);
});
