// edge_net membership is an explicit allow-list (#770, architect note on #791).
// edge_net is shared across stacks: a member is reachable by every other member
// directly, bypassing the gateway (infra/edge/README.md, "The edge_net rule").
// So only public-facing services join, each listed here with its reason, and
// databases, caches, workers, migrators and runners never do.
//
//   node --test infra/edge/scripts/edge-net.test.mjs
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import { test } from "node:test";

const repo = path.resolve(import.meta.dirname, "../../..");
// Leading newline: the file starts with `services:` on line 1.
const compose = "\n" + readFileSync(path.join(repo, "docker-compose.prod.yml"), "utf8").replace(/\r\n/g, "\n");

/** Public-facing services allowed on edge_net, and the site that proxies to each. */
const ALLOWED = {
  web: "asafarim.com, www.asafarim.com",
  hub: "hub.asafarim.com",
  admin: "admin.asafarim.com",
  showcase: "showcase.asafarim.com",
  vionto: "vionto.asafarim.com",
  edumatch: "edumatch.asafarim.com",
  testora: "testora.asafarim.com, testora.cloud (runner protocol is on testora_control, HMAC-protected)",
  appbuilder: "appbuilder.asafarim.com",
  resumatch: "resumatch.asafarim.com",
  tasksai: "tasks-ai.asafarim.com",
  labs: "labs.asafarim.com",
  timelineai: "tlai.asafarim.com",
};

/** Kinds of service that must never join, whatever the allow-list says. */
const NEVER = /(postgres|redis|clamav|worker|migrat|seed|runner)/;

/** service name → its networks, from the top-level `services:` block. */
function serviceNetworks() {
  const services = compose.slice(compose.indexOf("\nservices:\n"), compose.indexOf("\nnetworks:\n"));
  const result = {};
  let current = null;
  let inNetworks = false;
  for (const line of services.split("\n")) {
    const svc = /^ {2}([a-z0-9-]+):\s*$/.exec(line);
    if (svc) {
      current = svc[1];
      result[current] = [];
      inNetworks = false;
      continue;
    }
    if (/^ {4}networks:\s*$/.test(line)) {
      inNetworks = true;
      continue;
    }
    if (inNetworks) {
      const net = /^ {6}- ([\w-]+)\s*$/.exec(line);
      if (net) result[current].push(net[1]);
      else if (!/^ {6}#/.test(line)) inNetworks = false;
    }
  }
  return result;
}

const nets = serviceNetworks();
const onEdge = Object.entries(nets)
  .filter(([, n]) => n.includes("edge_net"))
  .map(([s]) => s)
  .sort();

test("the compose file parses into services with networks", () => {
  assert.ok(Object.keys(nets).length > 20, "expected the prod stack's services");
  assert.ok(nets.web?.includes("asafarim_net"));
});

test("every service on edge_net is on the allow-list", () => {
  const unlisted = onEdge.filter((s) => !(s in ALLOWED));
  assert.deepEqual(unlisted, [], `not allowed on edge_net (see infra/edge/README.md): ${unlisted.join(", ")}`);
});

test("databases, caches, workers, migrators and runners are never on edge_net", () => {
  assert.deepEqual(onEdge.filter((s) => NEVER.test(s)), []);
  for (const s of Object.keys(ALLOWED)) assert.doesNotMatch(s, NEVER, `${s} can't be allow-listed`);
});

test("the allow-list has no stale entries (each one is a real service on edge_net)", () => {
  assert.deepEqual(Object.keys(ALLOWED).sort(), onEdge);
});

test("edge_net is the external shared network", () => {
  assert.match(compose, /\n {2}edge_net:\n(?: {4}#.*\n)* {4}external: true\n {4}name: edge_net\n/);
});
