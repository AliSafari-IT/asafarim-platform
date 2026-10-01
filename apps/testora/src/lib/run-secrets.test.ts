import assert from "node:assert/strict";
import { mock, test } from "node:test";
import {
  SEEDED_CREDENTIAL_NAMES,
  buildRunSpecEnv,
  isReservedRunName,
  secretNameError,
} from "./run-secrets";
import { decryptToken, encryptToken } from "./crypto";

// scenarioRunner.js imports Selector, which only exists inside a TestCafe run.
mock.module("testcafe", { namedExports: { Selector: () => ({}) } });
const { resolveValue } = await import("@/test-engine/executors/scenarioRunner.js");

const SERVER_ENV = {
  AUTH_SECRET: "platform-auth-secret",
  DATABASE_URL: "postgres://internal",
  OPENAI_API_KEY: "sk-live",
  ASAFARIM_ADMIN_EMAIL: "admin@env.test",
  ASAFARIM_ADMIN_PASSWORD: "env-password",
  EDUMATCH_STUDENT_EMAIL: "student@env.test",
};

test("{{AUTH_SECRET}} (any non-allowlisted server variable) fails with 'unknown secret'", () => {
  const { env } = buildRunSpecEnv({
    projectId: "asafarim-timelineai",
    targetSecrets: {},
    runValues: { WEBAPP_API_URL: "https://tlai.asafarim.com" },
    serverEnv: SERVER_ENV,
  });
  for (const name of ["AUTH_SECRET", "DATABASE_URL", "OPENAI_API_KEY", "PATH"]) {
    assert.throws(() => resolveValue(`{{${name}}}`, env), new RegExp(`Unknown secret "${name}"`));
  }
});

test("placeholders resolve from the target's secrets and the run's own values", () => {
  const { env } = buildRunSpecEnv({
    projectId: "third-party-app",
    targetSecrets: { LOGIN_EMAIL: "qa@example.com", LOGIN_PASSWORD: "s3cret" },
    runValues: { WEBAPP_API_URL: "https://api.example.com", TESTORA_TARGET_BASE_URL: "https://example.com" },
    serverEnv: SERVER_ENV,
  });
  assert.equal(resolveValue("{{LOGIN_PASSWORD}}", env), "s3cret");
  assert.equal(resolveValue("{{WEBAPP_API_URL}}", env), "https://api.example.com");
  assert.equal(resolveValue("{{TESTORA_TARGET_BASE_URL}}", env), "https://example.com");
  assert.equal(resolveValue("plain text", env), "plain text");
  assert.equal(resolveValue("{{ not a placeholder }}", env), "{{ not a placeholder }}");
  // A third-party project gets NO server-env fallback, not even the ASafariM creds.
  assert.throws(() => resolveValue("{{ASAFARIM_ADMIN_PASSWORD}}", env), /Unknown secret/);
  assert.deepEqual(Object.keys(env).sort(), ["LOGIN_EMAIL", "LOGIN_PASSWORD", "TESTORA_TARGET_BASE_URL", "WEBAPP_API_URL"]);
});

test("seeded ASafariM apps keep a deprecated server-env fallback for their own names only", () => {
  const result = buildRunSpecEnv({
    projectId: "asafarim-timelineai",
    targetSecrets: { ASAFARIM_ADMIN_PASSWORD: "from-target-secret" },
    runValues: {},
    serverEnv: SERVER_ENV,
  });
  assert.equal(result.env.ASAFARIM_ADMIN_PASSWORD, "from-target-secret", "a target secret wins over the fallback");
  assert.equal(result.env.ASAFARIM_ADMIN_EMAIL, "admin@env.test");
  assert.deepEqual(result.deprecatedFallback, ["ASAFARIM_ADMIN_EMAIL"]);
  assert.equal(result.env.EDUMATCH_STUDENT_EMAIL, undefined, "another app's names don't leak in");
  assert.equal(result.env.AUTH_SECRET, undefined);
});

test("the run's own values can't be shadowed by a stored secret", () => {
  const { env } = buildRunSpecEnv({
    projectId: null,
    targetSecrets: { TESTORA_TARGET_ALLOW_SIGNUP: "1", WEBAPP_API_URL: "https://evil.example" },
    runValues: { WEBAPP_API_URL: "https://api.example.com" },
    serverEnv: {},
  });
  assert.equal(env.WEBAPP_API_URL, "https://api.example.com");
  assert.equal(env.TESTORA_TARGET_ALLOW_SIGNUP, undefined);
});

test("secret names: env-style identifiers, never the reserved run names", () => {
  for (const ok of ["ADMIN_PASSWORD", "LOGIN_EMAIL", "A1"]) assert.equal(secretNameError(ok), null, ok);
  for (const bad of ["admin_password", "1ABC", "WITH-DASH", "", "TESTORA_SECRET", "WEBAPP_API_URL", "X".repeat(65)]) {
    assert.notEqual(secretNameError(bad), null, bad);
  }
  assert.equal(isReservedRunName("TESTORA_DOM_DIR"), true);
});

test("the seed copies only credential names (EMAIL/PASSWORD) per app", () => {
  assert.deepEqual(SEEDED_CREDENTIAL_NAMES["asafarim-timelineai"], ["ASAFARIM_ADMIN_EMAIL", "ASAFARIM_ADMIN_PASSWORD"]);
  assert.deepEqual(SEEDED_CREDENTIAL_NAMES["asafarim-edumatch"], [
    "EDUMATCH_STUDENT_EMAIL",
    "EDUMATCH_STUDENT_PASSWORD",
    "EDUMATCH_TEACHER_EMAIL",
    "EDUMATCH_TEACHER_PASSWORD",
  ]);
});

test("secret values round-trip through the at-rest encryption and detect tampering", () => {
  const stored = encryptToken("p@ss word ✓");
  assert.notEqual(stored, "p@ss word ✓");
  assert.equal(decryptToken(stored), "p@ss word ✓");
  const tampered = stored.slice(0, -2) + (stored.endsWith("00") ? "11" : "00");
  assert.equal(decryptToken(tampered), null);
});
