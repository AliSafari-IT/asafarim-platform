import assert from "node:assert/strict";
import { test } from "node:test";
import { SEED_BUNDLES } from "@/data/bundles";
import { findUnguardedMutations, mutationReasons, scriptSaveWarning } from "./seed-lint";
import { isWebTarget, unitTargetsWeb } from "./web-target";
import type { TestCaseDefinition, TestFixtureDefinition } from "@/test-engine/types";

test("seed lint: every seeded script that writes data is destructive or explicitly waived", () => {
  const unguarded = findUnguardedMutations(SEED_BUNDLES);
  assert.deepEqual(
    unguarded,
    [],
    "tag these fixtures `destructive: true` (or `mutatesRemote: \"reviewed\"` after review):\n" +
      unguarded.map((u) => `  ${u.fixtureId} / ${u.source}: ${u.reasons.join(", ")}`).join("\n"),
  );
});

test("seed lint: the EduMatch student and tutor fixtures are destructive", () => {
  const edumatch = SEED_BUNDLES.find((b) => b.projectId === "asafarim-edumatch")!;
  for (const id of ["edumatch-student-ask-ui", "edumatch-tutor-quote-ui"]) {
    const fixture = edumatch.fixtures.find((f) => f.fixtureId === id);
    assert.equal(fixture?.metadata?.destructive, true, id);
  }
});

test("seed lint: the EduMatch sign-up fallback is gated behind TESTORA_TARGET_ALLOW_SIGNUP", () => {
  const edumatch = SEED_BUNDLES.find((b) => b.projectId === "asafarim-edumatch")!;
  for (const testCase of edumatch.cases) {
    const script = testCase.script ?? "";
    const signUp = script.indexOf("/sign-up");
    if (signUp === -1) continue;
    const gate = script.indexOf("process.env.TESTORA_TARGET_ALLOW_SIGNUP === '1'");
    assert.ok(gate !== -1 && gate < signUp, `${testCase.caseId}: sign-up must come after the ALLOW_SIGNUP gate`);
  }
});

test("seed lint: the detector catches sign-ups and write requests, not reads", () => {
  assert.deepEqual(mutationReasons("await t.navigateTo('/sign-up');"), ["account sign-up"]);
  assert.ok(mutationReasons("await t.request({ url: '/api/x', method: 'POST' });").length > 0);
  assert.ok(mutationReasons("fetch('/api/x', { method: \"DELETE\" })").length > 0);
  assert.ok(mutationReasons("await t.request.patch('/api/x', {})").length > 0);
  assert.deepEqual(mutationReasons("await t.eval(() => fetch('/api/health'))"), []);
  assert.deepEqual(mutationReasons("await t.request({ url: '/api/x', method: 'GET' })"), []);
});

test("seed lint: flags an untagged writing case, accepts tagged and waived ones", () => {
  const fixture = (id: string, metadata?: Record<string, unknown>): TestFixtureDefinition => ({
    fixtureId: id,
    suiteId: "s",
    title: id,
    commonInput: {},
    metadata,
  });
  const writer = (fixtureId: string): TestCaseDefinition => ({
    caseId: `${fixtureId}-case`,
    fixtureId,
    title: "writes",
    scriptType: "scripted",
    expected: {},
    script: "await t.request({ url: '/api/items', method: 'POST', body: {} });",
  });
  const found = findUnguardedMutations([
    {
      fixtures: [fixture("plain"), fixture("tagged", { destructive: true }), fixture("waived", { mutatesRemote: "reviewed" })],
      cases: [writer("plain"), writer("tagged"), writer("waived")],
    },
  ]);
  assert.deepEqual(found.map((f) => f.fixtureId), ["plain"]);
});

test("web targets: only clearly-local origins count as local; unknown is web", () => {
  for (const url of ["http://localhost:3010", "http://127.0.0.1:3001/x", "http://[::1]:3000", "http://app.localhost"]) {
    assert.equal(isWebTarget(url), false, url);
  }
  for (const url of ["https://edumatch.asafarim.com", "http://10.0.0.5", undefined, "", "not a url"]) {
    assert.equal(isWebTarget(url), true, String(url));
  }
});

test("web targets: a fixture with no override pointing at the seed's prod URL is web", () => {
  // The bug #701 fixed: "no override" used to count as local.
  assert.equal(unitTargetsWeb({ fixture: { baseUrl: "https://edumatch.asafarim.com/" } }), true);
  assert.equal(unitTargetsWeb({ fixture: { baseUrl: "http://localhost:3009/" } }), false);
  // A local page with a remote API still writes remotely.
  assert.equal(unitTargetsWeb({ fixture: { baseUrl: "http://localhost:3009/" } }, "https://edumatch.asafarim.com"), true);
});

test("scriptSaveWarning: warns for an unguarded writing script, not for guarded or read-only ones (#714)", () => {
  const writes = "await t.request.post('https://app.test/api/items', { body: {} });";
  const warning = scriptSaveWarning([writes, undefined], {});
  assert.match(warning ?? "", /^Saved — but this script writes data \(write request \(t\.request\.post\/put\/patch\/delete\)\)/);
  assert.match(warning ?? "", /"destructive: true"/);
  assert.equal(scriptSaveWarning([writes], { destructive: true }), null, "destructive fixture");
  assert.equal(scriptSaveWarning([writes], { mutatesRemote: "reviewed" }), null, "waived fixture");
  assert.equal(scriptSaveWarning(["await t.click(Selector('a'));", null], null), null, "read-only script");
  // Reasons are listed once even if setup and teardown both match.
  const both = scriptSaveWarning([writes, writes], undefined) ?? "";
  assert.equal(both.split("t.request.post").length - 1, 1);
});
