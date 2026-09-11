import assert from "node:assert/strict";
import { test } from "node:test";
import { isRegression } from "./regression";

test("passed → failed is a regression", () => {
  assert.equal(isRegression("passed", "failed"), true);
  assert.equal(isRegression("passed", "error"), true);
});

test("a case with no prior passing run is not a regression", () => {
  assert.equal(isRegression(null, "failed"), false);
  assert.equal(isRegression("failed", "failed"), false);
});

test("passed → passed is not a regression", () => {
  assert.equal(isRegression("passed", "passed"), false);
});
