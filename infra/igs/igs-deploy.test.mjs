// Behaviour of infra/scripts/igs-deploy.sh (#822), run for real against a fake
// `docker` and `age` on PATH. Needs bash and flock: run on Linux
// (CI: .github/workflows/edge.yml).
//
//   node --test infra/igs/igs-deploy.test.mjs
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { chmodSync, copyFileSync, existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, statSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, beforeEach, test } from "node:test";

const repo = path.resolve(import.meta.dirname, "../..");
const SHA = "0123456789abcdef0123456789abcdef01234567";
const FILLED = readFileSync(path.join(repo, ".env.igs.example"), "utf8")
  .replaceAll("REPLACE_ME_openssl_rand_hex_32", "0".repeat(64))
  .replace(/^IGS_PLATFORM_ALLOW_IPS=.*$/m, "IGS_PLATFORM_ALLOW_IPS=203.0.113.5");

// Every call is logged as one line: "docker <args>" or "age <args>".
const FAKE_DOCKER = `#!/usr/bin/env bash
echo "docker $*" >>"$FAKE_LOG"
case "$*" in
  "compose -p igs "*" pull --quiet") echo "tag $IGS_IMAGE_TAG" >>"$FAKE_LOG" ;;
  "compose -p igs "*" run --rm --no-deps igs-migrate") exit "\${FAKE_MIGRATE_EXIT:-0}" ;;
  "compose -p igs "*" exec -T "*" wget "*) exit "\${FAKE_HEALTH_EXIT:-0}" ;;
  "ps -q --filter label=com.docker.compose.project=asafarim-com "*) echo live-caddy ;;
  "inspect -f {{range .Config.Env}}"*) echo "IGS_PLATFORM_ALLOW_IPS=203.0.113.5" ;;
  "inspect -f {{range \\$name"*) printf 'asafarim_net\\n%s' "\${FAKE_LIVE_NETS-edge_net}" ;;
esac
exit 0
`;
const FAKE_AGE = `#!/usr/bin/env bash
echo "age $*" >>"$FAKE_LOG"
cat "$FAKE_ENV"
`;

let root, repoDir, edgeDir, logFile, envFile;
beforeEach(() => {
  root = mkdtempSync(path.join(tmpdir(), "igs-deploy-"));
  repoDir = path.join(root, "repo");
  edgeDir = path.join(root, "edge");
  logFile = path.join(root, "calls.log");
  envFile = path.join(root, "env");
  for (const file of [
    "infra/igs/docker-compose.yml",
    "infra/scripts/igs-deploy.sh",
    "infra/edge/scripts/edge-deploy-site.sh",
    "infra/edge/caddy/sites/igs-pharma.caddy",
  ]) {
    mkdirSync(path.dirname(path.join(repoDir, file)), { recursive: true });
    copyFileSync(path.join(repo, file), path.join(repoDir, file));
  }
  mkdirSync(path.join(repoDir, ".age"));
  writeFileSync(path.join(repoDir, ".age/key.txt"), "fake key\n");
  writeFileSync(path.join(repoDir, ".env.igs.age"), "fake ciphertext\n");
  mkdirSync(path.join(edgeDir, "caddy/sites"), { recursive: true });
  writeFileSync(path.join(edgeDir, "caddy/Caddyfile"), "import sites/*.caddy\n");
  const bin = path.join(root, "bin");
  mkdirSync(bin);
  writeFileSync(path.join(bin, "docker"), FAKE_DOCKER);
  writeFileSync(path.join(bin, "age"), FAKE_AGE);
  chmodSync(path.join(bin, "docker"), 0o755);
  chmodSync(path.join(bin, "age"), 0o755);
  writeFileSync(logFile, "");
  writeFileSync(envFile, FILLED);
  process.env.__IGS_BIN = bin;
});
afterEach(() => rmSync(root, { recursive: true, force: true }));

function deploy(sha = SHA, extra = {}) {
  const r = spawnSync("bash", [path.join(repoDir, "infra/scripts/igs-deploy.sh"), sha], {
    encoding: "utf8",
    env: {
      ...process.env,
      PATH: `${process.env.__IGS_BIN}:${process.env.PATH}`,
      REPO_DIR: repoDir,
      EDGE_DIR: edgeDir,
      FAKE_LOG: logFile,
      FAKE_ENV: envFile,
      ...extra,
    },
  });
  return { ...r, output: `${r.stdout}${r.stderr}`, calls: readFileSync(logFile, "utf8").split("\n").filter(Boolean) };
}

const IGS = "docker compose -p igs -f infra/igs/docker-compose.yml --env-file .env.igs";
const at = (calls, prefix) => calls.findIndex((c) => c.startsWith(prefix));

