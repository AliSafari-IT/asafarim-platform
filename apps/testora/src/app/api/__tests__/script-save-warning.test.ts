import assert from "node:assert/strict";
import { mock, test } from "node:test";

/**
 * #714 item 2 — a script saved through the UI that writes data gets the seed
 * lint's warning in the response, but is still saved (warn, don't block).
 */
type Row = Record<string, unknown>;
const state = { fixtureMetadata: {} as Row, stored: [] as Row[] };

const fakeDb = {
  insert: () => ({
    values: (values: Row) => ({
      returning: async () => {
        state.stored.push(values);
        return [values];
      },
    }),
  }),
  update: () => ({
    set: (values: Row) => ({
      where: () => ({
        returning: async () => {
          const row = { fixtureId: "f-1", scriptType: "scripted", setupScript: null, teardownScript: null, metadata: state.fixtureMetadata, ...values };
          state.stored.push(row);
          return [row];
        },
      }),
    }),
  }),
  query: {
    testFixtures: { findFirst: async () => ({ metadata: state.fixtureMetadata }) },
    testCases: { findFirst: async () => undefined },
  },
};

mock.module("server-only", { namedExports: {} });
mock.module("../../../db/client.ts", { namedExports: { db: fakeDb } });

const cases = await import("../cases/route");
const caseRoute = await import("../cases/[caseId]/route");
const fixture = await import("../fixtures/[fixtureId]/route");

const WRITES = "await t.request.post('https://app.test/api/items', { body: {} });";
const req = (method: string, body: unknown) =>
  new Request("http://testora.test/api", { method, headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
const scripted = (script: string) => ({ caseId: "c-1", fixtureId: "f-1", title: "C", scriptType: "scripted", script });

test("a writing script on an unguarded fixture is saved, with a warning in the response", async () => {
  state.fixtureMetadata = {};
  state.stored = [];
  const created = await cases.POST(req("POST", scripted(WRITES)));
  assert.equal(created.status, 201);
  const body = await created.json();
  assert.equal(body.testCase.script, WRITES, "saved as sent");
  assert.match(body.warning, /writes data/);

  const patched = await caseRoute.PATCH(req("PATCH", { scriptType: "scripted", script: WRITES }), { params: Promise.resolve({ caseId: "c-1" }) });
  assert.equal(patched.status, 200);
  assert.match((await patched.json()).warning, /writes data/);

  const setup = await fixture.PATCH(req("PATCH", { setupScript: WRITES }), { params: Promise.resolve({ fixtureId: "f-1" }) });
  assert.equal(setup.status, 200);
  assert.match((await setup.json()).warning, /writes data/);
  assert.equal(state.stored.length, 3, "all three were stored");
});

test("no warning when the fixture is destructive, the script only reads, or no script changed", async () => {
  state.fixtureMetadata = { destructive: true };
  assert.equal((await (await cases.POST(req("POST", scripted(WRITES)))).json()).warning, undefined);
  state.fixtureMetadata = {};
  assert.equal((await (await cases.POST(req("POST", scripted("await t.click(Selector('a'));")))).json()).warning, undefined);
  const renamed = await caseRoute.PATCH(req("PATCH", { title: "Renamed" }), { params: Promise.resolve({ caseId: "c-1" }) });
  assert.equal((await renamed.json()).warning, undefined);
});
