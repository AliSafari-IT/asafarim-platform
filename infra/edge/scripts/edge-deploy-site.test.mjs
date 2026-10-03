// Behaviour of edge-deploy-site.sh (#770 / #774), run for real against a fake
// `docker` on PATH (fake-docker.sh). Needs bash, flock and sha256sum: run on
// Linux (CI: .github/workflows/edge.yml).
//
//   node --test infra/edge/scripts/edge-deploy-site.test.mjs
import assert from "node:assert/strict";
import { spawn, spawnSync } from "node:child_process";
import { chmodSync, existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync, copyFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, beforeEach, test } from "node:test";

const here = import.meta.dirname;
const SCRIPT = path.join(here, "edge-deploy-site.sh");

let root, edge, bin, logFile;
const OLD = "old.example.com {\n  respond \"old\"\n}\n";
const NEW = "new.example.com {\n  respond \"new\"\n}\n";

beforeEach(() => {
  root = mkdtempSync(path.join(tmpdir(), "edge-"));
  edge = path.join(root, "edge");
  bin = path.join(root, "bin");
  logFile = path.join(root, "docker.log");
  mkdirSync(path.join(edge, "caddy", "sites"), { recursive: true });
  writeFileSync(path.join(edge, "caddy", "Caddyfile"), "import sites/*.caddy\n");
  mkdirSync(bin);
  copyFileSync(path.join(here, "fake-docker.sh"), path.join(bin, "docker"));
  chmodSync(path.join(bin, "docker"), 0o755);
  writeFileSync(logFile, "");
});
afterEach(() => rmSync(root, { recursive: true, force: true }));

const live = (stack = "web") => path.join(edge, "caddy", "sites", `${stack}.caddy`);
const prev = (stack = "web") => `${live(stack)}.prev`;
const events = () =>
  readFileSync(logFile, "utf8")
    .split("\n")
    .filter(Boolean)
    .map((l) => l.split(" ").slice(1).join(" "));

function source(content, name = "site.caddy") {
  const file = path.join(root, name);
  writeFileSync(file, content);
  return file;
}

function env(extra = {}) {
  return { ...process.env, PATH: `${bin}:${process.env.PATH}`, EDGE_DIR: edge, FAKE_LOG: logFile, ...extra };
}

function deploy(content, extra = {}, stack = "web") {
  return spawnSync("bash", [SCRIPT, stack, source(content, `${stack}-${Date.now()}.caddy`)], {
    env: env(extra),
    encoding: "utf8",
  });
}

test("an invalid file is refused before anything is swapped: live file untouched, no .prev, no reload", () => {
  writeFileSync(live(), OLD);
  const r = deploy("INVALID {", { FAKE_EDGE_ID: "edge1" });
  assert.equal(r.status, 1, r.stderr);
  assert.match(r.stderr, /invalid with the rest of the edge config — live config untouched/);
  assert.equal(readFileSync(live(), "utf8"), OLD);
  assert.equal(existsSync(prev()), false);
  assert.deepEqual(events(), ["validate-start", "validate-end invalid"]);
});

test("a good file: validated before the swap, previous kept as .prev, reloaded, hash verified", () => {
  writeFileSync(live(), OLD);
  const r = deploy(NEW, { FAKE_EDGE_ID: "edge1" });
  assert.equal(r.status, 0, r.stderr);
  assert.equal(readFileSync(live(), "utf8"), NEW);
  assert.equal(readFileSync(prev(), "utf8"), OLD);
  assert.deepEqual(events(), ["validate-start", "validate-end ok", "reload-ok", "hash-check"]);
});

test("a failed reload restores the previous file and reloads again", () => {
  writeFileSync(live(), OLD);
  const r = deploy(NEW, { FAKE_EDGE_ID: "edge1", FAKE_RELOAD_FAIL_TIMES: "1" });
  assert.equal(r.status, 1);
  assert.match(r.stderr, /caddy reload failed — restoring the previous sites\/web\.caddy/);
  assert.equal(readFileSync(live(), "utf8"), OLD);
  assert.deepEqual(events(), ["validate-start", "validate-end ok", "reload-fail", "reload-ok"]);
});

test("a hash mismatch after the reload restores the previous file and reloads again", () => {
  writeFileSync(live(), OLD);
  const r = deploy(NEW, { FAKE_EDGE_ID: "edge1", FAKE_STALE_HASH: "1" });
  assert.equal(r.status, 1);
  assert.match(r.stderr, /does not see this stack's new file/);
  assert.equal(readFileSync(live(), "utf8"), OLD);
  assert.deepEqual(events(), ["validate-start", "validate-end ok", "reload-ok", "hash-check", "reload-ok"]);
});

test("a first deploy whose reload fails removes the new file (nothing to restore)", () => {
  const r = deploy(NEW, { FAKE_EDGE_ID: "edge1", FAKE_RELOAD_FAIL_TIMES: "1" });
  assert.equal(r.status, 1);
  assert.equal(existsSync(live()), false);
});

test("before the cutover (no edge container) the file is only installed", () => {
  const r = deploy(NEW);
  assert.equal(r.status, 0, r.stderr);
  assert.match(r.stdout, /pre-cutover/);
  assert.equal(readFileSync(live(), "utf8"), NEW);
  assert.deepEqual(events(), ["validate-start", "validate-end ok"]);
});

test("two stacks publishing at once are serialised by the lock: validations never overlap", async () => {
  const run = (stack) =>
    new Promise((resolve) => {
      const child = spawn("bash", [SCRIPT, stack, source(NEW, `${stack}.src.caddy`)], {
        env: env({ FAKE_EDGE_ID: "edge1", FAKE_VALIDATE_SLEEP: "1" }),
      });
      child.on("close", resolve);
    });
  const codes = await Promise.all([run("stack-a"), run("stack-b")]);
  assert.deepEqual(codes, [0, 0]);
  const lines = readFileSync(logFile, "utf8").split("\n").filter(Boolean).map((l) => l.split(" "));
  const starts = lines.filter((l) => l[1] === "validate-start").map((l) => Number(l[0]));
  const ends = lines.filter((l) => l[1] === "validate-end").map((l) => Number(l[0]));
  assert.equal(starts.length, 2);
  // The second validation starts only after the first one (and its reload) ended.
  assert.ok(starts[1] >= ends[0], `overlap: ${JSON.stringify(lines)}`);
  // Each stack's publish ran start-to-finish before the next began.
  assert.deepEqual(
    lines.map((l) => l.slice(1).join(" ")),
    ["validate-start", "validate-end ok", "reload-ok", "hash-check", "validate-start", "validate-end ok", "reload-ok", "hash-check"],
  );
});

test("a publish that can't get the lock in time changes nothing (exit 75)", async () => {
  writeFileSync(live(), OLD);
  const holder = spawn("flock", [path.join(edge, ".deploy.lock"), "sleep", "3"]);
  await new Promise((r) => setTimeout(r, 300));
  const r = deploy(NEW, { FAKE_EDGE_ID: "edge1", EDGE_LOCK_WAIT_SECONDS: "1" });
  holder.kill();
  assert.equal(r.status, 75);
  assert.match(r.stderr, /still holds .*\.deploy\.lock/);
  assert.equal(readFileSync(live(), "utf8"), OLD);
  assert.deepEqual(events(), []);
});
