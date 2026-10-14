// vps-deploy.sh must keep working after the shared-edge cutover (#770 phase 3).
//
// Before the cutover asafarim-com's own Caddy owns 80/443, and a deploy starts, validates, reloads and
// verifies it. After the cutover that container is stopped and the shared edge serves traffic: starting
// the old one would fight the edge for the ports and `compose exec caddy` would fail, so every push to
// main would abort. lib/proxy.sh picks the path; these tests run its real functions against a fake
// `docker` and `curl` and check which commands each path issues.
//
//   node --test infra/scripts/proxy.test.mjs
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import {
  chmodSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, test } from "node:test";

const repo = path.resolve(import.meta.dirname, "../..");
const lib = path.join(repo, "infra/scripts/lib");

const FAKE_DOCKER = `#!/usr/bin/env bash
# Test double for docker. FAKE_LOG gets every call. FAKE_EDGE_ID: what \`docker compose -p edge ps -q caddy\`
# prints (empty: no edge). FAKE_VALIDATE_RC: exit code of the old Caddy's \`caddy validate\`. FAKE_STALE=1: the
# old Caddy's sha256sum differs from the checkout's.
printf 'docker %s\\n' "$*" >>"$FAKE_LOG"
case "$*" in
  "compose -p edge ps -q caddy")
    if [[ "\${FAKE_DOCKER_FAILS:-0}" == 1 ]]; then exit 1; fi
    [[ -n "\${FAKE_EDGE_ID:-}" ]] && echo "$FAKE_EDGE_ID"
    exit 0 ;;
  *"exec -T caddy caddy validate"*) exit "\${FAKE_VALIDATE_RC:-0}" ;;
  *"exec -T caddy sha256sum"*)
    if [[ "\${FAKE_STALE:-0}" == 1 ]]; then echo "0000000000000000000000000000000000000000000000000000000000000000  /etc/caddy/Caddyfile"
    else sha256sum infra/caddy/Caddyfile | sed 's#  .*#  /etc/caddy/Caddyfile#'; fi
    exit 0 ;;
esac
exit 0
`;

// Only the part of the URL after the host matters: /internal/* in its spellings is the runner protocol.
const FAKE_CURL = `#!/usr/bin/env bash
url="\${@: -1}"
printf 'curl %s\\n' "$url" >>"$FAKE_LOG"
case "$url" in
  *internal*|*INTERNAL*|*%69nternal*) printf '%s' "\${FAKE_INTERNAL_CODE:-404}" ;;
  */api/status) printf '%s' "\${FAKE_STATUS_CODE:-200}" ;;
  *) printf '200' ;;
esac
`;

// Sources the real libraries, replaces only what talks to the shared edge's scripts and Discord.
const DRIVER = `#!/usr/bin/env bash
set -euo pipefail
cd "$REPO_ROOT"
COMPOSE=(docker compose -f docker-compose.prod.yml --env-file .env.production)
IMAGE_TAG=0123456789abcdef0123456789abcdef01234567
source "$LIB/verify-caddy.sh"
source "$LIB/edge.sh"
source "$LIB/proxy.sh"
notify_discord() { printf 'notify %s\\n' "$1" >>"$FAKE_LOG"; }
install_edge_project() { printf 'install_edge_project\\n' >>"$FAKE_LOG"; return "\${FAKE_INSTALL_RC:-0}"; }
publish_edge_site() { printf 'publish_edge_site\\n' >>"$FAKE_LOG"; return "\${FAKE_PUBLISH_RC:-0}"; }
sleep() { :; }
case "$1" in
  start) start_legacy_caddy "$2" ;;
  apply) apply_proxy_config "$2" ;;
  live) edge_is_live ;;
  public) verify_public_routes ;;
  legacy) verify_caddy_config ;;
esac
`;

let dir;
let bin;
let log;
beforeEach(() => {
  dir = mkdtempSync(path.join(tmpdir(), "proxy-"));
  bin = path.join(dir, "bin");
  mkdirSync(bin);
  mkdirSync(path.join(dir, "repo/infra/caddy"), { recursive: true });
  writeFileSync(
    path.join(dir, "repo/infra/caddy/Caddyfile"),
    "example.com { respond 200 }\n"
  );
  log = path.join(dir, "calls.log");
  writeFileSync(log, "");
  for (const [name, body] of [
    ["docker", FAKE_DOCKER],
    ["curl", FAKE_CURL],
  ]) {
    writeFileSync(path.join(bin, name), body);
    chmodSync(path.join(bin, name), 0o755);
  }
  writeFileSync(path.join(dir, "driver.sh"), DRIVER);
});
afterEach(() => rmSync(dir, { recursive: true, force: true }));

