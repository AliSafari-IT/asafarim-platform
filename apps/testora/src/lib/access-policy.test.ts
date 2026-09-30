import assert from "node:assert/strict";
import { test } from "node:test";
import { isAllowed, isServiceRequest, isTester, isTesterWrite } from "./access-policy";

const member = ["user"];
const tester = ["tester"];
const admin = ["admin"];
const superadmin = ["superadmin"];

test("members may read every app page and API", () => {
  for (const pathname of ["/dashboard", "/apps", "/requirements", "/run", "/results"]) {
    assert.equal(isAllowed({ pathname, method: "GET", roles: member }), true, pathname);
  }
  for (const pathname of ["/api/suites", "/api/requirements", "/api/results", "/api/targets"]) {
    assert.equal(isAllowed({ pathname, method: "GET", roles: member }), true, pathname);
  }
});

// The six tester-only actions (#698), plus a read every role keeps.
const TESTER_ACTIONS: [string, string][] = [
  ["POST", "/api/run"],
  ["DELETE", "/api/run/r_123"],
  ["POST", "/api/seed"],
  ["POST", "/api/issues/generate"],
  ["POST", "/api/issues"],
  ["POST", "/api/issues/i_1/publish"],
];

const ROLE_MATRIX: { name: string; roles: string[]; tester: boolean }[] = [
  { name: "guest", roles: ["guest"], tester: false },
  { name: "standard_user", roles: ["standard_user"], tester: false },
  { name: "standard_user+tester", roles: ["standard_user", "tester"], tester: true },
  { name: "tester", roles: ["tester"], tester: true },
  { name: "admin", roles: ["admin"], tester: true },
  { name: "superadmin", roles: ["superadmin"], tester: true },
];

test("only tester, admin and superadmin may run, cancel, update tests and file issues", () => {
  for (const { name, roles, tester: allowed } of ROLE_MATRIX) {
    assert.equal(isTester(roles), allowed, name);
    for (const [method, pathname] of TESTER_ACTIONS) {
      assert.equal(isAllowed({ pathname, method, roles }), allowed, `${name}: ${method} ${pathname}`);
    }
    // Every role can still read results.
    assert.equal(isAllowed({ pathname: "/api/results", method: "GET", roles }), true, `${name}: GET results`);
    assert.equal(isAllowed({ pathname: "/results", method: "GET", roles }), true, `${name}: results page`);
  }
});

test("the six tester actions are exactly the tester writes", () => {
  for (const [method, pathname] of TESTER_ACTIONS) {
    assert.equal(isTesterWrite(method, pathname), true, `${method} ${pathname}`);
  }
  assert.equal(isTesterWrite("POST", "/api/imports/workbench/preview"), false);
  assert.equal(isTesterWrite("PATCH", "/api/issues/i_1"), false);
  assert.equal(isTesterWrite("GET", "/api/run"), false);
});

test("members may preview a workbench handoff but not confirm it", () => {
  assert.equal(isAllowed({ pathname: "/api/imports/workbench/preview", method: "POST", roles: member }), true);
  assert.equal(isAllowed({ pathname: "/api/imports/workbench/confirm", method: "POST", roles: member }), false);
});

test("testers get no admin writes; look-alikes of tester routes stay admin-only", () => {
  for (const roles of [member, tester]) {
    assert.equal(isAllowed({ pathname: "/api/issues/i_1/publish/x", method: "POST", roles }), false);
    assert.equal(isAllowed({ pathname: "/api/issues/i_1", method: "POST", roles }), false);
    assert.equal(isAllowed({ pathname: "/api/imports/workbench/confirm", method: "POST", roles }), false);
    assert.equal(isAllowed({ pathname: "/api/targets", method: "POST", roles }), false);
    assert.equal(isAllowed({ pathname: "/api/webhooks/dispatch", method: "POST", roles }), false);
    assert.equal(isAllowed({ pathname: "/api/webhooks", method: "GET", roles }), false);
  }
});

test("members and testers may not create, edit or delete catalog data", () => {
  const writes: [string, string][] = [
    ["POST", "/api/projects"],
    ["PATCH", "/api/projects"],
    ["DELETE", "/api/projects"],
    ["POST", "/api/requirements"],
    ["PATCH", "/api/requirements/fr_1"],
    ["DELETE", "/api/requirements/fr_1"],
    ["POST", "/api/suites"],
    ["PATCH", "/api/suites/s_1"],
    ["POST", "/api/fixtures"],
    ["DELETE", "/api/fixtures/f_1"],
    ["POST", "/api/cases"],
    ["PATCH", "/api/cases/c_1"],
    ["POST", "/api/targets"],
    ["DELETE", "/api/targets"],
    ["DELETE", "/api/results"],
    ["PATCH", "/api/issues/i_1"],
    ["DELETE", "/api/issues/i_1"],
    ["POST", "/api/upload"],
    ["POST", "/api/webhooks/dispatch"],
  ];
  for (const [method, pathname] of writes) {
    assert.equal(isAllowed({ pathname, method, roles: member }), false, `${method} ${pathname}`);
    assert.equal(isAllowed({ pathname, method, roles: tester }), false, `tester ${method} ${pathname}`);
  }
});

test("members may not read webhook configuration", () => {
  assert.equal(isAllowed({ pathname: "/api/webhooks", method: "GET", roles: member }), false);
  assert.equal(
    isAllowed({ pathname: "/api/webhooks/deliveries", method: "GET", roles: member }),
    false,
  );
});

test("admins and superadmins may do everything", () => {
  for (const roles of [admin, superadmin]) {
    assert.equal(isAllowed({ pathname: "/api/projects", method: "POST", roles }), true);
    assert.equal(isAllowed({ pathname: "/api/suites/s_1", method: "DELETE", roles }), true);
    assert.equal(isAllowed({ pathname: "/api/webhooks", method: "GET", roles }), true);
  }
});

test("method matching is case-insensitive", () => {
  assert.equal(isAllowed({ pathname: "/api/seed", method: "post", roles: tester }), true);
  assert.equal(isAllowed({ pathname: "/api/seed", method: "post", roles: member }), false);
  assert.equal(isAllowed({ pathname: "/api/suites", method: "post", roles: member }), false);
});

test("only the token-authenticated service endpoints bypass the session gate", () => {
  assert.equal(isServiceRequest("GET", "/api/results/r_1/bundle"), true);
  assert.equal(isServiceRequest("GET", "/api/results/r_1/artifact/screenshot"), true);
  assert.equal(isServiceRequest("POST", "/api/provisions"), true);
  assert.equal(isServiceRequest("GET", "/api/internal/user-activity"), true);
  // Same paths with other methods, and look-alikes, stay behind the gate.
  assert.equal(isServiceRequest("DELETE", "/api/results/r_1/bundle"), false);
  assert.equal(isServiceRequest("DELETE", "/api/results"), false);
  assert.equal(isServiceRequest("GET", "/api/results"), false);
  assert.equal(isServiceRequest("GET", "/api/results/r_1/bundle/extra"), false);
});
