import assert from "node:assert/strict";
import { mock, test } from "node:test";
import { planScopeError } from "../../../lib/run-scope";

/**
 * #712: POST /api/run must refuse a scope (fixture/suite/requirement id or a
 * case selection) whose fixtures belong to another project than the run's —
 * and start no run. The real route handler is exercised with its DB-backed
 * collaborators mocked: plan loaders return fixtures tagged with projectIds,
 * and the run log is a spy so we can prove no run was created.
 */

type Unit = { suiteTitle: string; projectId: string | null; fixture: Record<string, unknown>; cases: unknown[] };
const unit = (fixtureId: string, projectId: string | null): Unit => ({
  suiteTitle: "S",
  projectId,
  fixture: { fixtureId, suiteId: "s", title: fixtureId, baseUrl: "http://localhost:3010/", commonInput: {} },
  cases: [{ caseId: `${fixtureId}-c`, fixtureId, title: "c", scriptType: "scripted", expected: {}, script: "" }],
});

let nextPlan: { label: string; units: Unit[] } | null = null;
const created: string[] = [];

mock.module("server-only", { namedExports: {} });
mock.module("next/headers", { namedExports: { cookies: async () => ({ get: () => undefined }) } });
mock.module("@asafarim/auth", {
  namedExports: { auth: async () => ({ user: { id: "u_tester", name: "T", roles: ["tester"] } }) },
});
mock.module("../../../lib/app-access.ts", { namedExports: { isProjectViewable: async () => true } });
mock.module("../../../test-engine/executors/testExecutor.ts", {
  namedExports: {
    executeFixture: async () => [],
    loadFixtureRunPlan: async () => nextPlan,
    loadSuiteRunPlan: async () => nextPlan,
    loadRequirementRunPlan: async () => nextPlan,
    loadSelectionRunPlan: async () => nextPlan,
    loadAllRunPlan: async () => nextPlan,
  },
});
mock.module("../../../test-engine/executors/runLog.ts", {
  namedExports: {
    createRun: (id: string) => created.push(id),
    setRunMeta: () => {},
    appendLog: () => {},
    completeRun: () => {},
    failRun: () => {},
    getRun: () => undefined,
    // Admit without running anything in the background.
    scheduleRun: () => ({ status: "running" }),
    getActiveRunFor: () => null,
    getCapacity: () => ({ running: [], queued: [], limit: 2 }),
    // Durable run log (#716): rate-limit history + the executor's hooks.
    runStore: () => ({ recentRunTimes: async () => [] }),
    runnerMode: () => "inprocess",
    runSignal: () => undefined,
    isRunFinished: () => false,
  },
});
// The ownership query: no project rows (local targets need no proof anyway).
const chain = { from: () => chain, where: async () => [] };
mock.module("../../../db/client.ts", {
  namedExports: { db: { select: () => chain, query: { targetEnvironments: { findFirst: async () => undefined }, projects: { findFirst: async () => undefined } } } },
});

const { POST } = await import("../run/route");

const post = (body: Record<string, unknown>) =>
  POST(new Request("http://testora.test/api/run", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) }));

test("a fixture/suite/requirement id from another project returns 404 and starts no run", async () => {
  for (const scope of [{ fixtureId: "b-fix" }, { suiteId: "b-suite" }, { frId: "b-fr" }]) {
    nextPlan = { label: "x", units: [unit("b-fix", "app-b")] };
    created.length = 0;
    const res = await post({ ...scope, projectId: "app-a" });
    assert.equal(res.status, 404, JSON.stringify(scope));
    const body = (await res.json()) as { code?: string };
    assert.equal(body.code, "RUN_SCOPE_NOT_IN_PROJECT");
    assert.equal(created.length, 0, "no run may be created");
  }
});

test("a mixed-project case selection is refused", async () => {
  nextPlan = { label: "2 selected case(s)", units: [unit("a-fix", "app-a"), unit("b-fix", "app-b")] };
  created.length = 0;
  const res = await post({ cases: [{ fixtureId: "a-fix", caseId: "a-fix-c" }, { fixtureId: "b-fix", caseId: "b-fix-c" }], projectId: "app-a" });
  assert.equal(res.status, 404);
  const body = (await res.json()) as { code?: string; error?: string };
  assert.equal(body.code, "RUN_SCOPE_NOT_IN_PROJECT");
  assert.match(body.error ?? "", /mixes tests from different apps/);
  assert.equal(created.length, 0);
});

test("a single-project run is unchanged: admitted (202) and created", async () => {
  nextPlan = { label: 'fixture "a-fix"', units: [unit("a-fix", "app-a")] };
  created.length = 0;
  const res = await post({ fixtureId: "a-fix", projectId: "app-a" });
  assert.equal(res.status, 202);
  assert.equal(((await res.json()) as { status?: string }).status, "running");
  assert.equal(created.length, 1);
});

test("planScopeError: same project passes; foreign or untagged units don't", () => {
  assert.equal(planScopeError([unit("a", "app-a")].map((u) => ({ ...u, fixture: { fixtureId: "a" } })), "app-a"), null);
  assert.equal(planScopeError([{ projectId: null, fixture: { fixtureId: "x" } }], "app-a")?.status, 404);
  assert.match(planScopeError([{ projectId: "app-b", fixture: { fixtureId: "x" } }], "app-a")!.body.error, /No such tests/);
});
