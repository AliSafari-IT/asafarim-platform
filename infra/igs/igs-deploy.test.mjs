// igs-pharma.be staging (#822): infra/scripts/lib/igs.sh and the guard rails of
// infra/scripts/igs-deploy.sh. No Docker needed. CI: .github/workflows/edge.yml.
//   node --test infra/igs/igs-deploy.test.mjs
// Documentation CIDRs only (RFC 5737 / RFC 3849): real values never reach git.
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import {
  chmodSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { after, test } from "node:test";

const repo = path.resolve(import.meta.dirname, "../..");
const LIB = path.join(repo, "infra/scripts/lib/igs.sh");
const DEPLOY = path.join(repo, "infra/scripts/igs-deploy.sh");
const TEMPLATE = path.join(repo, "infra/igs/igs-pharma.caddy.template");

const scratch = mkdtempSync(path.join(tmpdir(), "igs-deploy-"));
after(() => rmSync(scratch, { recursive: true, force: true }));

/** Run `<fn> args...` with lib/igs.sh sourced. */
function lib(fn, ...args) {
  return spawnSync("bash", ["-c", `source "$0" && ${fn} "$@"`, LIB, ...args], {
    encoding: "utf8",
  });
}

test("igs_require_sha accepts only a full 40-character lowercase SHA", () => {
  assert.equal(
    lib("igs_require_sha", "26c79f7268b9440cec3b0b7225e3d5d1ef777944").status,
    0
  );
  for (const bad of [
    "",
    "26c79f7",
    "latest",
    "26C79F7268B9440CEC3B0B7225E3D5D1EF777944",
    "26c79f7268b9440cec3b0b7225e3d5d1ef777944x",
  ]) {
    const r = lib("igs_require_sha", bad);
    assert.equal(r.status, 2, `rejects '${bad}'`);
    assert.match(r.stderr, /full 40-character commit SHA/);
  }
});

test("igs_allowlist accepts several IPv4 and IPv6 CIDRs, comma- or space-separated", () => {
  const r = lib(
    "igs_allowlist",
    "192.0.2.10/32, 198.51.100.0/24 2001:db8:1234::/64,2001:db8::1/128"
  );
  assert.equal(r.status, 0, r.stderr);
  assert.equal(
    r.stdout,
    "192.0.2.10/32 198.51.100.0/24 2001:db8:1234::/64 2001:db8::1/128"
  );
});

test("igs_allowlist rejects empty lists, /0, bare IPs and junk, without echoing the value", () => {
  for (const bad of [
    "",
    " , ",
    "0.0.0.0/0",
    "::/0",
    "192.0.2.10",
    "2001:db8::1",
    "256.0.2.1/32",
    "192.0.2.1/33",
    "2001:db8::/129",
    "example.com/32",
    "CHANGE_ME",
  ]) {
    const r = lib("igs_allowlist", bad);
    assert.notEqual(r.status, 0, `rejects '${bad}'`);
    assert.equal(r.stdout, "");
    if (bad.trim().replace(/,/g, ""))
      assert.ok(!r.stderr.includes(bad), `does not echo '${bad}'`);
  }
});

test("igs_render_site fills the allowlist in and leaves no placeholder", () => {
  const out = path.join(scratch, "site.caddy");
  const r = lib(
    "igs_render_site",
    TEMPLATE,
    "192.0.2.10/32 2001:db8:1234::/64",
    out
  );
  assert.equal(r.status, 0, r.stderr);
  const text = readFileSync(out, "utf8");
  assert.match(
    text,
    /@igs_platform_allowed remote_ip 192\.0\.2\.10\/32 2001:db8:1234::\/64\n/
  );
  assert.ok(!text.includes("{$IGS_PLATFORM_ALLOW_IPS}"));

  const noToken = path.join(scratch, "no-token.caddy");
  writeFileSync(noToken, "igs-pharma.be {\n\trespond ok\n}\n");
  assert.notEqual(
    lib("igs_render_site", noToken, "192.0.2.10/32", out).status,
    0
  );
});

test("igs_app_env drops the deploy-only IGS_* keys and is private", () => {
  const full = path.join(scratch, "env");
  const apps = path.join(scratch, "env.apps");
  writeFileSync(
    full,
    [
      "# comment",
      "IGS_POSTGRES_PASSWORD=p",
      "IGS_MIGRATOR_DATABASE_URL=postgres://m",
      "IGS_PLATFORM_ALLOW_IPS=192.0.2.10/32",
      "DATABASE_URL=postgres://a",
      'AUTH_SECRET="s$x"',
      "SITE_GATE=coming-soon",
      "",
    ].join("\n")
  );
  assert.equal(lib("igs_app_env", full, apps).status, 0);
  const text = readFileSync(apps, "utf8");
  assert.ok(!/^IGS_/m.test(text), text);
  for (const key of ["DATABASE_URL", "AUTH_SECRET", "SITE_GATE"])
    assert.match(text, new RegExp(`^${key}=`, "m"));
  assert.equal(
    spawnSync("stat", ["-c", "%a", apps], { encoding: "utf8" }).stdout.trim(),
    "600"
  );
  assert.equal(lib("igs_env_value", full, "AUTH_SECRET").stdout, "s$x");
});

test("the env example and the template carry placeholders only", () => {
  const example = readFileSync(
    path.join(repo, "infra/igs/.env.igs.example"),
    "utf8"
  );
  for (const line of example.split("\n").filter((l) => /^[A-Z_]+=/.test(l))) {
    const [key, value] = [
      line.slice(0, line.indexOf("=")),
      line.slice(line.indexOf("=") + 1),
    ];
    if (key === "SITE_GATE") continue;
    assert.match(value, /CHANGE_ME/, `${key} is a placeholder`);
  }
  assert.ok(
    !/\b\d{1,3}(\.\d{1,3}){3}\b/.test(readFileSync(TEMPLATE, "utf8")),
    "no IPv4 in the template"
  );
});

test("igs-deploy.sh rejects a short SHA before touching docker or age", () => {
  const bin = mkdtempSync(path.join(scratch, "bin-"));
  const calls = path.join(scratch, "calls.log");
  for (const tool of ["docker", "age"]) {
    writeFileSync(
      path.join(bin, tool),
      `#!/bin/sh\necho ${tool} >>"${calls}"\nexit 1\n`
    );
    chmodSync(path.join(bin, tool), 0o755);
  }
  const r = spawnSync("bash", [DEPLOY, "26c79f7"], {
    encoding: "utf8",
    env: {
      ...process.env,
      PATH: `${bin}:${process.env.PATH}`,
      REPO_DIR: scratch,
    },
  });
  assert.equal(r.status, 2, r.stderr);
  assert.match(r.stderr, /full 40-character commit SHA/);
  assert.throws(() => readFileSync(calls), "no docker/age call");
});

test("igs-postgres serves TLS from the igs-postgres-tls volume, which runs first (#826)", () => {
  const compose = readFileSync(
    path.join(repo, "infra/igs/docker-compose.yml"),
    "utf8"
  );
  const pg = compose.slice(
    compose.indexOf("\n  igs-postgres:\n"),
    compose.indexOf("\n  igs-migrate:\n")
  );
  for (const flag of [
    "ssl=on",
    "ssl_cert_file=/var/lib/postgresql/tls/server.crt",
    "ssl_key_file=/var/lib/postgresql/tls/server.key",
  ])
    assert.match(pg, new RegExp(`\\n {6}- ${flag}\\n`), flag);
  assert.match(pg, /\n {6}- igs_postgres_tls:\/var\/lib\/postgresql\/tls:ro\n/);
  assert.match(
    pg,
    /\n {6}igs-postgres-tls:\n {8}condition: service_completed_successfully\n/
  );
  assert.match(compose, /\nvolumes:\n(?:.*\n)* {2}igs_postgres_tls:\n/);
});

test("postgres-tls-init.sh creates a key only Postgres can read, and keeps it on later runs", () => {
  const dir = mkdtempSync(path.join(scratch, "tls-"));
  const owner = `${process.getuid()}:${process.getgid()}`;
  const run = () =>
    spawnSync("sh", [path.join(repo, "infra/igs/postgres-tls-init.sh")], {
      encoding: "utf8",
      env: { ...process.env, TLS_DIR: dir, TLS_OWNER: owner },
    });
  const first = run();
  assert.equal(first.status, 0, first.stderr);
  assert.match(first.stdout, /created a self-signed certificate/);
  const mode = (f) =>
    spawnSync("stat", ["-c", "%a", path.join(dir, f)], {
      encoding: "utf8",
    }).stdout.trim();
  assert.equal(mode("server.key"), "600");
  assert.equal(mode("server.crt"), "644");
  const cert = readFileSync(path.join(dir, "server.crt"), "utf8");
  assert.match(cert, /^-----BEGIN CERTIFICATE-----\n/);

  chmodSync(path.join(dir, "server.key"), 0o644);
  const second = run();
  assert.equal(second.status, 0, second.stderr);
  assert.match(second.stdout, /keeping the existing certificate/);
  assert.equal(readFileSync(path.join(dir, "server.crt"), "utf8"), cert);
  assert.equal(mode("server.key"), "600", "the key mode is reset");

  // An interrupted run: a key that doesn't match the certificate is replaced.
  const other = mkdtempSync(path.join(scratch, "tls-other-"));
  spawnSync("sh", [path.join(repo, "infra/igs/postgres-tls-init.sh")], {
    env: { ...process.env, TLS_DIR: other, TLS_OWNER: owner },
  });
  writeFileSync(
    path.join(dir, "server.key"),
    readFileSync(path.join(other, "server.key"))
  );
  const third = run();
  assert.equal(third.status, 0, third.stderr);
  assert.match(third.stdout, /created a self-signed certificate/);
  assert.notEqual(readFileSync(path.join(dir, "server.crt"), "utf8"), cert);
});

test("igs-deploy.sh pulls igs-postgres-tls with the rest", () => {
  assert.match(
    readFileSync(DEPLOY, "utf8"),
    /\bpull --quiet igs-postgres-tls igs-postgres igs-migrate\b/
  );
});
