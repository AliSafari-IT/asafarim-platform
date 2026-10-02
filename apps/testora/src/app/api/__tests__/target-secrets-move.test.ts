import assert from "node:assert/strict";
import { mock, test } from "node:test";
import { originChanges, secretsMoveDecision } from "../../../lib/target-origin-change";

/**
 * #713 — PATCH /api/targets must not silently move stored secrets to another
 * origin. The real route handler runs against an in-memory stand-in for the
 * Drizzle client (only the calls the handler makes).
 */

type Row = Record<string, unknown>;
const state = {
  target: null as Row | null,
  secrets: [] as { name: string }[],
  deletedSecrets: 0,
  audit: [] as Row[],
};

const fakeDb = {
  query: { targetEnvironments: { findFirst: async () => state.target } },
  select: () => ({ from: () => ({ where: async () => state.secrets }) }),
  transaction: async <T>(work: (tx: unknown) => Promise<T>) =>
    work({
      update: () => ({
        set: (values: Row) => ({
          where: () => ({
            returning: async () => {
              state.target = { ...state.target, ...values };
              return [state.target];
            },
          }),
        }),
      }),
      delete: () => ({
        where: async () => {
          state.deletedSecrets = state.secrets.length;
          state.secrets = [];
        },
      }),
      insert: () => ({
        values: async (rows: Row[]) => {
          state.audit.push(...rows);
        },
      }),
    }),
};

mock.module("../../../db/client.ts", { namedExports: { db: fakeDb } });
mock.module("@asafarim/auth", {
  namedExports: { auth: async () => ({ user: { id: "u_admin", name: "Admin", roles: ["admin"] } }) },
});

const { PATCH } = await import("../targets/route");

function reset(secretNames: string[]) {
  state.target = {
    id: "t1",
    projectId: "acme",
    seeded: false,
    name: "Staging",
    baseUrl: "https://staging.acme.test/app",
    apiUrl: "https://api.acme.test/v1",
    hubUrl: null,
  };
  state.secrets = secretNames.map((name) => ({ name }));
  state.deletedSecrets = 0;
  state.audit = [];
}

const patch = (body: Record<string, unknown>) =>
  PATCH(
    new Request("http://testora.test/api/targets?id=t1", {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
    }),
  );

test("an origin change on a target with secrets and no confirmation is refused with 409", async () => {
  reset(["LOGIN_EMAIL", "LOGIN_PASSWORD"]);
  const res = await patch({ baseUrl: "https://evil.example.org/app" });
  assert.equal(res.status, 409);
  const body = (await res.json()) as { code: string; secrets: string[]; changes: { field: string; from: string; to: string }[] };
  assert.equal(body.code, "TARGET_HAS_SECRETS");
  assert.deepEqual(body.secrets, ["LOGIN_EMAIL", "LOGIN_PASSWORD"]);
  assert.deepEqual(body.changes, [{ field: "baseUrl", from: "https://staging.acme.test", to: "https://evil.example.org" }]);
  assert.equal(state.target!.baseUrl, "https://staging.acme.test/app", "nothing changed");
  assert.equal(state.audit.length, 0);
});

test("with confirmation it succeeds — keeping the secrets, and the move is audited", async () => {
  reset(["LOGIN_PASSWORD"]);
  const res = await patch({ baseUrl: "https://new.acme.test/app", confirmSecretsMove: true, secretsAction: "keep" });
  assert.equal(res.status, 200);
  assert.equal(state.target!.baseUrl, "https://new.acme.test/app");
  assert.equal(state.secrets.length, 1, "secrets kept");
  assert.equal(state.target!.confirmSecretsMove, undefined, "control fields are not written to the row");
  assert.equal(state.audit.length, 1);
  assert.deepEqual(
    { field: state.audit[0]!.field, from: state.audit[0]!.fromOrigin, to: state.audit[0]!.toOrigin, action: state.audit[0]!.secretsAction, user: state.audit[0]!.userId },
    { field: "baseUrl", from: "https://staging.acme.test", to: "https://new.acme.test", action: "keep", user: "u_admin" },
  );
});

test("with confirmation and 'clear', the secrets are removed", async () => {
  reset(["LOGIN_EMAIL", "LOGIN_PASSWORD"]);
  const res = await patch({ apiUrl: "https://other.example.org/v1", confirmSecretsMove: true, secretsAction: "clear" });
  assert.equal(res.status, 200);
  assert.deepEqual(((await res.json()) as { secretsCleared: string[] }).secretsCleared, ["LOGIN_EMAIL", "LOGIN_PASSWORD"]);
  assert.equal(state.deletedSecrets, 2);
  assert.equal(state.audit[0]!.secretsAction, "clear");
});

test("a path-only change needs no confirmation and isn't an origin move", async () => {
  reset(["LOGIN_PASSWORD"]);
  const res = await patch({ baseUrl: "https://staging.acme.test/other/path", apiUrl: "https://api.acme.test/v2" });
  assert.equal(res.status, 200);
  assert.equal(state.target!.baseUrl, "https://staging.acme.test/other/path");
  assert.equal(state.audit.length, 0);
  assert.equal(state.secrets.length, 1);
});

test("a target without secrets moves freely, but the move is still audited", async () => {
  reset([]);
  const res = await patch({ hubUrl: "https://hub.acme.test" });
  assert.equal(res.status, 200);
  assert.equal(state.audit.length, 1);
  assert.deepEqual([state.audit[0]!.field, state.audit[0]!.fromOrigin, state.audit[0]!.secretsAction], ["hubUrl", null, "none"]);
});

test("originChanges / secretsMoveDecision", () => {
  const existing = { baseUrl: "https://a.test/x", apiUrl: "https://a.test/api", hubUrl: "https://hub.test" };
  assert.deepEqual(originChanges(existing, { baseUrl: "https://a.test/y" }), []);
  assert.deepEqual(originChanges(existing, { name: "x" } as never), []);
  assert.deepEqual(originChanges(existing, { hubUrl: null }), [{ field: "hubUrl", from: "https://hub.test", to: null }]);
  assert.deepEqual(originChanges(existing, { apiUrl: "http://a.test/api" }), [
    { field: "apiUrl", from: "https://a.test", to: "http://a.test" },
  ], "a scheme change is an origin change");
  const changes = originChanges(existing, { baseUrl: "https://b.test" });
  assert.equal(secretsMoveDecision({ changes, secretNames: [] }).ok, true);
  assert.equal(secretsMoveDecision({ changes, secretNames: ["X"] }).ok, false);
  assert.deepEqual(secretsMoveDecision({ changes, secretNames: ["X"], confirmSecretsMove: true }), { ok: true, clearSecrets: false });
  assert.deepEqual(secretsMoveDecision({ changes, secretNames: ["X"], confirmSecretsMove: true, secretsAction: "clear" }), { ok: true, clearSecrets: true });
});
