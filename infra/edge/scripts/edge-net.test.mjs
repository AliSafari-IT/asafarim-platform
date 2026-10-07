// edge_net membership is an explicit allow-list (#770, architect note on #791).
// edge_net is shared across stacks: a member is reachable by every other member
// directly, bypassing the gateway (infra/edge/README.md, "The edge_net rule").
// So only public-facing services join, each listed here with its reason, and
// databases, caches, workers, migrators and runners never do.
//
// It also pins the other shared network, identity_db (asafarim-os#45): the private
// link between this stack's Postgres and asafarim-os's identity service.
//
//   node --test infra/edge/scripts/edge-net.test.mjs
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { chmodSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
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
      // Both Compose forms: "- net", or "net:" with options (aliases, ...) below it.
      const list = /^ {6}- ([\w-]+)\s*$/.exec(line);
      const map = /^ {6}([\w-]+):\s*$/.exec(line);
      if (list) result[current].push(list[1]);
      else if (map) result[current].push(map[1]);
      else if (line.trim() !== "" && !/^\s*#/.test(line) && !/^ {6}/.test(line)) inNetworks = false; // dedented: the block ended (comments never end it)
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

/** One service's block of the compose file (from its header to the next service). */
function serviceBlock(name) {
  const start = compose.indexOf(`\n  ${name}:\n`);
  if (start < 0) return "";
  const rest = compose.slice(start + 1);
  const next = rest.slice(1).search(/\n {2}[a-z0-9-]+:\s*\n/);
  return next < 0 ? rest : rest.slice(0, next + 1);
}

const onIdentityDb = Object.entries(nets)
  .filter(([, n]) => n.includes("identity_db"))
  .map(([s]) => s)
  .sort();

test("postgres is on asafarim_net and identity_db, and never on edge_net", () => {
  assert.ok(nets.postgres, "postgres is a service of the prod compose file");
  assert.ok(nets.postgres.includes("asafarim_net"));
  assert.ok(nets.postgres.includes("identity_db"));
  assert.ok(!nets.postgres.includes("edge_net"), "a database never joins edge_net");
});

test("postgres is the only asafarim-com service on identity_db", () => {
  assert.deepEqual(onIdentityDb, ["postgres"]);
});

test("postgres is reachable from identity as platform-postgres, on identity_db", () => {
  assert.match(serviceBlock("postgres"), /\n {6}identity_db:\n {8}aliases:\n {10}- platform-postgres\n/);
});

test("identity_db is an external network owned by no stack", () => {
  assert.match(compose, /\n {2}identity_db:\n(?: {4}#.*\n)* {4}external: true\n {4}name: identity_db\n/);
});

test("vps-deploy.sh creates identity_db before the FIRST `compose up`", () => {
  // postgres joins an external network: if it is missing at the first `up`, the whole deploy fails.
  const deploy = readFileSync(path.join(repo, "infra/scripts/vps-deploy.sh"), "utf8").replace(/\r\n/g, "\n");
  const ensure = deploy.indexOf("\nensure_identity_db_net\n");
  const firstUp = deploy.search(/"\$\{COMPOSE\[@\]\}" up /);
  assert.ok(ensure > 0, "vps-deploy.sh must call ensure_identity_db_net");
  assert.ok(firstUp > 0, "expected a `compose up` in vps-deploy.sh");
  assert.ok(ensure < firstUp, "ensure_identity_db_net must run before the first `compose up`");
});

test("lib/edge.sh defines ensure_identity_db_net, creating only identity_db", () => {
  const edgeSh = readFileSync(path.join(repo, "infra/scripts/lib/edge.sh"), "utf8");
  assert.match(edgeSh, /\nensure_identity_db_net\(\) \{\n[\s\S]*?docker network create --internal identity_db >\/dev\/null/);
});

test("identity_db is created --internal: no gateway, no route to the host or the internet", () => {
  const edgeSh = readFileSync(path.join(repo, "infra/scripts/lib/edge.sh"), "utf8");
  const creates = edgeSh.split("\n").filter((l) => /^\s*docker network create\b.*\bidentity_db\b/.test(l));
  assert.equal(creates.length, 1, "expected exactly one `docker network create ... identity_db`");
  assert.match(creates[0], /--internal\b/);
});

/**
 * Run ensure_identity_db_net against a stub `docker`. `existing` is null (no such network), "true" or "false"
 * (the network exists with that .Internal value). Returns the exit status, the output and the stub's call log.
 */
function runEnsureIdentityDb(existing) {
  const dir = mkdtempSync(path.join(tmpdir(), "identity-db-"));
  try {
    const stub = [
      "#!/usr/bin/env bash",
      'echo "$*" >> "$DOCKER_LOG"',
      'if [[ "$1 $2" == "network inspect" ]]; then',
      '  [[ -z "$EXISTING" ]] && exit 1',
      '  [[ "$*" == *--format* ]] && echo "$EXISTING"',
      "  exit 0",
      "fi",
      "exit 0",
      "",
    ].join("\n");
    writeFileSync(path.join(dir, "docker"), stub);
    chmodSync(path.join(dir, "docker"), 0o755);
    const log = path.join(dir, "calls.log");
    writeFileSync(log, "");
    const run = spawnSync("bash", ["-c", 'source "$1" && ensure_identity_db_net', "bash", path.join(repo, "infra/scripts/lib/edge.sh")], {
      encoding: "utf8",
      env: { ...process.env, PATH: `${dir}:${process.env.PATH}`, DOCKER_LOG: log, EXISTING: existing ?? "" },
    });
    return { status: run.status, output: `${run.stdout}${run.stderr}`, calls: readFileSync(log, "utf8") };
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

test("ensure_identity_db_net creates the network internal when it is missing", () => {
  const r = runEnsureIdentityDb(null);
  assert.equal(r.status, 0, r.output);
  assert.match(r.calls, /network create --internal identity_db/);
});

test("ensure_identity_db_net reuses an existing internal network and creates nothing", () => {
  const r = runEnsureIdentityDb("true");
  assert.equal(r.status, 0, r.output);
  assert.doesNotMatch(r.calls, /network create/);
});

test("ensure_identity_db_net refuses an existing non-internal network, with the remediation", () => {
  const r = runEnsureIdentityDb("false");
  assert.notEqual(r.status, 0, "a non-internal identity_db must abort the deploy");
  assert.match(r.output, /not internal/);
  assert.match(r.output, /network create --internal identity_db/);
  assert.doesNotMatch(r.calls, /network create/);
});
