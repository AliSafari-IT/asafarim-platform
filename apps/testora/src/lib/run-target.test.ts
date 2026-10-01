import assert from "node:assert/strict";
import { test } from "node:test";
import { checkStoredUrls, resolveRunTarget, type StoredTarget } from "./run-target";
import type { LookupFn } from "./target-policy";

const TARGETS: StoredTarget[] = [
  {
    id: "asafarim-timelineai:remote",
    projectId: "asafarim-timelineai",
    name: "Remote",
    baseUrl: "https://tlai.asafarim.com",
    apiUrl: "https://tlai.asafarim.com/api",
  },
  {
    id: "asafarim-timelineai:local",
    projectId: "asafarim-timelineai",
    name: "Local",
    baseUrl: "http://localhost:3010",
    apiUrl: "http://localhost:3010/api",
  },
  {
    id: "other:remote",
    projectId: "other-app",
    name: "Remote",
    baseUrl: "https://example.com",
    apiUrl: "https://example.com/api",
  },
];

const lookup: LookupFn = async (hostname) => {
  const table: Record<string, string> = { "tlai.asafarim.com": "82.25.116.73", "example.com": "93.184.215.14", "evil.example.net": "10.0.0.7" };
  const address = table[hostname];
  if (!address) throw new Error("ENOTFOUND");
  return [{ address, family: 4 }];
};

const context = (isAdmin: boolean, production = true) => ({
  projectId: "asafarim-timelineai",
  isAdmin,
  production,
  lookup,
  findTarget: async (id: string) => TARGETS.find((t) => t.id === id),
});

test("a tester runs via targetId: the stored row's URLs are used", async () => {
  const result = await resolveRunTarget({ all: true, targetId: "asafarim-timelineai:remote" }, context(false));
  assert.deepEqual(result, {
    ok: true,
    target: { baseUrl: "https://tlai.asafarim.com", apiUrl: "https://tlai.asafarim.com/api", targetName: "Remote" },
  });
});

test("a non-admin run with a raw URL is refused with 403", async () => {
  for (const body of [{ baseUrl: "https://tlai.asafarim.com" }, { apiUrl: "https://tlai.asafarim.com/api" }, { baseUrl: "http://testora-postgres:5432" }]) {
    const result = await resolveRunTarget({ all: true, ...body }, context(false));
    assert.equal(result.ok, false);
    if (!result.ok) {
      assert.equal(result.status, 403);
      assert.equal(result.body.code, "RAW_TARGET_ADMIN_ONLY");
    }
  }
});

test("an admin may use raw URLs, still subject to the network policy", async () => {
  const ok = await resolveRunTarget({ baseUrl: "https://example.com" }, context(true));
  assert.equal(ok.ok, true);
  const blocked = await resolveRunTarget({ baseUrl: "http://testora-postgres:5432" }, context(true));
  assert.equal(blocked.ok, false);
  if (!blocked.ok) assert.equal(blocked.body.code, "TARGET_HOST_NOT_ALLOWED");
  const internal = await resolveRunTarget({ apiUrl: "https://evil.example.net" }, context(true));
  assert.equal(internal.ok, false);
  if (!internal.ok) assert.equal(internal.body.code, "TARGET_ADDRESS_NOT_ALLOWED");
});

test("a target of another app, or an unknown id, is 404", async () => {
  for (const targetId of ["other:remote", "nope"]) {
    const result = await resolveRunTarget({ targetId }, context(false));
    assert.equal(result.ok, false);
    if (!result.ok) {
      assert.equal(result.status, 404);
      assert.equal(result.body.code, "TARGET_NOT_FOUND");
    }
  }
});

test("targetId and raw URLs together are ambiguous", async () => {
  const result = await resolveRunTarget({ targetId: "asafarim-timelineai:remote", baseUrl: "https://example.com" }, context(true));
  assert.equal(result.ok, false);
  if (!result.ok) assert.equal(result.body.code, "AMBIGUOUS_TARGET");
});

test("a stored Local (localhost) target works in dev but is refused in production", async () => {
  const dev = await resolveRunTarget({ targetId: "asafarim-timelineai:local" }, context(false, false));
  assert.equal(dev.ok, true);
  const prod = await resolveRunTarget({ targetId: "asafarim-timelineai:local" }, context(false, true));
  assert.equal(prod.ok, false);
  if (!prod.ok) assert.equal(prod.body.code, "TARGET_HOST_NOT_ALLOWED");
});

