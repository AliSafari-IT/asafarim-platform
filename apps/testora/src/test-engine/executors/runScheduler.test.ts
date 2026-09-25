import assert from "node:assert/strict";
import { test } from "node:test";
import { RunScheduler, intFromEnv } from "./runScheduler";

/** A job whose completion the test controls. */
function deferred() {
  let resolve!: () => void;
  let reject!: (error: Error) => void;
  const promise = new Promise<void>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

const tick = () => new Promise((resolve) => setImmediate(resolve));

test("runs up to the limit immediately and queues the rest in order", () => {
  const scheduler = new RunScheduler({ limit: 2, maxQueue: 5 });
  const jobs = [deferred(), deferred(), deferred(), deferred()];
  assert.deepEqual(scheduler.submit("a", () => jobs[0]!.promise), { status: "running" });
  assert.deepEqual(scheduler.submit("b", () => jobs[1]!.promise), { status: "running" });
  assert.deepEqual(scheduler.submit("c", () => jobs[2]!.promise), { status: "queued", position: 1 });
  assert.deepEqual(scheduler.submit("d", () => jobs[3]!.promise), { status: "queued", position: 2 });
  assert.deepEqual(scheduler.snapshot().running, ["a", "b"]);
  assert.deepEqual(scheduler.snapshot().queued, ["c", "d"]);
});

test("a finished run hands its slot to the next queued run, and positions update", async () => {
  const started: string[] = [];
  const positions: Map<string, number>[] = [];
  const scheduler = new RunScheduler({
    limit: 2,
    maxQueue: 5,
    onStart: (id) => started.push(id),
    onPositions: (p) => positions.push(p),
  });
  const a = deferred();
  const b = deferred();
  scheduler.submit("a", () => a.promise);
  scheduler.submit("b", () => b.promise);
  scheduler.submit("c", () => deferred().promise);
  scheduler.submit("d", () => deferred().promise);

  a.resolve();
  await tick();
  assert.deepEqual(started, ["a", "b", "c"]);
  assert.deepEqual(scheduler.snapshot().running.sort(), ["b", "c"]);
  assert.deepEqual([...positions.at(-1)!], [["d", 1]]);
});

test("a failed or throwing run still frees its slot", async () => {
  const scheduler = new RunScheduler({ limit: 1, maxQueue: 5 });
  const a = deferred();
  scheduler.submit("a", () => a.promise);
  scheduler.submit("b", () => {
    throw new Error("sync failure");
  });
  scheduler.submit("c", () => deferred().promise);

  a.reject(new Error("boom"));
  await tick();
  await tick();
  // b threw synchronously when started; c must still get the slot.
  assert.deepEqual(scheduler.snapshot().running, ["c"]);
  assert.deepEqual(scheduler.snapshot().queued, []);
});

test("cancelling a queued run removes it and moves the others up", () => {
  const positions: Map<string, number>[] = [];
  const scheduler = new RunScheduler({ limit: 1, maxQueue: 5, onPositions: (p) => positions.push(p) });
  scheduler.submit("a", () => deferred().promise);
  scheduler.submit("b", () => deferred().promise);
  scheduler.submit("c", () => deferred().promise);
  assert.equal(scheduler.cancelQueued("b"), true);
  assert.equal(scheduler.positionOf("c"), 1);
  assert.deepEqual([...positions.at(-1)!], [["c", 1]]);
  assert.equal(scheduler.cancelQueued("a"), false, "running jobs aren't cancelled through the queue");
});

test("refuses new runs once the queue is full", () => {
  const scheduler = new RunScheduler({ limit: 1, maxQueue: 2 });
  scheduler.submit("a", () => deferred().promise);
  scheduler.submit("b", () => deferred().promise);
  scheduler.submit("c", () => deferred().promise);
  assert.deepEqual(scheduler.submit("d", () => deferred().promise), {
    status: "rejected",
    reason: "queue-full",
  });
});

test("a newcomer never jumps an existing queue even if a slot looks free", () => {
  const scheduler = new RunScheduler({ limit: 2, maxQueue: 5 });
  scheduler.submit("a", () => deferred().promise);
  scheduler.submit("b", () => deferred().promise);
  scheduler.submit("c", () => deferred().promise);
  assert.deepEqual(scheduler.submit("d", () => deferred().promise), { status: "queued", position: 2 });
});

test("intFromEnv clamps and falls back", () => {
  assert.equal(intFromEnv(undefined, 2, 1, 4), 2);
  assert.equal(intFromEnv("abc", 2, 1, 4), 2);
  assert.equal(intFromEnv("0", 2, 1, 4), 1);
  assert.equal(intFromEnv("9", 2, 1, 4), 4);
  assert.equal(intFromEnv("3", 2, 1, 4), 3);
});

test("release frees a hung run's slot immediately, and its late settle changes nothing", async () => {
  const scheduler = new RunScheduler({ limit: 1, maxQueue: 5 });
  const hung = deferred();
  scheduler.submit("a", () => hung.promise);
  scheduler.submit("b", () => deferred().promise);
  scheduler.submit("c", () => deferred().promise);

  assert.equal(scheduler.release("a"), true);
  assert.deepEqual(scheduler.snapshot().running, ["b"]);
  assert.equal(scheduler.release("a"), false, "second release is a no-op");

  hung.resolve(); // the hung browser session finally returns
  await tick();
  assert.deepEqual(scheduler.snapshot().running, ["b"], "c must not be started by a stale settle");
  assert.deepEqual(scheduler.snapshot().queued, ["c"]);
});
