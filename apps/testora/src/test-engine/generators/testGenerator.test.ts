import assert from "node:assert/strict";
import { test } from "node:test";
import type { TestCaseDefinition, TestFixtureDefinition } from "@/test-engine/types";
import { domSnapshotFileName, generateTestSpec } from "./testGenerator";

const fixture: TestFixtureDefinition = {
  fixtureId: "fix_1",
  suiteId: "suite_1",
  title: "Login form",
  baseUrl: "https://app.test",
  commonInput: {},
};

test("every generated test wraps its body so __captureDom always runs", () => {
  const spec = generateTestSpec(fixture, [
    { caseId: "c_single", fixtureId: "fix_1", title: "signs in", scriptType: "single", expected: {} },
    {
      caseId: "c_runs",
      fixtureId: "fix_1",
      title: "signs in per run",
      scriptType: "multi",
      runs: [{ url: "https://app.test/a" }, { url: "https://app.test/b" }],
      expected: {},
    },
  ]);

  assert.ok(spec.includes("async function __captureDom(t, label)"));
  assert.ok(spec.includes("document.documentElement.outerHTML"));
  // single case: wrapped + captures by its literal title
  assert.ok(spec.includes('await __captureDom(t, "signs in");'));
  // runs case: wrapped + captures by the resolved run label expression
  assert.ok(spec.includes("await __captureDom(t, labels_c_runs[i]);"));
  assert.match(spec, /try \{[\s\S]*await runScenario[\s\S]*\} finally \{/);
});

test("scripted cases are wrapped too", () => {
  const scripted: TestCaseDefinition = {
    caseId: "c_script",
    fixtureId: "fix_1",
    title: "scripted flow",
    scriptType: "scripted",
    script: "await t.click('#go');",
    expected: {},
  };
  const spec = generateTestSpec(fixture, [scripted]);
  assert.ok(spec.includes("await t.click('#go');"));
  assert.ok(spec.includes('await __captureDom(t, "scripted flow");'));
});

test("domSnapshotFileName matches the sanitiser used inside the spec", () => {
  assert.equal(domSnapshotFileName("signs in (run 2 — app.test)"), "signs_in__run_2___app.test_.html");
});
