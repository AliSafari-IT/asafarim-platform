// The shared edge's config routes exactly what production routes today
// (#770 phase 2). Until the cutover retires infra/caddy/Caddyfile, the edge's
// site files (sites/asafarim-com.caddy + sites/asafarim-be.caddy) duplicate it,
// so this test pins the two together: both are adapted by the pinned Caddy and
// must produce the same JSON (routes compared as a set, since the edge imports
// the stacks' files in a different order). The asafarim.site page served by the
// edge must be byte-identical to the live one.
//
// Needs Docker (pulls the pinned caddy image). CI: .github/workflows/edge.yml.
//   node --test infra/edge/scripts/edge-config.test.mjs
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { cpSync, mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { after, test } from "node:test";

const repo = path.resolve(import.meta.dirname, "../../..");
const LIVE_DIR = path.join(repo, "infra/caddy");
const EDGE_DIR = path.join(repo, "infra/edge/caddy");
const CADDY_IMAGE = /image:\s*(caddy:[\w.-]+)/.exec(readFileSync(path.join(repo, "infra/edge/docker-compose.yml"), "utf8"))[1];

const scratch = mkdtempSync(path.join(tmpdir(), "edge-config-"));
after(() => rmSync(scratch, { recursive: true, force: true }));

/** `caddy adapt` a config directory (copied, so nothing in the repo is mounted). */
function adapt(dir, name) {
  const copy = path.join(scratch, name);
  cpSync(dir, copy, { recursive: true });
  const r = spawnSync(
    "docker",
    ["run", "--rm", "-v", `${copy}:/etc/caddy:ro`, CADDY_IMAGE, "caddy", "adapt", "--config", "/etc/caddy/Caddyfile", "--adapter", "caddyfile"],
    { encoding: "utf8", env: { ...process.env, MSYS_NO_PATHCONV: "1" } },
  );
  assert.equal(r.status, 0, `caddy adapt ${name} failed:\n${r.stderr}`);
  return JSON.parse(r.stdout);
}

/**
 * Caddy's file_server auto-hides the config file that defined its site block:
 * /etc/caddy/Caddyfile live, /etc/caddy/sites/<stack>.caddy on the edge. Both
 * roots are the static folder, so neither file is reachable either way. Check
 * it names a config file, then drop it.
 */
const CONFIG_FILE = /^\/etc\/caddy\/(Caddyfile|sites\/[a-z0-9-]+\.caddy)$/;
function dropAutoHide(node) {
  if (Array.isArray(node)) return node.forEach(dropAutoHide);
  if (!node || typeof node !== "object") return;
  if (node.handler === "file_server" && Array.isArray(node.hide)) {
    for (const h of node.hide) assert.match(h, CONFIG_FILE, `file_server hides an unexpected path: ${h}`);
    delete node.hide;
  }
  for (const v of Object.values(node)) dropAutoHide(v);
}

/** Order-insensitive where Caddy's order only follows file order: routes and TLS subjects. */
function normalise(config) {
  const c = structuredClone(config);
  dropAutoHide(c);
  for (const server of Object.values(c.apps?.http?.servers ?? {})) {
    server.routes = (server.routes ?? []).map((r) => JSON.stringify(r)).sort();
  }
  for (const policy of c.apps?.tls?.automation?.policies ?? []) policy.subjects?.sort();
  return c;
}

test(`the edge config adapts to the same routes as today's live Caddyfile (${CADDY_IMAGE})`, () => {
  const live = adapt(LIVE_DIR, "live");
  const edge = adapt(EDGE_DIR, "edge");
  assert.ok((live.apps.http.servers.srv0.routes ?? []).length > 10, "the live config should have every site");
  assert.deepEqual(normalise(edge), normalise(live));
});

test("the edge serves the same asafarim.site page as the live Caddy", () => {
  const page = "static/asafarim-site/index.html";
  assert.equal(readFileSync(path.join(EDGE_DIR, page), "utf8"), readFileSync(path.join(LIVE_DIR, page), "utf8"));
});

test("site files only import snippets they define, with a stack prefix (one shared namespace)", () => {
  for (const [stack, prefix] of [["asafarim-com", "asafarim_com_"]]) {
    const text = readFileSync(path.join(EDGE_DIR, "sites", `${stack}.caddy`), "utf8");
    const defined = [...text.matchAll(/^\(([\w-]+)\)\s*\{/gm)].map((m) => m[1]);
    for (const name of defined) assert.ok(name.startsWith(prefix), `${stack}: snippet ${name} must start with ${prefix}`);
    for (const [, used] of text.matchAll(/^\s*import ([\w-]+)\s*$/gm)) assert.ok(defined.includes(used), `${stack}: imports ${used}`);
  }
});
