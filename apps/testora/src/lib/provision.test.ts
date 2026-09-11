import assert from "node:assert/strict";
import { test } from "node:test";
import {
  isBlockingScenario,
  provisionFixtureId,
  provisionFrId,
  provisionSuiteId,
  scaffoldScript,
  scenarioCaseId,
} from "./provision";

test("isBlockingScenario excludes pending/authoring/quarantined, includes the rest", () => {
  assert.equal(isBlockingScenario("pending"), false);
  assert.equal(isBlockingScenario("authoring"), false);
  assert.equal(isBlockingScenario("quarantined"), false);
  assert.equal(isBlockingScenario("active"), true);
  assert.equal(isBlockingScenario("passing"), true);
  assert.equal(isBlockingScenario("failing"), true);
});

test("deterministic ids: same provisionId + criterionRef always resolve the same", () => {
  const pid = "11111111-1111-1111-1111-111111111111";
  assert.equal(provisionFrId(pid), provisionFrId(pid));
  assert.equal(provisionSuiteId(pid), provisionSuiteId(pid));
  assert.equal(provisionFixtureId(pid), provisionFixtureId(pid));
  assert.equal(scenarioCaseId(pid, "ac_1"), scenarioCaseId(pid, "ac_1"));
  assert.notEqual(scenarioCaseId(pid, "ac_1"), scenarioCaseId(pid, "ac_2"));
});

test("ids are lowercase-hyphen safe even from a messy criterionRef", () => {
  const id = scenarioCaseId("abc-123", "AC #1: Sign In!");
  assert.match(id, /^[a-z0-9-]+$/);
});

test("scaffoldScript always fails and carries the criterion text", () => {
  const script = scaffoldScript("A user can request a password reset by email");
  assert.match(script, /t\.expect\(false\)\.ok\(/);
  assert.match(script, /password reset/);
});

test("scaffoldScript escapes single quotes so the generated string literal stays valid", () => {
  const script = scaffoldScript("The user's session expires after 30 minutes");
  const literal = script.match(/\.ok\('([\s\S]*)'\);$/)?.[1] ?? "";
  // every embedded quote in the message is escaped — the literal itself
  // (with escapes stripped) has no stray, unescaped single quote left.
  assert.equal(/(?<!\\)'/.test(literal), false);
});
