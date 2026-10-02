import assert from "node:assert/strict";
import { mock, test } from "node:test";

/**
 * #714 item 1 — fixture and requirement URLs are run targets too (a run with
 * no target uses them), so saving them goes through the same network policy
 * as saved targets, and the per-fixture pre-run check refuses one that has
 * become disallowed since it was saved.
 *
 * The strict (production) policy is forced; IP literals need no DNS.
 */
process.env.TESTORA_TARGET_POLICY = "strict";
const BLOCKED = "http://169.254.169.254/latest";
const ALLOWED = "https://93.184.215.14/app";

let writes = 0;
const row = { id: "x" };
const fakeDb = {
  insert: () => ({
    values: () => ({
      returning: async () => {
        writes++;
        return [row];
      },
    }),
  }),
  update: () => ({
    set: () => ({
      where: () => ({
        returning: async () => {
          writes++;
          return [row];
        },
      }),
    }),
  }),
};

mock.module("server-only", { namedExports: {} });
mock.module("@asafarim/auth", {
  namedExports: { auth: async () => ({ user: { id: "u_admin", name: "Admin", roles: ["admin"] } }) },
});
mock.module("../../../db/client.ts", { namedExports: { db: fakeDb } });
mock.module("../../../test-engine/executors/runLog.ts", {
  namedExports: {
    appendLog: () => {},
    completeRun: async () => {},
    failRun: async () => {},
    runSignal: () => undefined,
    isRunFinished: () => true,
  },
});
mock.module("../../../test-engine/executors/testExecutor.ts", { namedExports: { executeFixture: async () => [] } });

const targets = await import("../targets/route");
const fixtures = await import("../fixtures/route");
const fixture = await import("../fixtures/[fixtureId]/route");
const requirements = await import("../requirements/route");
const requirement = await import("../requirements/[id]/route");
const { assertUnitTargets } = await import("../../../lib/run-executor");
const { resolveFixtureBaseUrl } = await import("../../../test-engine/resolveFixtureBaseUrl");

const req = (method: string, body: unknown) =>
  new Request("http://testora.test/api", {
    method,
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });

/** What saving a target with this URL answers — the reference response. */
async function targetAnswer(url: string) {
  const res = await targets.POST(req("POST", { projectId: "acme", name: "T", baseUrl: url, apiUrl: url }));
  return { status: res.status, body: await res.json() };
}

test("saving a fixture or requirement with a disallowed absolute baseUrl gets the same 4xx as a target", async () => {
  const expected = await targetAnswer(BLOCKED);
  assert.ok(expected.status >= 400 && expected.status < 500, `targets answer ${expected.status}`);
  writes = 0;

  const calls: [string, () => Promise<Response>][] = [
    ["POST /api/fixtures", () => fixtures.POST(req("POST", { fixtureId: "f-1", suiteId: "s", title: "F", baseUrl: BLOCKED }))],
    ["PATCH /api/fixtures/:id", () => fixture.PATCH(req("PATCH", { baseUrl: BLOCKED }), { params: Promise.resolve({ fixtureId: "f-1" }) })],
    ["POST /api/requirements", () => requirements.POST(req("POST", { id: "fr-1", title: "R", baseUrl: BLOCKED }))],
    ["PATCH /api/requirements/:id", () => requirement.PATCH(req("PATCH", { baseUrl: BLOCKED }), { params: Promise.resolve({ id: "fr-1" }) })],
  ];
  for (const [name, call] of calls) {
    const res = await call();
    assert.equal(res.status, expected.status, name);
    assert.deepEqual(await res.json(), expected.body, `${name}: same message as targets`);
  }
  assert.equal(writes, 0, "nothing was stored");
});

test("allowed, relative and empty baseUrls still save", async () => {
  writes = 0;
  const saved = [
    await fixtures.POST(req("POST", { fixtureId: "f-2", suiteId: "s", title: "F", baseUrl: ALLOWED })),
    await fixtures.POST(req("POST", { fixtureId: "f-3", suiteId: "s", title: "F", baseUrl: "/login" })),
    await fixture.PATCH(req("PATCH", { baseUrl: "" }), { params: Promise.resolve({ fixtureId: "f-2" }) }),
    await requirements.POST(req("POST", { id: "fr-2", title: "R", baseUrl: ALLOWED })),
    await requirement.PATCH(req("PATCH", { title: "Renamed" }), { params: Promise.resolve({ id: "fr-2" }) }),
  ];
  assert.deepEqual(saved.map((r) => r.status), [201, 201, 200, 201, 200]);
  assert.equal(writes, 5);
});

test("a run with no target refuses a stored fixture URL that has become disallowed, before launch", async () => {
  const unit = (frBaseUrl: string | null, fixtureBaseUrl: string | null) => ({
    suiteTitle: "S",
    fixture: { fixtureId: "f", suiteId: "s", title: "F", baseUrl: resolveFixtureBaseUrl(frBaseUrl, fixtureBaseUrl), commonInput: {} },
    cases: [],
  });
  // Saved before the check existed: an absolute fixture URL, and a relative one
  // under a requirement whose root is now disallowed.
  await assert.rejects(assertUnitTargets(unit(null, BLOCKED), undefined, undefined), /Blocked by the target policy/);
  await assert.rejects(assertUnitTargets(unit("http://10.0.0.5", "/login"), undefined, undefined), /Blocked by the target policy/);
  await assertUnitTargets(unit(ALLOWED, "/login"), undefined, undefined);
});
