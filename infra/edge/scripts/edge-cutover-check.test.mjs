// The edge cutover check (#839): the REAL script runs against fixture configurations with the pinned Caddy in a
// throwaway container (so `caddy adapt` and `caddy validate` are the real ones). Only three things are faked, by
// small stand-ins first on the PATH: `docker ps` (who owns 80/443), `curl` and `openssl` (what a snapshot sees),
// so no test touches the network.
//
// Needs Docker and the pinned caddy image. CI: .github/workflows/edge.yml.
//   node --test infra/edge/scripts/edge-cutover-check.test.mjs
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { chmodSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, statSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { after, test } from "node:test";

const repo = path.resolve(import.meta.dirname, "../../..");
const SCRIPT = path.join(repo, "infra/edge/scripts/edge-cutover-check.sh");
const script = readFileSync(SCRIPT, "utf8");
const CADDY_IMAGE = /image:\s*(caddy:[\w.-]+)/.exec(readFileSync(path.join(repo, "infra/edge/docker-compose.yml"), "utf8"))[1];
const REAL_DOCKER = spawnSync("bash", ["-c", "command -v docker"], { encoding: "utf8" }).stdout.trim();

const scratch = mkdtempSync(path.join(tmpdir(), "edge-cutover-"));
after(() => rmSync(scratch, { recursive: true, force: true }));
let counter = 0;

/** A file tree (relative path → text) written under a fresh folder; returns the folder. */
function tree(files) {
  const dir = path.join(scratch, `t${++counter}`);
  for (const [file, text] of Object.entries(files)) {
    mkdirSync(path.dirname(path.join(dir, file)), { recursive: true });
    writeFileSync(path.join(dir, file), text);
  }
  return dir;
}

const site = (host, body = "respond ok") => `${host} {\n  ${body}\n}\n`;
const A = site("a.example.com");
const WWW = site("www.a.example.com", "redir https://a.example.com{uri} 301");
const LEGACY = site("legacy.example.com");
const IGS = site("igs.example.com");

/**
 * A live Caddy folder and an edge folder. Defaults: the live Caddyfile defines a, www.a and legacy itself and
 * imports sites.local/igs.caddy; the edge defines the same hosts in a DIFFERENT file layout (one file) and has an
 * identical igs.caddy. So a default fixture passes.
 */
function fixture({ live = {}, edge = {}, liveSitesLocal = { "igs.caddy": IGS }, edgeSites = { "stack-a.caddy": A + WWW + LEGACY, "igs.caddy": IGS } } = {}) {
  const liveFiles = { Caddyfile: `import sites.local/*.caddy\n\n${A}\n${WWW}\n${LEGACY}`, ...live };
  for (const [name, text] of Object.entries(liveSitesLocal)) liveFiles[`sites.local/${name}`] = text;
  const edgeFiles = { "caddy/Caddyfile": "import sites/*.caddy\n", "docker-compose.yml": `services:\n  caddy:\n    image: ${CADDY_IMAGE}\n`, ...edge };
  for (const [name, text] of Object.entries(edgeSites)) edgeFiles[`caddy/sites/${name}`] = text;
  return { live: tree(liveFiles), edge: tree(edgeFiles) };
}

/**
 * Stand-ins first on the PATH. `psOutput` is what `docker ps` knows (lines like "name (compose project: p) (443)"),
 * `web` maps host → [HTTP status, certificate notAfter]. They read their data from files in their own folder
 * ($SHIM_DIR), so each script is plain bash.
 */
/** A bash script from its lines (plain strings: nothing here is a template literal, so `${...}` stays as written). */
const script_ = (...lines) => ["#!/usr/bin/env bash", ...lines, ""].join("\n");
const SHIMS = {
  docker: script_(
    'if [[ "$1" == ps ]]; then',
    '  all="$*"',
    '  if [[ "$all" == *.Names* ]]; then',
    "    port=80",
    '    [[ "$all" == *publish=443* ]] && port=443',
    '    grep -F "($port)" "$SHIM_DIR/ps" | sed "s/ ($port)$//"',
    '  elif [[ "$all" == *.Label* ]]; then',
    "    grep -F '(443)' \"$SHIM_DIR/ps\" | sed -n 's/.*project: \\([^)]*\\)).*/\\1/p'",
    "  fi",
    "  exit 0",
    "fi",
    'exec "$REAL_DOCKER" "$@"',
  ),
  curl: script_(
    'host="${*: -1}"',
    'host="${host#https://}"',
    'host="${host%/}"',
    "awk -F'\\t' -v h=\"$host\" '$1 == h { printf \"%s\", $2; f = 1 } END { if (!f) printf \"000\" }' \"$SHIM_DIR/web\"",
  ),
  openssl: script_(
    'if [[ "$1" == s_client ]]; then',
    "  while [[ $# -gt 0 ]]; do",
    '    [[ "$1" == -servername ]] && echo "HOST=$2"',
    "    shift",
    "  done",
    "else",
    "  read -r line",
    '  host="${line#HOST=}"',
    "  awk -F'\\t' -v h=\"$host\" '$1 == h { print \"notAfter=\" $3 }' \"$SHIM_DIR/web\"",
    "fi",
  ),
};

function shims({ psOutput = "", web = {} } = {}) {
  const bin = tree({
    ps: psOutput,
    web: Object.entries(web)
      .map(([host, [status, expiry]]) => `${host}\t${status}\t${expiry}`)
      .join("\n"),
  });
  for (const [name, body] of Object.entries(SHIMS)) {
    writeFileSync(path.join(bin, name), body);
    chmodSync(path.join(bin, name), 0o755);
  }
  return bin;
}

function run(args, { live, edge, bin, env = {} } = {}) {
  const r = spawnSync("bash", [SCRIPT, ...args], {
    encoding: "utf8",
    env: { ...process.env, PATH: `${bin ?? shims()}:${process.env.PATH}`, SHIM_DIR: bin ?? "", REAL_DOCKER, LIVE_DIR: live, EDGE_DIR: edge, ...env },
  });
  return { status: r.status, out: `${r.stdout}${r.stderr}` };
}

/** sha256 of every file under a folder: to prove a run changed nothing. */
function digest(dir) {
  const h = createHash("sha256");
  const walk = (d) => {
    for (const name of readdirSync(d).sort()) {
      const p = path.join(d, name);
      if (statSync(p).isDirectory()) walk(p);
      else h.update(`${path.relative(dir, p)}\0${readFileSync(p)}\0`);
    }
  };
  walk(dir);
  return h.digest("hex");
}

test("a matching live and edge config PASSes, comparing hosts by name even when different files define them", () => {
  const f = fixture();
  const r = run([], f);
  assert.equal(r.status, 0, r.out);
  for (const host of ["a.example.com", "www.a.example.com", "legacy.example.com", "igs.example.com"]) {
    assert.match(r.out, new RegExp(`${host.replaceAll(".", "\\.")}\\s+yes\\s+yes`), `${host} is on both sides`);
  }
  assert.match(r.out, /igs\.caddy\s+identical/);
  assert.match(r.out, /caddy validate[^\n]*\n\s+OK/);
  assert.match(r.out, /PASS: all 4 hosts/);
});

test("a host the edge doesn't serve fails the check, and the table names it", () => {
  const f = fixture({ edgeSites: { "stack-a.caddy": A + WWW, "igs.caddy": IGS } }); // legacy.example.com is missing
  const r = run([], f);
  assert.equal(r.status, 1);
  assert.match(r.out, /legacy\.example\.com\s+yes\s+MISSING\s+<-- FAIL: not served by the edge/);
  assert.match(r.out, /FAIL: 1 problem/);
});

test("a host only the edge serves fails too (a host missing on EITHER side)", () => {
  const f = fixture({ edgeSites: { "stack-a.caddy": A + WWW + LEGACY + site("new.example.com"), "igs.caddy": IGS } });
  const r = run([], f);
  assert.equal(r.status, 1);
  assert.match(r.out, /new\.example\.com\s+MISSING\s+yes\s+<-- FAIL: not served by the live Caddy/);
});

test("a sites.local/ file with no copy on the edge fails (igs-pharma and the OS landing page would go dark)", () => {
  const f = fixture({ edgeSites: { "stack-a.caddy": A + WWW + LEGACY } }); // igs.caddy is not on the edge
  const r = run([], f);
  assert.equal(r.status, 1);
  assert.match(r.out, /igs\.caddy\s+MISSING on the edge/);
  assert.match(r.out, /igs\.example\.com\s+yes\s+MISSING/, "its host is missing from the edge's hosts too");
});

test("a sites.local/ file that differs from the edge's copy fails", () => {
  const f = fixture({ edgeSites: { "stack-a.caddy": A + WWW + LEGACY, "igs.caddy": IGS + "# older\n" } });
  const r = run([], f);
  assert.equal(r.status, 1);
  assert.match(r.out, /igs\.caddy\s+DIFFERENT on the edge/);
});

test("an edge config that doesn't validate fails, with Caddy's reason", () => {
  // Two stacks defining the same site is the mistake the edge's deploy script exists to stop.
  const f = fixture({ edgeSites: { "stack-a.caddy": A + WWW + LEGACY, "igs.caddy": IGS, "dup.caddy": A } });
  const r = run([], f);
  assert.equal(r.status, 1);
  assert.match(r.out, /ambiguous site definition: a\.example\.com/);
  assert.match(r.out, /FAIL/);
});

test("it reads the whole live config: a host defined only in the live Caddyfile counts, with no sites.local/ at all", () => {
  const f = fixture({ liveSitesLocal: {}, edgeSites: { "stack-a.caddy": A + WWW + LEGACY } });
  const r = run([], f);
  assert.equal(r.status, 0, r.out);
  assert.match(r.out, /\(none\)/);
  assert.match(r.out, /PASS: all 3 hosts/);
});

test("it says who owns 80 and 443: the asafarim-com Caddy before the cutover, the edge after", () => {
  const f = fixture();
  const before = run([], { ...f, bin: shims({ psOutput: "asafarim-com-caddy-1 (compose project: asafarim-com) (80)\nasafarim-com-caddy-1 (compose project: asafarim-com) (443)\n" }) });
  assert.match(before.out, /443: asafarim-com-caddy-1/);
  assert.match(before.out, /the asafarim-com Caddy owns 80\/443 \(before the cutover\)/);
  const afterCutover = run([], { ...f, bin: shims({ psOutput: "edge-caddy-1 (compose project: edge) (80)\nedge-caddy-1 (compose project: edge) (443)\n" }) });
  assert.match(afterCutover.out, /the shared edge owns 80\/443 \(after the cutover\)/);
  const nobody = run([], f);
  assert.match(nobody.out, /nothing in Docker serves 80\/443/);
});

test("it changes nothing: both folders are byte-identical after a run, with a failing config too", () => {
  for (const f of [fixture(), fixture({ edgeSites: { "stack-a.caddy": A } })]) {
    const [liveBefore, edgeBefore] = [digest(f.live), digest(f.edge)];
    run([], f);
    assert.equal(digest(f.live), liveBefore);
    assert.equal(digest(f.edge), edgeBefore);
  }
});

test("--snapshot writes one row per host (HTTP status, certificate expiry) and --compare reports no differences for the same state", () => {
  const f = fixture();
  const web = {
    "a.example.com": [200, "Jan  1 00:00:00 2027 GMT"],
    "www.a.example.com": [301, "Jan  1 00:00:00 2027 GMT"],
    "legacy.example.com": [200, "Feb  2 00:00:00 2027 GMT"],
    "igs.example.com": [403, "Mar  3 00:00:00 2027 GMT"],
  };
  const bin = shims({ web });
  const before = path.join(scratch, "before.tsv");
  const r = run(["--snapshot", before], { ...f, bin });
  assert.equal(r.status, 0, r.out);
  const rows = readFileSync(before, "utf8").split("\n").filter((l) => l && !l.startsWith("#"));
  assert.deepEqual(rows, [
    "a.example.com\t200\tJan  1 00:00:00 2027 GMT",
    "igs.example.com\t403\tMar  3 00:00:00 2027 GMT",
    "legacy.example.com\t200\tFeb  2 00:00:00 2027 GMT",
    "www.a.example.com\t301\tJan  1 00:00:00 2027 GMT",
  ]);
  assert.match(r.out, /a\.example\.com\s+200\s+Jan {2}1 00:00:00 2027 GMT/);

  const same = run(["--compare", before, before]);
  assert.equal(same.status, 0, same.out);
  assert.match(same.out, /PASS: all 4 hosts answer as before\./);
});

test("--compare: a changed HTTP status or a host that vanished FAILs; a changed certificate date only warns", () => {
  const head = "# host\thttp_status\tcertificate_not_after\n";
  const before = path.join(scratch, "cmp-before.tsv");
  const after = path.join(scratch, "cmp-after.tsv");
  writeFileSync(before, head + "a.example.com\t200\tX\nb.example.com\t200\tY\nc.example.com\t200\tZ\nd.example.com\t301\tW\n");
  writeFileSync(after, head + "a.example.com\t502\tX\nb.example.com\t200\tY2\nd.example.com\t301\tW\ne.example.com\t200\tV\n");
  const r = run(["--compare", before, after]);
  assert.equal(r.status, 1);
  assert.match(r.out, /a\.example\.com\s+200 -> 502\s+<-- FAIL: the HTTP status changed/);
  assert.match(r.out, /b\.example\.com\s+200 \(same\)\s+<-- WARN: certificate expiry Y -> Y2/);
  assert.match(r.out, /c\.example\.com\s+\(gone\)\s+<-- FAIL: only in the before snapshot/);
  assert.match(r.out, /e\.example\.com\s+\(new\)\s+<-- FAIL: only in the after snapshot/);
  assert.match(r.out, /FAIL: 3 difference\(s\) \(and 1 certificate warning\(s\)\)/);

  const onlyWarn = path.join(scratch, "cmp-warn.tsv");
  writeFileSync(onlyWarn, head + "a.example.com\t200\tX2\n");
  const justOne = path.join(scratch, "cmp-one.tsv");
  writeFileSync(justOne, head + "a.example.com\t200\tX\n");
  const warn = run(["--compare", justOne, onlyWarn]);
  assert.equal(warn.status, 0, warn.out);
  assert.match(warn.out, /PASS: all 1 hosts answer as before \(1 certificate warning\(s\) above\)\./);
});

test("usage errors exit 2: unknown flags, --snapshot without a file, --compare without two files, a missing config", () => {
  const f = fixture();
  for (const args of [["--yes"], ["--snapshot"], ["--compare", "only-one"]]) {
    assert.equal(run(args, f).status, 2, args.join(" "));
  }
  assert.equal(run([], { live: path.join(scratch, "nowhere"), edge: f.edge }).status, 2);
  assert.equal(run([], { live: f.live, edge: path.join(scratch, "nowhere") }).status, 2);
});

test("it is read-only by construction: no stop/start/rm/exec/reload/network commands, only read-only throwaway mounts", () => {
  const code = script
    .split("\n")
    .filter((l) => !l.trim().startsWith("#"))
    .join("\n");
  assert.doesNotMatch(code, /docker\s+(stop|start|restart|kill|rm|exec|cp|compose|network|volume|run\s+(?!--rm))/);
  assert.doesNotMatch(code, /caddy\s+reload|systemctl|\bsudo\b|\brm\s+-rf?\s+(?!"\$WORK_DIR")/);
  const runs = code.split("\n").filter((l) => /\bdocker run\b/.test(l));
  assert.ok(runs.length > 0, "the script runs Caddy in a container");
  for (const line of runs) {
    assert.match(line, /docker run --rm --network none /, "a throwaway container with no network");
    const mounts = [...line.matchAll(/\s-v\s+"([^"]+)"/g)].map((m) => m[1]);
    assert.ok(mounts.length > 0);
    for (const m of mounts) assert.match(m, /:\/etc\/caddy:ro$/, `mount ${m} must be read-only`);
  }
});

test("it is valid bash", () => {
  const r = spawnSync("bash", ["-n", SCRIPT], { encoding: "utf8" });
  assert.equal(r.status, 0, r.stderr);
});