function run(args, env = {}) {
  const result = spawnSync("bash", [path.join(dir, "driver.sh"), ...args], {
    encoding: "utf8",
    env: {
      PATH: `${bin}:${process.env.PATH}`,
      HOME: dir,
      REPO_ROOT: path.join(dir, "repo"),
      LIB: lib,
      FAKE_LOG: log,
      ...env,
    },
  });
  const calls = readFileSync(log, "utf8").split("\n").filter(Boolean);
  return {
    status: result.status,
    stdout: result.stdout,
    stderr: result.stderr,
    calls,
  };
}

const has = (calls, text) => calls.some((c) => c.includes(text));
const LEGACY_EXEC = "exec -T caddy";
const EDGE = { FAKE_EDGE_ID: "abc123" };

describe("edge_is_live", () => {
  test("is true when the edge's Caddy container runs", () => {
    assert.equal(run(["live"], EDGE).status, 0);
  });
  test("is false with no edge container (before the cutover)", () => {
    assert.equal(run(["live"]).status, 1);
  });
  test("is false when docker can't answer", () => {
    assert.equal(run(["live"], { ...EDGE, FAKE_DOCKER_FAILS: "1" }).status, 1);
  });
  test("asks the same question as edge-deploy-site.sh", () => {
    const site = readFileSync(
      path.join(repo, "infra/edge/scripts/edge-deploy-site.sh"),
      "utf8"
    );
    assert.ok(site.includes("docker compose -p edge ps -q caddy"));
    assert.deepEqual(run(["live"], EDGE).calls, [
      "docker compose -p edge ps -q caddy",
    ]);
  });
});

