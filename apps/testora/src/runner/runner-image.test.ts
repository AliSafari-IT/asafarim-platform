/**
 * The production wiring of the isolated runner (#718) — pinned so a later
 * edit to one file can't silently undo it in another.
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import { test } from "node:test";

const appDir = path.resolve(import.meta.dirname, "../..");
const repoRoot = path.resolve(appDir, "../..");
const read = (...p: string[]) => readFileSync(path.join(repoRoot, ...p), "utf8");

/** One top-level service block of docker-compose.prod.yml. */
function composeService(name: string): string {
  const compose = read("docker-compose.prod.yml");
  const start = compose.indexOf(`\n  ${name}:\n`);
  assert.notEqual(start, -1, `service ${name} not found`);
  const rest = compose.slice(start + 1);
  const end = rest.slice(1).search(/\n {2}\S[^\n]*:\n|\n\S/);
  return end === -1 ? rest : rest.slice(0, end + 1);
}

test("the runner image installs the TestCafe version pnpm-lock.yaml resolves", () => {
  const lock = read("pnpm-lock.yaml");
  const locked = [...lock.matchAll(/^ {2}testcafe@(\d+\.\d+\.\d+)/gm)].map((m) => m[1]);
  assert.ok(locked.length > 0, "testcafe not found in pnpm-lock.yaml");
  assert.equal(new Set(locked).size, 1, `several testcafe versions locked: ${locked.join(", ")}`);
  const pkg = JSON.parse(read("apps", "testora", "runner-image", "package.json"));
  const npmLock = JSON.parse(read("apps", "testora", "runner-image", "package-lock.json"));
  assert.equal(pkg.dependencies.testcafe, locked[0]);
  assert.equal(npmLock.packages["node_modules/testcafe"].version, locked[0]);
});

test("the host filter and compose agree on the testora_egress subnet", () => {
  const compose = read("docker-compose.prod.yml");
  const subnet = /testora_egress:\n(?:.*\n)*?\s+- subnet: (\S+)/.exec(compose)?.[1];
  const script = read("infra", "scripts", "testora-egress-firewall.sh");
  const fallback = /TESTORA_EGRESS_SUBNET:-([^}]+)\}/.exec(script)?.[1];
  assert.ok(subnet);
  assert.equal(fallback, subnet);
  assert.match(compose, /testora_egress:\n\s+enable_ipv6: false/);
  assert.match(compose, /testora_control:\n\s+internal: true/);
});

test("testora-runner: never on asafarim_net, no env_file, hardened", () => {
  const runner = composeService("testora-runner");
  assert.doesNotMatch(runner, /- asafarim_net/);
  assert.doesNotMatch(runner, /^\s+env_file:/m);
  assert.match(runner, /networks:\n\s+- testora_control\n\s+- testora_egress\n/);
  for (const line of [
    /read_only: true/,
    /user: node/,
    /cap_drop: \[ALL\]/,
    /no-new-privileges:true/,
    /pids_limit: \d+/,
    /mem_limit: \S+/,
    /cpus: \S+/,
    /shm_size: 1g/,
    /TESTORA_EGRESS_SELF_TEST: "1"/,
    /profiles: \["testora-runner"\]/,
    /target: runner-worker/,
  ]) {
    assert.match(runner, line);
  }
  // The web app is the runner's only peer on the control network.
  assert.match(composeService("testora"), /- asafarim_net\n\s+- testora_control\n/);
});

test("Caddy answers 404 for /internal/* on the public Testora host", () => {
  const caddy = read("infra", "caddy", "Caddyfile");
  const site = caddy.slice(caddy.indexOf("testora.asafarim.com {"));
  const block = site.slice(0, site.indexOf("\n}\n"));
  assert.match(block, /@internal path \/internal \/internal\/\*/);
  assert.match(block, /respond @internal 404/);
  assert.ok(block.indexOf("respond @internal 404") < block.indexOf("reverse_proxy"));
});

test("the image build plan and the deploy know the runner image", () => {
  assert.match(read("docker-bake.hcl"), /target "testora-runner" \{[^}]*target\s+= "runner-worker"/);
  assert.match(read("scripts", "plan-image-builds.mjs"), /image: "testora-runner"/);
  const deploy = read("infra", "scripts", "vps-deploy.sh");
  assert.match(deploy, /--egress-self-test/);
  assert.match(deploy, /testora-egress-firewall/);
});
