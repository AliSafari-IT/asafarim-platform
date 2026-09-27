import assert from "node:assert/strict";
import { test } from "node:test";
import { buildHandoff, type TestoraScenariosPayload } from "@asafarim/tool-handoff";
import { planWorkbenchImport, previewWorkbenchImport, validateWorkbenchFile, workbenchIds } from "./workbench-import";

const now = new Date("2026-09-27T12:00:00Z");
const id = "0b6f2a4e-5c1d-4e8f-9a7b-3c2d1e0f9a8b";
const payload: TestoraScenariosPayload = {
  title: "Password reset by email",
  summary: "A signed-out user resets their password.",
  scenarios: [
    { ref: "TC-01", title: "Reset with a valid link", category: "happy_path", priority: "high", basis: "extracted", preconditions: ["Signed out"], steps: ["Request a link", "Open it"], expected: "Password changed.", evidence: ["I want to reset it through a link."] },
    { ref: "TC-08", title: "Keyboard only", category: "accessibility", priority: "medium", basis: "inferred", preconditions: [], steps: ["Tab through"], expected: "Every step reachable.", evidence: [], assumption: "Assumes WCAG 2.2 AA." },
  ],
  questions: ["Does a failed page load use up the link?"],
};
const envelope = buildHandoff("testora", { app: "web", tool: "requirements-to-test-plan", toolVersion: "1.0.0", schemaVersion: "test-plan/1" }, payload, { now, id });

test("a valid file plans pending, failing scaffolds with deterministic ids", () => {
  const checked = validateWorkbenchFile(JSON.stringify(envelope), now);
  assert.equal(checked.ok, true);
  const plan = planWorkbenchImport(envelope, "asafarim-web", "user_1", now);
  assert.equal(plan.requirement.id, "fr-wb-0b6f2a4e5c1d4e8f");
  assert.deepEqual(plan.cases.map((c) => c.caseId), ["scn-wb-0b6f2a4e5c-tc-01", "scn-wb-0b6f2a4e5c-tc-08"]);
  for (const c of plan.cases) {
    assert.equal(c.scenarioState, "pending");
    assert.match(c.script, /await t\.expect\(false\)\.ok\('Scaffold — not yet implemented/);
  }
  assert.match(plan.cases[0]!.script, /\/\/ 1\. Request a link/);
  assert.equal(plan.cases[1]!.metadata.assumption, "Assumes WCAG 2.2 AA.");
  assert.match(plan.requirement.description, /none has been automated or run/);
});

test("the same file always maps to the same records (idempotent import)", () => {
  assert.deepEqual(planWorkbenchImport(envelope, "a", "u", now).ids.frId, workbenchIds(id).frId);
});

test("the audit metadata holds ids and versions, not scenario text", () => {
  const { metadata } = planWorkbenchImport(envelope, "asafarim-web", "user_1", now).requirement;
  assert.deepEqual(Object.keys(metadata).sort(), ["handoffId", "handoffVersion", "importedAt", "importedBy", "payloadVersion", "scenarios", "schemaVersion", "source", "sourceTool", "toolVersion"]);
  assert.doesNotMatch(JSON.stringify(metadata), /Reset|password/i);
});

test("preview lists exactly the cases confirm would create", () => {
  const preview = previewWorkbenchImport(envelope);
  assert.deepEqual(preview.cases.map((c) => c.caseId), planWorkbenchImport(envelope, "x", "y", now).cases.map((c) => c.caseId));
  assert.equal(preview.questions, 1);
});

test("invalid, misdirected, expired, and scripted-injection-safe", () => {
  assert.equal(validateWorkbenchFile("{", now).ok, false);
  const other = JSON.stringify({ ...envelope, destination: "tasksai", payloadVersion: "tasksai-tasks/1" });
  const misdirected = validateWorkbenchFile(other, now);
  assert.equal(!misdirected.ok && misdirected.code, "wrong_destination");
  const expired = validateWorkbenchFile(JSON.stringify(envelope), new Date("2026-12-01T00:00:00Z"));
  assert.equal(!expired.ok && expired.code, "expired");
  // Text can't break out of the scaffold's comment lines or string literal.
  const hostile = structuredClone(envelope);
  hostile.payload.scenarios[0]!.steps = ["line one\nawait t.navigateTo('https://evil.example')"];
  hostile.payload.scenarios[0]!.title = "x'); await t.navigateTo('https://evil.example'); ('";
  const script = planWorkbenchImport(hostile, "a", "u", now).cases[0]!.script;
  // Every line is a comment, except one call whose string literal has every quote escaped.
  const code = script.split("\n").filter((line) => !line.startsWith("//"));
  assert.equal(code.length, 1);
  assert.match(code[0]!, /^await t\.expect\(false\)\.ok\('(?:[^'\\]|\\.)*'\);$/);
});
