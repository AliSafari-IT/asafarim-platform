import assert from "node:assert/strict";
import { test } from "node:test";
import { DOM_DIR_PLACEHOLDER, buildRunnerEnvelope } from "./runner-envelope";
import type { RunJob } from "./run-executor";
import { SCENARIO_RUNNER_PLACEHOLDER } from "@/test-engine/generators/testGenerator";

const SERVER_ENV = {
  AUTH_SECRET: "platform-auth-secret",
  TESTORA_DATABASE_URL: "postgres://internal",
  OPENAI_API_KEY: "sk-live",
  TESTORA_RUNNER_TOKEN: "runner-token",
  ASAFARIM_ADMIN_EMAIL: "admin@env.test",
  ASAFARIM_ADMIN_PASSWORD: "env-password",
  PATH: "/usr/bin",
};

const unit = (fixtureId: string, baseUrl: string, projectId = "asafarim-timelineai") => ({
  suiteTitle: "S",
  projectId,
  fixture: { fixtureId, suiteId: "s", title: fixtureId, baseUrl, commonInput: {} },
  cases: [
    { caseId: `${fixtureId}-c`, fixtureId, title: "c", scriptType: "scripted" as const, expected: {}, script: "await t.expect(1).eql(1);" },
  ],
});

function job(overrides: Partial<RunJob["env"]> = {}): RunJob {
  return {
    plan: { label: "two fixtures", units: [unit("tl-landing", "http://localhost:3010/"), unit("tl-health", "http://localhost:3010/api/health")] },
    env: {
      baseUrl: "http://localhost:3010",
      apiUrl: "http://localhost:3010",
      hubUrl: "http://localhost:3001",
      targetName: "Local",
      secrets: { ASAFARIM_ADMIN_PASSWORD: "from-target-secret", LOGIN_EMAIL: "qa@example.test" },
      secretsProjectId: "asafarim-timelineai",
      ...overrides,
    },
  };
}

const build = (j: RunJob) =>
  buildRunnerEnvelope({
    runId: "run-1",
    leaseToken: "lease-token",
    leaseExpiresAt: new Date("2026-10-02T12:00:00Z"),
    job: j,
    serverEnv: SERVER_ENV,
    timeoutMs: 45 * 60_000,
    maxArtifactBytes: 50 * 1024 * 1024,
  });

test("the envelope env holds only the run's values: target secrets, TESTORA_*, WEBAPP_API_URL", () => {
  const { envelope } = build(job());
  const allowed = (key: string) =>
    key.startsWith("TESTORA_") ||
    key === "WEBAPP_API_URL" ||
    ["ASAFARIM_ADMIN_PASSWORD", "LOGIN_EMAIL"].includes(key) ||
    // The deprecated, seeded-ASafariM-only fallback (lib/run-secrets.ts).
    key === "ASAFARIM_ADMIN_EMAIL";
  for (const key of Object.keys(envelope.env)) assert.ok(allowed(key), `unexpected key in envelope env: ${key}`);
  for (const forbidden of ["AUTH_SECRET", "TESTORA_DATABASE_URL", "OPENAI_API_KEY", "TESTORA_RUNNER_TOKEN", "PATH"]) {
    assert.equal(envelope.env[forbidden], undefined, forbidden);
  }
  assert.equal(envelope.env.ASAFARIM_ADMIN_PASSWORD, "from-target-secret", "the target secret wins over server env");
  assert.equal(envelope.env.TESTORA_TARGET_HUB_URL, "http://localhost:3001");
  // No server secret leaks into any generated spec either.
  for (const u of envelope.units) {
    assert.ok(!u.spec.includes("platform-auth-secret") && !u.spec.includes("sk-live") && !u.spec.includes("postgres://internal"));
  }
});

test("a third-party app gets no server-env fallback at all", () => {
  const thirdParty: RunJob = {
    plan: { label: "x", units: [unit("x-home", "https://example.com/", "acme")] },
    env: { secrets: { LOGIN_PASSWORD: "s3" }, secretsProjectId: "acme", baseUrl: "https://example.com" },
  };
  const { envelope, deprecatedFallback } = build(thirdParty);
  assert.deepEqual(deprecatedFallback, []);
  assert.deepEqual(Object.keys(envelope.env).filter((k) => !k.startsWith("TESTORA_")).sort(), ["LOGIN_PASSWORD"]);
});

test("per-fixture values live in each spec; host paths are placeholders the runner resolves", () => {
  const { envelope } = build(job());
  assert.equal(envelope.units.length, 2);
  for (const u of envelope.units) {
    assert.ok(u.spec.includes(DOM_DIR_PLACEHOLDER), "DOM dir placeholder");
    assert.ok(u.spec.includes(`from "${SCENARIO_RUNNER_PLACEHOLDER}"`), "portable scenario-runner import");
    assert.ok(u.spec.includes('"TESTORA_TARGET_BASE_URL":"http://localhost:3010"'));
    assert.ok(u.spec.includes('"TESTORA_TARGET_ALLOW_SIGNUP":"1"'), "a local target may sign up");
  }
  assert.equal(envelope.env.TESTORA_DOM_DIR, undefined, "per-unit keys stay out of the job env");
});

test("allowed origins = the fixtures', API and Hub origins; off-target requests are logged, not blocked", () => {
  const { envelope } = build(job());
  assert.deepEqual(envelope.allowedOrigins.sort(), ["http://localhost:3001", "http://localhost:3010"]);
  assert.ok(envelope.units[0]!.spec.includes('console.log("OFF_TARGET_REQUEST " + origin)'));
});

test("limits, lease and browser flags are carried", () => {
  const { envelope } = build(job());
  assert.equal(envelope.jobId, "run-1");
  assert.equal(envelope.leaseToken, "lease-token");
  assert.equal(envelope.limits.timeoutMs, 45 * 60_000);
  assert.ok(envelope.browser.flags.includes("--no-sandbox"));
});
