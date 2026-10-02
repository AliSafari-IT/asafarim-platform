import assert from "node:assert/strict";
import { mock, test } from "node:test";

/**
 * Route-level half of the tester gate (#698): each tester-only write route
 * refuses a non-tester on its own, even when src/proxy.ts is bypassed (the
 * handlers are called directly here — no proxy runs).
 *
 * `@asafarim/auth` is mocked so `auth()` returns whatever session a test sets,
 * and `server-only` is stubbed because node:test doesn't run with the
 * react-server condition.
 */
let session: { user: { id: string; roles: string[] } } | null = null;

mock.module("server-only", { namedExports: {} });
mock.module("@asafarim/auth", { namedExports: { auth: async () => session } });
// The run log is durable (DB-backed) since #716; these tests are about the
// guard, so stand in for it: no run exists.
mock.module("../../../test-engine/executors/runLog.ts", {
  namedExports: {
    getRun: async () => undefined,
    cancelRun: async () => false,
    createRun: async () => {},
    setRunMeta: async () => {},
    appendLog: () => {},
    scheduleRun: async () => ({ status: "running" }),
    getActiveRunFor: async () => null,
    getCapacity: async () => ({ limit: 2, maxQueue: 20, running: [], queued: [] }),
    runStore: () => ({ recentRunTimes: async () => [] }),
    runnerMode: () => "inprocess",
    completeRun: async () => {},
    failRun: async () => {},
    runSignal: () => undefined,
    isRunFinished: () => true,
  },
});

const run = await import("../run/route");
const cancel = await import("../run/[runId]/route");
const seed = await import("../seed/route");
const generate = await import("../issues/generate/route");
const issues = await import("../issues/route");
const publish = await import("../issues/[issueId]/publish/route");

const json = (body: unknown) =>
  new Request("http://testora.test/api", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });

// Bodies that would otherwise reach DB/runner work — the guard must answer first.
const CALLS: [string, () => Promise<Response>][] = [
  ["POST /api/run", () => run.POST(json({ all: true }))],
  ["DELETE /api/run/:id", () => cancel.DELETE(new Request("http://testora.test"), { params: Promise.resolve({ runId: "r_1" }) })],
  ["POST /api/seed", () => seed.POST(json({}))],
  ["POST /api/issues/generate", () => generate.POST(json({ projectId: "p_1" }))],
  ["POST /api/issues", () => issues.POST(json({ projectId: "p_1", title: "t" }))],
  ["POST /api/issues/:id/publish", () => publish.POST(new Request("http://testora.test"), { params: Promise.resolve({ issueId: "i_1" }) })],
];

for (const roles of [["standard_user"], ["guest"], []]) {
  test(`requireTester refuses ${roles.join("+") || "no roles"} on every tester route without the proxy`, async () => {
    session = { user: { id: "u_1", roles } };
    for (const [name, call] of CALLS) {
      const res = await call();
      assert.equal(res.status, 403, name);
      const body = (await res.json()) as { code?: string; error?: string };
      assert.equal(body.code, "TESTER_ROLE_REQUIRED", name);
      assert.match(body.error ?? "", /sign out and back in/, name);
    }
  });
}

test("requireTester answers 401 when there is no session", async () => {
  session = null;
  for (const [name, call] of CALLS) {
    assert.equal((await call()).status, 401, name);
  }
});

test("a tester gets past the guard (the route's own checks answer instead)", async () => {
  session = { user: { id: "u_1", roles: ["tester"] } };
  // Cancelling an unknown run: past the guard, the route answers 404.
  const res = await cancel.DELETE(new Request("http://testora.test"), {
    params: Promise.resolve({ runId: "missing" }),
  });
  assert.equal(res.status, 404);
});
