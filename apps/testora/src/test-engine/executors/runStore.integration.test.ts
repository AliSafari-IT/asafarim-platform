import assert from "node:assert/strict";
import { after, before, beforeEach, test } from "node:test";
import { fileURLToPath } from "node:url";
import { Pool } from "pg";
import { drizzle } from "drizzle-orm/node-postgres";
import { migrate } from "drizzle-orm/node-postgres/migrator";
import { createRunStore, type RunStore } from "./runStore";

/**
 * Integration tests for the durable run queue (#716) against a real Postgres.
 *
 * Needs TESTORA_TEST_DATABASE_URL pointing at a THROWAWAY database (every test
 * truncates `runs`); refuses the dev database. Skipped when unset, e.g.:
 *   docker exec e2e-testora-db psql -U e2e_testora -d e2e-testing-db -c "create database testora_test"
 *   TESTORA_TEST_DATABASE_URL=postgres://e2e_testora:e2e_testora@127.0.0.1:55434/testora_test \
 *     pnpm --filter testora test:integration
 */
const url = process.env.TESTORA_TEST_DATABASE_URL;
const devUrl = process.env.TESTORA_DATABASE_URL ?? "postgres://e2e_testora:e2e_testora@127.0.0.1:55434/e2e-testing-db";
const skip = !url ? "TESTORA_TEST_DATABASE_URL is not set" : url === devUrl ? "refusing to run against the dev database" : false;

let pool: Pool;
const LEASE_MS = 30_000;
const store = (limit: number, maxQueue = 20): RunStore => createRunStore(pool, { limit, maxQueue, leaseMs: LEASE_MS });

before(async () => {
  if (skip) return;
  pool = new Pool({ connectionString: url });
  await migrate(drizzle(pool), {
    migrationsFolder: fileURLToPath(new URL("../../db/migrations", import.meta.url)),
  });
});
after(async () => {
  await pool?.end();
});
beforeEach(async () => {
  if (skip) return;
  await pool.query("TRUNCATE runs CASCADE");
});

async function queueRun(s: RunStore, id: string, owner = "host-a:1:aaa") {
  await s.create({ id, ownerId: "u1", ownerName: "U", rateKey: "target:t1" });
  // Distinct queued_at so FIFO order is deterministic.
  await new Promise((r) => setTimeout(r, 5));
  return s.admit(id, `job-${id}`, owner);
}

test("lease ordering: one slot, FIFO queue, the next run claims the freed slot", { skip }, async () => {
  const s = store(1);
  const r1 = await queueRun(s, "r1");
  assert.deepEqual(r1.admission, { status: "running" });
  assert.deepEqual(r1.claimed.map((r) => r.id), ["r1"]);
  assert.equal(r1.claimed[0]!.leaseOwner, "host-a:1:aaa");
  assert.deepEqual((await queueRun(s, "r2")).admission, { status: "queued", position: 1 });
  assert.deepEqual((await queueRun(s, "r3")).admission, { status: "queued", position: 2 });

  // Nothing frees up while r1 runs.
  assert.deepEqual(await s.claimNext("host-a:1:aaa"), []);
  await s.finish("r1", "done");
  const next = await s.claimNext("host-a:1:aaa");
  assert.deepEqual(next.map((r) => r.id), ["r2"], "oldest queued run first");
  assert.equal(next[0]!.jobEnc, "job-r2", "the claimer gets the frozen job");
  assert.equal(await s.position("r3"), 1);
});

test("capacity: the limit holds, and a full queue rejects", { skip }, async () => {
  const s = store(2, 1);
  assert.equal((await queueRun(s, "a")).admission.status, "running");
  assert.equal((await queueRun(s, "b")).admission.status, "running");
  assert.deepEqual((await queueRun(s, "c")).admission, { status: "queued", position: 1 });
  assert.deepEqual((await queueRun(s, "d")).admission, { status: "rejected", reason: "queue-full" });
  const d = await s.get("d");
  assert.equal(d?.status, "error");
  assert.equal(d?.error, "The test queue is full");
  const snap = await s.snapshot();
  assert.deepEqual([snap.running.length, snap.queued.length], [2, 1]);
});

test("capacity holds under concurrent admissions (advisory lock + SKIP LOCKED)", { skip }, async () => {
  const s = store(2);
  const ids = Array.from({ length: 8 }, (_, i) => `c${i}`);
  for (const id of ids) await s.create({ id });
  const results = await Promise.all(ids.map((id) => s.admit(id, "job", "host-a:1:aaa")));
  assert.equal(results.filter((r) => r.admission.status === "running").length, 2);
  assert.equal((await s.snapshot()).running.length, 2);
  const positions = results.filter((r) => r.admission.status === "queued").map((r) => (r.admission as { position: number }).position);
  assert.equal(positions.length, 6);
});

