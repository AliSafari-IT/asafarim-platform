import assert from "node:assert/strict";
import { test } from "node:test";
import { backoffSeconds, MAX_DELIVERY_ATTEMPTS, nextEventState, shouldDeadLetter } from "./webhook-dispatch-policy";

test("backoffSeconds grows exponentially and caps at 300", () => {
  assert.equal(backoffSeconds(1), 2);
  assert.equal(backoffSeconds(2), 4);
  assert.equal(backoffSeconds(3), 8);
  assert.equal(backoffSeconds(10), 300);
});

test("shouldDeadLetter trips at MAX_DELIVERY_ATTEMPTS", () => {
  assert.equal(shouldDeadLetter(MAX_DELIVERY_ATTEMPTS - 1), false);
  assert.equal(shouldDeadLetter(MAX_DELIVERY_ATTEMPTS), true);
});

test("nextEventState: success → sent regardless of attempt count", () => {
  assert.deepEqual(nextEventState({ attempts: 5, ok: true }), { status: "sent", availableInSeconds: 0 });
});

test("nextEventState: failure under the cap → pending with backoff", () => {
  const s = nextEventState({ attempts: 2, ok: false });
  assert.equal(s.status, "pending");
  assert.equal(s.availableInSeconds, 4);
});

test("nextEventState: failure past the cap → dead", () => {
  assert.deepEqual(nextEventState({ attempts: MAX_DELIVERY_ATTEMPTS, ok: false }), {
    status: "dead",
    availableInSeconds: 0,
  });
});