describe("before the cutover (the asafarim-com Caddy is live)", () => {
  test("starts asafarim-com's Caddy without recreating it", () => {
    const r = run(["start", "false"]);
    assert.equal(r.status, 0);
    assert.deepEqual(r.calls, [
      "docker compose -f docker-compose.prod.yml --env-file .env.production up -d --no-build --no-recreate caddy",
    ]);
  });

  test("validates, reloads and verifies that Caddy, then rehearses the edge publish", () => {
    const r = run(["apply", "false"]);
    assert.equal(r.status, 0, r.stderr);
    assert.ok(has(r.calls, `${LEGACY_EXEC} caddy validate`));
    assert.ok(has(r.calls, `${LEGACY_EXEC} caddy reload`));
    assert.ok(has(r.calls, `${LEGACY_EXEC} sha256sum /etc/caddy/Caddyfile`));
    assert.ok(
      has(r.calls, "curl https://testora.asafarim.com/internal/runner/lease")
    );
    assert.ok(
      r.calls.indexOf("install_edge_project") >
        r.calls.findIndex((c) => c.includes("sha256sum"))
    );
    assert.ok(has(r.calls, "publish_edge_site"));
  });

  test("an invalid Caddyfile fails the deploy and nothing is reloaded", () => {
    const r = run(["apply", "false"], { FAKE_VALIDATE_RC: "1" });
    assert.equal(r.status, 1);
    assert.match(r.stderr, /Caddy configuration is invalid/);
    assert.equal(has(r.calls, "caddy reload"), false);
  });

  test("a Caddy serving a stale file fails the deploy", () => {
    const r = run(["apply", "false"], { FAKE_STALE: "1" });
    assert.equal(r.status, 1);
    assert.match(r.stderr, /not serving this checkout's Caddyfile/);
    assert.ok(has(r.calls, "notify ❌"));
  });

  test("a refused edge publish only warns: traffic is not on the edge yet", () => {
    const r = run(["apply", "false"], { FAKE_PUBLISH_RC: "1" });
    assert.equal(r.status, 0);
    assert.match(r.stderr, /WARNING: the shared edge did not accept/);
    assert.ok(has(r.calls, "notify ⚠️"));
  });
});

describe("after the cutover (the shared edge is live, asafarim-com's Caddy is stopped)", () => {
  test("does not start asafarim-com's Caddy: it would fight the edge for 80/443", () => {
    const r = run(["start", "true"], EDGE);
    assert.equal(r.status, 0);
    assert.deepEqual(r.calls, []);
    assert.match(r.stdout, /asafarim-com's own Caddy stays stopped/);
  });

  test("publishes to the edge and checks the public routes, and never touches the old Caddy", () => {
    const r = run(["apply", "true"], EDGE);
    assert.equal(r.status, 0, r.stderr);
    assert.deepEqual(
      r.calls.filter((c) => !c.startsWith("curl ")),
      ["install_edge_project", "publish_edge_site"]
    );
    assert.equal(has(r.calls, LEGACY_EXEC), false);
    assert.equal(has(r.calls, " up "), false);
    // the /internal/* probes still run, through whichever Caddy serves traffic
    assert.ok(
      has(r.calls, "curl https://testora.asafarim.com/internal/runner/lease")
    );
    assert.ok(has(r.calls, "curl https://testora.cloud/internal/runner/lease"));
    assert.ok(has(r.calls, "curl https://testora.asafarim.com/api/status"));
  });

  test("a refused publish fails the deploy: the edge is the live proxy now", () => {
    const r = run(["apply", "true"], { ...EDGE, FAKE_PUBLISH_RC: "1" });
    assert.equal(r.status, 1);
    assert.match(r.stderr, /FATAL: the shared edge did not accept/);
    assert.ok(has(r.calls, "notify ❌"));
    assert.equal(
      has(r.calls, "curl "),
      false,
      "no route check after a refused publish"
    );
  });

  test("a failing project install fails the deploy", () => {
    const r = run(["apply", "true"], { ...EDGE, FAKE_INSTALL_RC: "75" });
    assert.equal(r.status, 1);
    assert.equal(has(r.calls, "publish_edge_site"), false);
  });

  test("public /internal/* answering anything but 404 through the edge fails the deploy", () => {
    const r = run(["apply", "true"], { ...EDGE, FAKE_INTERNAL_CODE: "200" });
    assert.equal(r.status, 1);
    assert.match(r.stderr, /expected 404 from Caddy/);
    assert.ok(has(r.calls, "notify ❌"));
  });

  test("an app that never answers /api/status fails the deploy", () => {
    const r = run(["apply", "true"], { ...EDGE, FAKE_STATUS_CODE: "502" });
    assert.equal(r.status, 1);
    assert.match(r.stderr, /expected 200 from the app/);
  });
});

describe("verify-caddy.sh keeps its contract for caddy-recreate.sh", () => {
  test("verify_caddy_config is the old container's sha check plus the public routes", () => {
    const ok = run(["legacy"]);
    assert.equal(ok.status, 0, ok.stderr);
    assert.ok(has(ok.calls, "sha256sum /etc/caddy/Caddyfile"));
    assert.ok(has(ok.calls, "curl https://testora.asafarim.com/api/status"));
    assert.equal(run(["legacy"], { FAKE_STALE: "1" }).status, 1);
  });

  test("verify_public_routes alone never asks the old container anything", () => {
    const r = run(["public"]);
    assert.equal(r.status, 0, r.stderr);
    assert.equal(has(r.calls, "docker "), false);
  });
});

describe("vps-deploy.sh is wired to it", () => {
  const script = readFileSync(
    path.join(repo, "infra/scripts/vps-deploy.sh"),
    "utf8"
  );
  const code = script
    .split("\n")
    .filter((l) => !l.trim().startsWith("#"))
    .join("\n");

  test("decides once whether the edge is live, before it starts the stack", () => {
    const decide = code.indexOf("edge_is_live");
    assert.ok(decide > 0);
    assert.ok(
      decide < code.indexOf("up -d --remove-orphans"),
      "decided before `up`"
    );
    assert.equal(
      code.split("edge_is_live").length - 1,
      1,
      "asked once per deploy"
    );
  });

  test("starts and configures the proxy only through lib/proxy.sh", () => {
    assert.ok(code.includes('start_legacy_caddy "${EDGE_LIVE}"'));
    assert.ok(code.includes('apply_proxy_config "${EDGE_LIVE}" || exit 1'));
    assert.ok(code.includes("lib/proxy.sh"));
    // nothing may start, exec into or reload the old Caddy outside the helpers
    assert.equal(/no-recreate caddy/.test(code), false);
    assert.equal(/exec -T caddy/.test(code), false);
    assert.equal(code.includes("verify_caddy_config"), false);
    assert.equal(code.includes("publish_edge_site"), false);
  });

  test("keeps the testora egress probes safe when the old Caddy is stopped", () => {
    // ip_of returns nothing for a service with no container, and add_probe skips an empty address.
    assert.ok(
      code.includes(
        'add_probe() { [[ -n "$1" ]] && PROBES+=("$1:$2"); return 0; }'
      )
    );
  });
});
