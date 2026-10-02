import assert from "node:assert/strict";
import { test } from "node:test";
import type { SelfTestReport } from "./egress-check";
import { EgressGuard } from "./egress-guard";

const PASS: SelfTestReport = { passed: true, lines: ["EGRESS SELF-TEST PASSED"] };
const FAIL: SelfTestReport = { passed: false, lines: ["✖ REACHABLE  172.16.1.2:5432", "EGRESS SELF-TEST FAILED"] };

/** A guard on a fake clock whose probe answers from `answers` in order. */
function setup(answers: (SelfTestReport | Error)[]) {
  let clock = 0;
  let probes = 0;
  const failures: SelfTestReport[] = [];
  let periodicPasses = 0;
  const guard = new EgressGuard({
    probe: async () => {
      const next = answers[Math.min(probes++, answers.length - 1)]!;
      if (next instanceof Error) throw next;
      return next;
    },
    intervalMs: 300_000,
    maxAgeMs: 60_000,
    onFail: (report) => failures.push(report),
    onPeriodicPass: () => periodicPasses++,
    now: () => clock,
  });
  return {
    guard,
    failures,
    probes: () => probes,
    periodicPasses: () => periodicPasses,
    advance: (ms: number) => {
      clock += ms;
    },
  };
}

test("a lease right after a pass doesn't re-probe; a stale pass does", async () => {
  const s = setup([PASS]);
  s.guard.markPassed();
  assert.equal(await s.guard.ensureFresh(), true);
  assert.equal(s.probes(), 0);
  s.advance(60_001); // idle longer than maxAge
  assert.equal(await s.guard.ensureFresh(), true);
  assert.equal(s.probes(), 1);
  assert.equal(await s.guard.ensureFresh(), true); // fresh again
  assert.equal(s.probes(), 1);
});

test("a failed check is final: onFail once, no further leases or probes", async () => {
  const s = setup([PASS, FAIL, PASS]);
  s.guard.markPassed();
  assert.equal(await s.guard.check(), true);
  assert.equal(await s.guard.check(), false);
  assert.equal(s.guard.failed, true);
  assert.deepEqual(s.failures, [FAIL]);
  // Even though the probe would pass again, the guard stays broken.
  assert.equal(await s.guard.check(), false);
  assert.equal(await s.guard.ensureFresh(), false);
  assert.equal(s.probes(), 2);
  assert.equal(s.failures.length, 1);
});

test("a crashing probe counts as a failure", async () => {
  const s = setup([new Error("socket hang up")]);
  assert.equal(await s.guard.check(), false);
  assert.equal(s.failures.length, 1);
  assert.match(s.failures[0]!.lines[0]!, /self-test crashed: socket hang up/);
});

test("concurrent callers share one probe (single-flight)", async () => {
  const s = setup([PASS]);
  s.advance(1_000_000);
  const results = await Promise.all([s.guard.ensureFresh(), s.guard.ensureFresh(), s.guard.check()]);
  assert.deepEqual(results, [true, true, true]);
  assert.equal(s.probes(), 1);
});

test("start() re-checks on the interval and stops itself after a failure", async (t) => {
  t.mock.timers.enable({ apis: ["setInterval"] });
  const s = setup([PASS, FAIL]);
  s.guard.markPassed();
  s.guard.start();
  t.mock.timers.tick(300_000);
  await new Promise((resolve) => setImmediate(resolve));
  assert.equal(s.probes(), 1);
  t.mock.timers.tick(300_000);
  await new Promise((resolve) => setImmediate(resolve));
  assert.equal(s.probes(), 2);
  assert.equal(s.failures.length, 1);
  t.mock.timers.tick(900_000); // stopped: no more probes
  await new Promise((resolve) => setImmediate(resolve));
  assert.equal(s.probes(), 2);
  assert.equal(s.periodicPasses(), 1); // the first interval passed, the second failed
});

test("only interval passes are reported, not pre-lease checks", async (t) => {
  t.mock.timers.enable({ apis: ["setInterval"] });
  const s = setup([PASS]);
  s.guard.markPassed();
  s.guard.start();
  s.advance(60_001);
  assert.equal(await s.guard.ensureFresh(), true); // pre-lease re-probe
  assert.equal(s.periodicPasses(), 0);
  t.mock.timers.tick(300_000);
  await new Promise((resolve) => setImmediate(resolve));
  assert.equal(s.periodicPasses(), 1);
  s.guard.stop();
});