test("refuses anything but a full commit SHA, before doing anything", () => {
  for (const bad of ["", "main", "0123456", `${SHA}0`, SHA.toUpperCase(), `${SHA.slice(0, 39)};x`]) {
    const r = deploy(bad);
    assert.equal(r.status, 2, bad);
    assert.deepEqual(r.calls, [], bad);
  }
});

test("decrypt → pull → database → migrate → apps → readiness → site file, in that order", () => {
  const r = deploy();
  assert.equal(r.status, 0, r.output);
  const order = [
    "age -d -i .age/key.txt .env.igs.age",
    `${IGS} config --quiet`,
    `${IGS} pull --quiet`,
    `${IGS} up -d --wait --wait-timeout 180 igs-postgres`,
    `${IGS} run --rm --no-deps igs-migrate`,
    `${IGS} up -d --no-deps --wait --wait-timeout 180 igs-web igs-platform igs-worker`,
    `${IGS} exec -T igs-web wget -qO- http://127.0.0.1:3000/api/health`,
    `${IGS} exec -T igs-platform wget -qO- http://127.0.0.1:3001/api/health`,
    "docker run --rm -v", // edge-deploy-site.sh validates the whole edge config
  ].map((p) => at(r.calls, p));
  assert.ok(order.every((i) => i >= 0), `missing a step: ${JSON.stringify(order)}\n${r.calls.join("\n")}`);
  assert.deepEqual([...order].sort((a, b) => a - b), order);
  assert.ok(r.calls.includes(`tag ${SHA}`), "the images are pulled at the given SHA");
  assert.equal(readFileSync(path.join(edgeDir, "caddy/sites/igs-pharma.caddy"), "utf8"), readFileSync(path.join(repo, "infra/edge/caddy/sites/igs-pharma.caddy"), "utf8"));
  assert.equal(statSync(path.join(repoDir, ".env.igs")).mode & 0o777, 0o600);
  assert.match(r.output, /served by the asafarim-com Caddy/);
  assert.doesNotMatch(r.output, /WARNING/);
});

test("only ever changes the igs project: the asafarim-com stack is read, never touched", () => {
  const { calls, status, output } = deploy();
  assert.equal(status, 0, output);
  const docker = calls.filter((c) => c.startsWith("docker "));
  for (const call of docker.filter((c) => c.startsWith("docker compose "))) {
    assert.ok(call.startsWith(`${IGS} `) || call === "docker compose -p edge ps -q caddy", call);
  }
  for (const call of docker) {
    assert.doesNotMatch(call, /docker-compose\.prod\.yml|-p asafarim-com|network connect|network rm|\b(stop|restart|kill|rm -f)\b/, call);
  }
  // The only commands run inside another stack's container are read-only.
  assert.deepEqual(
    docker.filter((c) => c.startsWith("docker exec ")),
    ["docker exec live-caddy grep -q ^igs-pharma\\.be { /etc/caddy/Caddyfile"],
  );
});

test("an env with placeholders left is refused before anything is pulled", () => {
  writeFileSync(envFile, readFileSync(path.join(repo, ".env.igs.example"), "utf8"));
  const r = deploy();
  assert.equal(r.status, 1);
  assert.match(r.output, /REPLACE_ME placeholders/);
  assert.equal(at(r.calls, `${IGS} pull`), -1);
});

test("a failed migration stops the deploy before any app is replaced", () => {
  const r = deploy(SHA, { FAKE_MIGRATE_EXIT: "1" });
  assert.equal(r.status, 1);
  assert.match(r.output, /migrator failed/);
  assert.equal(at(r.calls, `${IGS} up -d --no-deps`), -1);
  assert.ok(!existsSync(path.join(edgeDir, "caddy/sites/igs-pharma.caddy")), "no site file without a running stack");
});

test("an app that isn't ready (database) fails the deploy before the site file is published", () => {
  const r = deploy(SHA, { FAKE_HEALTH_EXIT: "1", IGS_HEALTH_DELAY: "0" });
  assert.equal(r.status, 1);
  assert.match(r.output, /igs-web is up but \/api\/health/);
  assert.equal(at(r.calls, "docker run --rm -v"), -1);
});

test("before the cutover, a live Caddy that can't reach igs-web is called out with the fix", () => {
  const r = deploy(SHA, { FAKE_LIVE_NETS: "" });
  assert.equal(r.status, 0, r.output);
  assert.match(r.output, /isn't on edge_net[^\n]*caddy-recreate\.sh --yes/);
});

test("running it twice is the same deploy (idempotent)", () => {
  const first = deploy();
  writeFileSync(logFile, "");
  const second = deploy();
  assert.equal(second.status, 0, second.output);
  const steps = (calls) => calls.filter((c) => c.startsWith(IGS));
  assert.deepEqual(steps(second.calls), steps(first.calls));
});