test("cancel: a queued run leaves the queue; a running run is flagged for its process", { skip }, async () => {
  const s = store(1);
  await queueRun(s, "run");
  await queueRun(s, "wait1");
  await queueRun(s, "wait2");

  assert.equal(await s.requestCancel("wait1"), "dequeued");
  assert.equal((await s.get("wait1"))?.status, "cancelled");
  assert.equal(await s.position("wait2"), 1, "the queue closes up");

  assert.equal(await s.requestCancel("run"), "flagged");
  const beat = await s.heartbeat("host-a:1:aaa", ["run"]);
  assert.deepEqual(beat, { renewed: ["run"], cancel: ["run"] });
  assert.equal(await s.requestCancel("run"), null, "a second cancel is a no-op");
  // Still holds its slot until its process finishes it.
  assert.deepEqual(await s.claimNext("host-a:1:aaa"), []);
  assert.equal(await s.finish("run", "cancelled", "Run cancelled"), true);
  assert.deepEqual((await s.claimNext("host-a:1:aaa")).map((r) => r.id), ["wait2"]);
});

test("restart sweep: runs of a dead instance become 'runner lost'; queued runs resume", { skip }, async () => {
  const s = store(1);
  await queueRun(s, "inflight", "host-a:111:old");
  await queueRun(s, "queued", "host-a:111:old");

  // The new instance on the same host boots.
  const lost = await s.sweepLost({ deadOwnerPrefix: "host-a:", currentOwner: "host-a:222:new" });
  assert.deepEqual(lost, ["inflight"]);
  const row = await s.get("inflight");
  assert.equal(row?.status, "error");
  assert.equal(row?.error, "runner lost");
  assert.equal(row?.jobEnc, null, "the frozen job (with secrets) is dropped");

  // Not re-queued; the queued run starts in the new instance.
  const resumed = await s.claimNext("host-a:222:new");
  assert.deepEqual(resumed.map((r) => r.id), ["queued"]);
  assert.equal(resumed[0]!.leaseOwner, "host-a:222:new");
});

test("restart sweep: a lapsed lease from another host is failed; a live one isn't", { skip }, async () => {
  const s = store(2);
  await queueRun(s, "other-host", "host-b:9:x");
  await queueRun(s, "mine", "host-a:1:aaa");
  assert.deepEqual(await s.sweepLost(), [], "leases still valid");
  await pool.query("UPDATE runs SET lease_expires_at = now() - interval '1 second' WHERE id = 'other-host'");
  assert.deepEqual(await s.sweepLost(), ["other-host"]);
  assert.equal((await s.get("mine"))?.status, "running");
  // Heartbeat only renews the caller's own leases.
  assert.deepEqual((await s.heartbeat("host-a:1:aaa", ["mine", "other-host"])).renewed, ["mine"]);
});

test("events: ordered seq per run, read after a cursor, safe under concurrent appends", { skip }, async () => {
  const s = store(1);
  await s.create({ id: "ev" });
  assert.equal(await s.append("ev", "meta", { totalRuns: 3, label: "x" }), 1);
  assert.equal(await s.append("ev", "log", "line one"), 2);
  const seqs = await Promise.all(Array.from({ length: 10 }, (_, i) => s.append("ev", "log", `p${i}`)));
  assert.deepEqual([...seqs].sort((a, b) => a - b), [3, 4, 5, 6, 7, 8, 9, 10, 11, 12]);
  const tail = await s.eventsAfter("ev", 1);
  assert.equal(tail[0]!.payload, "line one");
  assert.equal(tail.length, 11);
});

test("events: 60 parallel appends to one run, interleaved with another, get exactly 1..n (#740)", { skip }, async () => {
  const s = store(1);
  await s.create({ id: "hot" });
  await s.create({ id: "side" });
  const N = 60;
  const M = 15;
  const hot = Array.from({ length: N }, (_, i) => () => s.append("hot", "log", `h${i}`));
  const side = Array.from({ length: M }, (_, i) => () => s.append("side", "log", `s${i}`));
  // Interleave: every fourth call goes to the other run.
  const calls = hot.flatMap((h, i) => (i % 4 === 0 && side[i / 4] ? [h, side[i / 4]!] : [h]));
  const results = await Promise.all(calls.map((call) => call()));
  assert.equal(results.length, N + M);

  const range = (n: number) => Array.from({ length: n }, (_, i) => i + 1);
  assert.deepEqual((await s.eventsAfter("hot", 0)).map((e) => e.seq), range(N), "no gaps, no duplicates");
  assert.deepEqual((await s.eventsAfter("side", 0)).map((e) => e.seq), range(M), "the other run is unaffected");
  const { rows } = await pool.query("SELECT id, event_seq FROM runs WHERE id IN ('hot', 'side') ORDER BY id");
  assert.deepEqual(rows, [{ id: "hot", event_seq: N }, { id: "side", event_seq: M }]);
});

