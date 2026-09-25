import assert from "node:assert/strict";
import { test } from "node:test";
import {
  extractFingerprint,
  issueFingerprint,
  normalizeError,
  withFingerprintMarker,
} from "./issue-fingerprint";

test("normalizeError keeps the first meaningful line and strips run-specific noise", () => {
  assert.equal(
    normalizeError("\n  Expected 200, received 403 after 1532ms\n   at foo (C:\\x\\y.js:12:3)"),
    "expected <n>, received <n> after <n>ms",
  );
  assert.equal(
    normalizeError("Order 9b2f6c1e-4a1b-4c3d-9e8f-0123456789ab not found in /var/app/data.json"),
    "order <uuid> not found in <path>",
  );
});

test("the same failure on different runs gets the same fingerprint", () => {
  const a = issueFingerprint({
    projectId: "vionto",
    caseId: "export-mp4",
    errorMessage: "Expected 200, received 403 after 1532ms",
  });
  const b = issueFingerprint({
    projectId: "vionto",
    caseId: "export-mp4",
    errorMessage: "Expected 200, received 403 after 88ms\n  at stack line",
  });
  assert.equal(a, b);
  assert.match(a, /^[a-f0-9]{16}$/);
});

test("a different app, case or error gives a different fingerprint", () => {
  const base = { projectId: "vionto", caseId: "export-mp4", errorMessage: "Expected 200, received 403" };
  const fp = issueFingerprint(base);
  assert.notEqual(fp, issueFingerprint({ ...base, projectId: "edumatch" }));
  assert.notEqual(fp, issueFingerprint({ ...base, caseId: "login" }));
  assert.notEqual(fp, issueFingerprint({ ...base, errorMessage: "Element #save not found" }));
});

test("the marker round-trips and is never duplicated", () => {
  const body = withFingerprintMarker("## Steps\n1. Export", "0123456789abcdef");
  assert.equal(extractFingerprint(body), "0123456789abcdef");
  const again = withFingerprintMarker(body, "fedcba9876543210");
  assert.equal(extractFingerprint(again), "fedcba9876543210");
  assert.equal(again.match(/testora:fingerprint=/g)?.length, 1);
  assert.equal(extractFingerprint("no marker here"), null);
});