test("no target at all = the fixtures' own URLs", async () => {
  assert.deepEqual(await resolveRunTarget({ all: true }, context(false)), {
    ok: true,
    target: { baseUrl: undefined, apiUrl: undefined },
  });
});

test("saving target/project URLs applies the policy; empty URLs are fine", async () => {
  assert.equal(await checkStoredUrls(["", undefined, "https://example.com"], { production: true, lookup }), null);
  const blocked = await checkStoredUrls(["https://example.com", "http://169.254.169.254/"], { production: true, lookup });
  assert.equal(blocked?.body.code, "TARGET_ADDRESS_NOT_ALLOWED");
  const userinfo = await checkStoredUrls(["https://admin:pw@example.com"], { production: false });
  assert.equal(userinfo?.status, 400);
});

test("raw URLs that exactly match a stored target or the app's own URLs count as stored", async () => {
  const withPairs = {
    ...context(false),
    storedUrlPairs: async () => [
      { baseUrl: "https://tlai.asafarim.com", apiUrl: "https://tlai.asafarim.com/api" },
      // A new app with no targets yet: only its own URLs, API not set.
      { baseUrl: "https://example.com", apiUrl: "" },
    ],
  };
  // An environment saved in the browser before targetId existed.
  const legacy = await resolveRunTarget(
    { baseUrl: "https://tlai.asafarim.com", apiUrl: "https://tlai.asafarim.com/api" },
    withPairs,
  );
  assert.equal(legacy.ok, true);
  // The app's own URLs.
  assert.equal((await resolveRunTarget({ baseUrl: "https://example.com" }, withPairs)).ok, true);
  // Anything else is still a raw URL.
  for (const body of [
    { baseUrl: "https://tlai.asafarim.com" }, // half a pair
    { baseUrl: "https://example.com", apiUrl: "https://example.com/api" },
    { baseUrl: "https://other.example.com" },
  ]) {
    const result = await resolveRunTarget(body, withPairs);
    assert.equal(result.ok, false, JSON.stringify(body));
    if (!result.ok) assert.equal(result.body.code, "RAW_TARGET_ADMIN_ONLY");
  }
});

test("the run carries the target's Hub URL (#700)", async () => {
  const hubTargets: StoredTarget[] = [
    { id: "tl:local", projectId: "asafarim-timelineai", name: "Local", baseUrl: "http://localhost:3010", apiUrl: "http://localhost:3010", hubUrl: "http://localhost:3001" },
    { id: "tl:remote", projectId: "asafarim-timelineai", name: "Remote", baseUrl: "https://tlai.asafarim.com", apiUrl: "https://tlai.asafarim.com", hubUrl: "https://hub.asafarim.com" },
  ];
  const ctx = (isAdmin: boolean) => ({
    ...context(isAdmin, false),
    findTarget: async (id: string) => hubTargets.find((t) => t.id === id),
    storedUrlPairs: async () => hubTargets,
  });
  const byId = await resolveRunTarget({ targetId: "tl:local" }, ctx(false));
  assert.equal(byId.ok && byId.target.hubUrl, "http://localhost:3001");
  // A legacy URL pair inherits the matching target's Hub.
  const legacy = await resolveRunTarget({ baseUrl: "https://tlai.asafarim.com", apiUrl: "https://tlai.asafarim.com" }, ctx(false));
  assert.equal(legacy.ok && legacy.target.hubUrl, "https://hub.asafarim.com");
  // A raw Hub override is admin-only.
  const raw = await resolveRunTarget({ baseUrl: "https://tlai.asafarim.com", apiUrl: "https://tlai.asafarim.com", hubUrl: "https://hub.example.com" }, ctx(false));
  assert.equal(raw.ok, false);
  const admin = await resolveRunTarget({ baseUrl: "https://example.com", hubUrl: "https://hub.example.com" }, ctx(true));
  assert.equal(admin.ok && admin.target.hubUrl, "https://hub.example.com");
  // targetId plus a raw Hub is ambiguous.
  const both = await resolveRunTarget({ targetId: "tl:local", hubUrl: "https://hub.example.com" }, ctx(true));
  assert.equal(both.ok, false);
});