test("events: continues after events written without the counter (previous release mid-deploy)", { skip }, async () => {
  const s = store(1);
  await s.create({ id: "drift" });
  assert.equal(await s.append("drift", "log", "new code"), 1);
  // The old release's INSERT: seq = max + 1, event_seq untouched.
  await pool.query("INSERT INTO run_events (run_id, seq, kind, payload) VALUES ('drift', 2, 'log', '\"old code\"')");
  assert.equal(await s.append("drift", "log", "new code again"), 3);
  assert.deepEqual((await s.eventsAfter("drift", 0)).map((e) => e.seq), [1, 2, 3]);
});

test("events: appending to an unknown run fails clearly", { skip }, async () => {
  const s = store(1);
  await assert.rejects(s.append("no-such-run", "log", "x"), /run_events: no run no-such-run/);
  const { rows } = await pool.query("SELECT count(*)::int AS n FROM run_events");
  assert.equal(rows[0].n, 0);
});

test("rate limit history and retention come from the table", { skip }, async () => {
  const s = store(5);
  await queueRun(s, "x1");
  await queueRun(s, "x2");
  assert.equal((await s.recentRunTimes("target:t1", 60 * 60 * 1000)).length, 2, "survives a restart: it's in the DB");
  await s.finish("x1", "done");
  await pool.query("UPDATE runs SET finished_at = now() - interval '8 days' WHERE id = 'x1'");
  assert.equal(await s.prune(7 * 24 * 60 * 60 * 1000), 1);
  assert.equal(await s.get("x1"), null);
});

test("remote runner: queue without claiming, then a runner claims with a lease-token hash", { skip }, async () => {
  const s = store(1);
  await s.create({ id: "rq" });
  const { admission, claimed } = await s.admit("rq", "job", "web:1:a", { claim: false });
  assert.deepEqual([admission, claimed], [{ status: "queued", position: 1 }, []], "remote mode: the web only queues");
  const row = await s.claimForRunner("runner:host:9", "hash-1");
  assert.equal(row?.id, "rq");
  assert.equal(row?.leaseOwner, "runner:host:9");
  assert.equal(row?.runnerLeaseTokenHash, "hash-1");
  assert.equal(await s.claimForRunner("runner:host:9", "hash-2"), null, "the limit holds for runners too");

  assert.deepEqual(await s.renewRunnerLease("rq"), { cancel: false });
  await s.requestCancel("rq");
  assert.deepEqual(await s.renewRunnerLease("rq"), { cancel: true }, "the events call learns about the cancel");
  await s.finish("rq", "cancelled", "Run cancelled");
  const done = await s.get("rq");
  assert.equal(done?.runnerLeaseTokenHash, null, "the lease token dies with the run");
  assert.equal(await s.renewRunnerLease("rq"), null);
});

test("remote runner: a lost run whose cancel was requested ends cancelled, not 'runner lost'", { skip }, async () => {
  const s = store(1);
  await s.create({ id: "lost-cancelled" });
  await s.admit("lost-cancelled", "job", "web:1:a", { claim: false });
  await s.claimForRunner("runner:host:9", "h");
  await s.requestCancel("lost-cancelled");
  await pool.query("UPDATE runs SET lease_expires_at = now() - interval '1 second'");
  assert.deepEqual(await s.sweepLost(), [], "no 'runner lost' event for it");
  const row = await s.get("lost-cancelled");
  assert.deepEqual([row?.status, row?.error], ["cancelled", "Run cancelled"]);
});

test("a lapsed lease owned by an UNKNOWN host becomes 'runner lost' (the path Docker recovery relies on)", { skip }, async () => {
  const s = store(1);
  // A previous container (hostname long gone) left this run running.
  await queueRun(s, "orphan", "3f9c2a1b7d4e:1:dead");
  // The new container boots: its boot sweep matches only ITS host — nothing.
  assert.deepEqual(await s.sweepLost({ deadOwnerPrefix: "a1b2c3d4e5f6:", currentOwner: "a1b2c3d4e5f6:1:live" }), []);
  assert.equal((await s.get("orphan"))?.status, "running", "not swept while the lease holds");
  // Once the dead owner's lease lapses, the regular tick sweep fails it.
  await pool.query("UPDATE runs SET lease_expires_at = now() - interval '1 second' WHERE id = 'orphan'");
  assert.deepEqual(await s.sweepLost(), ["orphan"]);
  const row = await s.get("orphan");
  assert.deepEqual([row?.status, row?.error, row?.jobEnc], ["error", "runner lost", null]);
});
