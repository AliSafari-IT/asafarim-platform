// edge-cutover-check.sh (#839, #770 phase 3): the read-only check the owner
// runs on the VPS before the cutover. These tests run it against FIXTURES built
// from this repository's real configs (the live infra/caddy and the edge's
// infra/edge/caddy), plus the two site files other stacks install into the live
// Caddy's sites.local/ before the cutover (igs, asafarim-os). Documentation
// names and CIDRs only.
//
// Needs Docker (the pinned caddy image adapts and validates the copies), like
// edge-config.test.mjs. The snapshot's HTTPS requests go to fake curl/openssl.
//   node --test infra/edge/scripts/edge-cutover-check.test.mjs
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import {
  chmodSync,
  cpSync,
  mkdirSync,
  mkdtempSync,
  readdirSync,
  readFileSync,
  rmSync,
  statSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { after, test } from "node:test";

const repo = path.resolve(import.meta.dirname, "../../..");
const SCRIPT = path.join(repo, "infra/edge/scripts/edge-cutover-check.sh");
const CADDY_IMAGE = /image:\s*(caddy:[\w.-]+)/.exec(
  readFileSync(path.join(repo, "infra/edge/docker-compose.yml"), "utf8")
)[1];

const scratch = mkdtempSync(path.join(tmpdir(), "edge-cutover-"));
after(() => rmSync(scratch, { recursive: true, force: true }));

const IGS_ALLOW = "192.0.2.10/32 2001:db8:1234::/64";
const OS_SITE = `# fixture: the asafarim-os stack's site file
asafarim.site {
  reverse_proxy os-site:8080
}

www.asafarim.site {
  redir https://asafarim.site{uri} 301
}
`;

function renderIgs(out) {
  const r = spawnSync(
    "bash",
    [
      "-c",
      'source "$1" && igs_render_site "$2" "$3" "$4"',
      "_",
      path.join(repo, "infra/scripts/lib/igs.sh"),
      path.join(repo, "infra/igs/igs-pharma.caddy.template"),
      IGS_ALLOW,
      out,
    ],
    { encoding: "utf8" }
  );
  assert.equal(r.status, 0, r.stderr);
}

let n = 0;
/** A VPS-like layout: <root>/live (asafarim-com's infra/caddy) and <root>/edge (the edge project). */
function fixture() {
  const root = path.join(scratch, `f${++n}`);
  const live = path.join(root, "live");
  const edge = path.join(root, "edge");
  cpSync(path.join(repo, "infra/caddy"), live, { recursive: true });
  rmSync(path.join(live, "sites.local"), { recursive: true, force: true });
  mkdirSync(path.join(live, "sites.local"), { recursive: true });
  cpSync(path.join(repo, "infra/edge"), edge, { recursive: true });
  for (const dir of [
    path.join(live, "sites.local"),
    path.join(edge, "caddy/sites"),
  ]) {
    renderIgs(path.join(dir, "igs-pharma.caddy"));
    writeFileSync(path.join(dir, "asafarim-os.caddy"), OS_SITE);
  }
  return { root, live, edge };
}

function run(f, args = [], env = {}) {
  const r = spawnSync("bash", [SCRIPT, ...args], {
    encoding: "utf8",
    env: {
      ...process.env,
      CUTOVER_LIVE_DIR: f.live,
      EDGE_DIR: f.edge,
      EDGE_CADDY_IMAGE: CADDY_IMAGE,
      MSYS_NO_PATHCONV: "1",
      ...env,
    },
  });
  return { status: r.status, out: r.stdout + r.stderr };
}

/** The table row for one host, e.g. ["asafarim.site", "yes", "no", "MISSING ON EDGE"]. */
function row(out, host) {
  const line = out.split("\n").find((l) => l.split(/\s+/)[0] === host);
  assert.ok(line, `no row for ${host} in:\n${out}`);
  return line
    .trim()
    .split(/\s{2,}|\s(?=yes|no)/)
    .filter(Boolean);
}

function treeHash(dir) {
  const h = createHash("sha256");
  const walk = (d) => {
    for (const name of readdirSync(d).sort()) {
      const p = path.join(d, name);
      const s = statSync(p);
      h.update(`${path.relative(dir, p)}:${s.mode}:${s.mtimeMs}\n`);
      if (s.isDirectory()) walk(p);
      else h.update(readFileSync(p));
    }
  };
  walk(dir);
  return h.digest("hex");
}

test("PASS when the edge serves exactly the live hosts and carries identical copies of sites.local/", () => {
  const f = fixture();
  const r = run(f);
  assert.equal(r.status, 0, r.out);
  for (const host of [
    "asafarim.com",
    "hub.asafarim.com",
    "asafarim.be",
    "asafarim.site",
    "www.asafarim.site",
    "igs-pharma.be",
    "platform.igs-pharma.be",
  ]) {
    assert.deepEqual(row(r.out, host).slice(0, 3), [host, "yes", "yes"]);
  }
  assert.match(r.out, /igs-pharma\.caddy\s+identical/);
  assert.match(r.out, /asafarim-os\.caddy\s+identical/);
  assert.match(r.out, /== caddy validate \(edge, combined config\)\n {2}valid/);
  assert.match(r.out, /== Ports 80\/443 today\n {2}80 /);
  assert.match(r.out, /\nRESULT: PASS/);
});

test("it is read-only: neither config directory changes", () => {
  const f = fixture();
  const before = treeHash(f.root);
  run(f);
  assert.equal(treeHash(f.root), before);
});

test("FAIL when a stack's site file was only installed in the live Caddy (host missing on the edge)", () => {
  const f = fixture();
  rmSync(path.join(f.edge, "caddy/sites/asafarim-os.caddy"));
  const r = run(f);
  assert.equal(r.status, 1, r.out);
  assert.deepEqual(row(r.out, "asafarim.site"), [
    "asafarim.site",
    "yes",
    "no",
    "MISSING ON EDGE",
  ]);
  assert.deepEqual(row(r.out, "www.asafarim.site"), [
    "www.asafarim.site",
    "yes",
    "no",
    "MISSING ON EDGE",
  ]);
  assert.match(
    r.out,
    /asafarim-os\.caddy\s+MISSING: no sites\/asafarim-os\.caddy on the edge/
  );
  assert.match(r.out, /\nRESULT: FAIL \(3 problem\(s\)/);
});

test("FAIL when a host is only on the edge", () => {
  const f = fixture();
  writeFileSync(
    path.join(f.edge, "caddy/sites/extra.caddy"),
    "only-edge.example {\n  respond 200\n}\n"
  );
  const r = run(f);
  assert.equal(r.status, 1, r.out);
  assert.deepEqual(row(r.out, "only-edge.example"), [
    "only-edge.example",
    "no",
    "yes",
    "NOT ON LIVE",
  ]);
});

test("hosts are compared by name, not by file: a host moved to another edge file still matches", () => {
  const f = fixture();
  // asafarim.be lives in the live Caddyfile and in the edge's sites/asafarim-be.caddy.
  // Move it again on the edge, into a differently named file.
  const be = path.join(f.edge, "caddy/sites/asafarim-be.caddy");
  writeFileSync(
    path.join(f.edge, "caddy/sites/zz-moved.caddy"),
    readFileSync(be)
  );
  rmSync(be);
  const r = run(f);
  assert.equal(r.status, 0, r.out);
  assert.deepEqual(row(r.out, "asafarim.be").slice(0, 3), [
    "asafarim.be",
    "yes",
    "yes",
  ]);
});

test("FAIL when the edge's copy of a sites.local/ file differs, even with the same hosts", () => {
  const f = fixture();
  writeFileSync(
    path.join(f.edge, "caddy/sites/igs-pharma.caddy"),
    readFileSync(
      path.join(f.live, "sites.local/igs-pharma.caddy"),
      "utf8"
    ).replace("192.0.2.10/32", "192.0.2.99/32")
  );
  const r = run(f);
  assert.equal(r.status, 1, r.out);
  assert.deepEqual(row(r.out, "platform.igs-pharma.be").slice(0, 3), [
    "platform.igs-pharma.be",
    "yes",
    "yes",
  ]);
  assert.match(
    r.out,
    /igs-pharma\.caddy\s+DIFFERS from sites\/igs-pharma\.caddy on the edge/
  );
  assert.match(r.out, /\nRESULT: FAIL \(1 problem\(s\)/);
});

test("FAIL when the edge's combined config adapts but does not validate", () => {
  const f = fixture();
  // Same hosts on both sides; only `caddy validate` (provisioning) rejects the missing certificate files.
  for (const file of [
    path.join(f.live, "sites.local/asafarim-os.caddy"),
    path.join(f.edge, "caddy/sites/asafarim-os.caddy"),
  ]) {
    writeFileSync(
      file,
      OS_SITE.replace(
        "reverse_proxy os-site:8080",
        "tls /nonexistent/cert.pem /nonexistent/key.pem\n  reverse_proxy os-site:8080"
      )
    );
  }
  const r = run(f);
  assert.equal(r.status, 1, r.out);
  assert.match(
    r.out,
    /== caddy validate \(edge, combined config\)\n {2}INVALID:/
  );
  assert.match(r.out, /\nRESULT: FAIL \(1 problem\(s\)/);
});

test("exit 2 when a config directory is missing", () => {
  const f = fixture();
  const r = run(f, [], { CUTOVER_LIVE_DIR: path.join(f.root, "nowhere") });
  assert.equal(r.status, 2);
  assert.match(r.out, /no Caddyfile in .*nowhere/);
  assert.equal(run(f, ["--bogus"]).status, 2);
});

// --- snapshot and compare -----------------------------------------------------

/** Fake curl and openssl on PATH: statuses and expiries come from per-host maps. */
function fakeBin(statuses, certs) {
  const bin = path.join(scratch, `bin${++n}`);
  mkdirSync(bin);
  writeFileSync(
    path.join(bin, "status.map"),
    Object.entries(statuses)
      .map(([h, s]) => `${h} ${s}\n`)
      .join("")
  );
  writeFileSync(
    path.join(bin, "cert.map"),
    Object.entries(certs)
      .map(([h, c]) => `${h}\t${c}\n`)
      .join("")
  );
  writeFileSync(
    path.join(bin, "curl"),
    `#!/usr/bin/env bash
host=""; while (($#)); do [[ "$1" == --resolve ]] && { host="\${2%%:*}"; echo "$*" >>"${bin}/curl.log"; }; shift; done
s="$(awk -v h="$host" '$1 == h { print $2 }' "${bin}/status.map")"
printf '%s' "\${s:-000}"; [[ -n "$s" ]]
`
  );
  writeFileSync(
    path.join(bin, "openssl"),
    `#!/usr/bin/env bash
if [[ "$1" == s_client ]]; then
  while (($#)); do [[ "$1" == -servername ]] && echo "FAKECERT $2"; shift; done
elif [[ "$1" == x509 ]]; then
  read -r _ host || exit 1
  c="$(awk -F'\\t' -v h="$host" '$1 == h { print $2 }' "${bin}/cert.map")"
  [[ -n "$c" ]] && echo "notAfter=$c"
fi
`
  );
  chmodSync(path.join(bin, "curl"), 0o755);
  chmodSync(path.join(bin, "openssl"), 0o755);
  return bin;
}

test("--snapshot writes host, HTTP status and certificate expiry for every host of both configs, via this host", () => {
  const f = fixture();
  const bin = fakeBin(
    {
      "asafarim.com": 200,
      "www.asafarim.site": 301,
      "platform.igs-pharma.be": 403,
    },
    { "asafarim.com": "Dec 31 23:59:59 2026 GMT" }
  );
  const out = path.join(f.root, "before.tsv");
  const r = run(f, ["--snapshot", out], {
    PATH: `${bin}:${process.env.PATH}`,
    CUTOVER_TARGET: "192.0.2.1",
  });
  assert.equal(r.status, 0, r.out);
  const rows = readFileSync(out, "utf8")
    .split("\n")
    .filter((l) => l && !l.startsWith("#"))
    .map((l) => l.split("\t"));
  const byHost = Object.fromEntries(rows.map(([h, ...rest]) => [h, rest]));
  assert.deepEqual(byHost["asafarim.com"], ["200", "Dec 31 23:59:59 2026 GMT"]);
  assert.deepEqual(byHost["www.asafarim.site"], ["301", "-"]);
  assert.deepEqual(byHost["platform.igs-pharma.be"], ["403", "-"]);
  assert.deepEqual(byHost["hub.asafarim.com"], ["000", "-"]);
  assert.ok(rows.length > 20, "every host of both configs");
  assert.match(
    readFileSync(path.join(bin, "curl.log"), "utf8"),
    /--resolve asafarim\.com:443:192\.0\.2\.1 /
  );
  assert.match(r.out, /snapshot: \d+ host\(s\) written to /);
});

function snap(file, rows) {
  writeFileSync(
    file,
    `# edge-cutover snapshot 2026-10-12T00:00:00Z target 127.0.0.1\n# host\tstatus\tcert_not_after\n${rows.map((r) => r.join("\t")).join("\n")}\n`
  );
  return file;
}

const EXP = "Dec 31 23:59:59 2026 GMT";
const BEFORE = [
  ["asafarim.com", "200", EXP],
  ["asafarim.site", "200", EXP],
  ["www.asafarim.site", "301", EXP],
];

test("--compare: PASS when every host answers as before (a renewed certificate is only a note)", () => {
  const f = fixture();
  const b = snap(path.join(f.root, "b.tsv"), BEFORE);
  const a = snap(path.join(f.root, "a.tsv"), [
    BEFORE[0],
    BEFORE[1],
    ["www.asafarim.site", "301", "Mar 31 23:59:59 2027 GMT"],
  ]);
  const r = run(f, ["--compare", b, a]);
  assert.equal(r.status, 0, r.out);
  assert.match(r.out, /asafarim\.com\s+200\s+200\s+same\n/);
  assert.match(
    r.out,
    /www\.asafarim\.site\s+301\s+301\s+same \(certificate expiry Dec 31 23:59:59 2026 GMT -> Mar 31 23:59:59 2027 GMT\)/
  );
  assert.match(r.out, /\nRESULT: PASS/);
});

test("--compare: FAIL on a changed status, a host in one snapshot only, or a lost certificate", () => {
  const f = fixture();
  const b = snap(path.join(f.root, "b.tsv"), BEFORE);
  const a = snap(path.join(f.root, "a.tsv"), [
    ["asafarim.com", "502", EXP],
    ["www.asafarim.site", "000", "-"],
    ["new.example", "200", EXP],
  ]);
  const r = run(f, ["--compare", b, a]);
  assert.equal(r.status, 1, r.out);
  assert.match(r.out, /asafarim\.com\s+200\s+502\s+STATUS CHANGED/);
  assert.match(r.out, /asafarim\.site\s+200\s+-\s+ONLY BEFORE/);
  assert.match(r.out, /new\.example\s+-\s+200\s+ONLY AFTER/);
  assert.match(r.out, /www\.asafarim\.site\s+301\s+000\s+STATUS CHANGED/);
  assert.match(r.out, /\nRESULT: FAIL \(4 host\(s\) differ/);

  const lost = snap(path.join(f.root, "lost.tsv"), [
    BEFORE[0],
    BEFORE[1],
    ["www.asafarim.site", "301", "-"],
  ]);
  const r2 = run(f, ["--compare", b, lost]);
  assert.equal(r2.status, 1, r2.out);
  assert.match(
    r2.out,
    /www\.asafarim\.site\s+301\s+301\s+NO CERTIFICATE AFTER/
  );
});
