import assert from "node:assert/strict";
import { test } from "node:test";
import { isAllowed, isServiceRequest } from "./access-policy";

const member = ["user"];
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

test("members may run tests, cancel a run and update tests", () => {
  assert.equal(isAllowed({ pathname: "/api/run", method: "POST", roles: member }), true);
  assert.equal(isAllowed({ pathname: "/api/run/r_123", method: "DELETE", roles: member }), true);
  assert.equal(isAllowed({ pathname: "/api/seed", method: "POST", roles: member }), true);
});

test("members may report a bug: draft, save and file an issue", () => {
  assert.equal(isAllowed({ pathname: "/api/issues/generate", method: "POST", roles: member }), true);
  assert.equal(isAllowed({ pathname: "/api/issues", method: "POST", roles: member }), true);
  assert.equal(isAllowed({ pathname: "/api/issues/i_1/publish", method: "POST", roles: member }), true);
  assert.equal(isAllowed({ pathname: "/api/imports/workbench/preview", method: "POST", roles: member }), true);
  assert.equal(isAllowed({ pathname: "/api/imports/workbench/confirm", method: "POST", roles: member }), false);
  // Look-alikes stay admin-only.
  assert.equal(isAllowed({ pathname: "/api/issues/i_1/publish/x", method: "POST", roles: member }), false);
  assert.equal(isAllowed({ pathname: "/api/issues/i_1", method: "POST", roles: member }), false);
});

test("members may not create, edit or delete catalog data", () => {
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
  assert.equal(isAllowed({ pathname: "/api/seed", method: "post", roles: member }), true);
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
