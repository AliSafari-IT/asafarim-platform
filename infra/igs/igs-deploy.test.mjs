// igs-pharma.be staging (#822): infra/scripts/lib/igs.sh and the guard rails of
// infra/scripts/igs-deploy.sh. No Docker needed. CI: .github/workflows/edge.yml.
//   node --test infra/igs/igs-deploy.test.mjs
// Documentation CIDRs only (RFC 5737 / RFC 3849): real values never reach git.
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import {
  chmodSync,
  mkdirSync,
  mkdtempSync,
  readdirSync,
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

test("igs_allowlist: empty, unset or only separators means no IP filter (the default)", () => {
  for (const off of ["", " ", " , ", ",,"]) {
    const r = lib("igs_allowlist", off);
    assert.equal(r.status, 0, `'${off}' is off: ${r.stderr}`);
    assert.equal(r.stdout, "");
    assert.equal(r.stderr, "");
  }
  // unset: no argument at all
  const unset = spawnSync("bash", ["-c", 'source "$0" && igs_allowlist', LIB], {
    encoding: "utf8",
  });
  assert.equal(unset.status, 0, unset.stderr);
  assert.equal(unset.stdout, "");
});

test("igs_allowlist rejects /0, bare IPs and junk, without echoing the value", () => {
  for (const bad of [
    "0.0.0.0/0",
    "::/0",
    "192.0.2.10",
    "2001:db8::1",
    "256.0.2.1/32",
    "192.0.2.1/33",
    "2001:db8::/129",
    "example.com/32",
    "CHANGE_ME",
    "192.0.2.10/32, 0.0.0.0/0",
    "192.0.2.10/32 junk",
  ]) {
    const r = lib("igs_allowlist", bad);
    assert.notEqual(r.status, 0, `rejects '${bad}'`);
    assert.equal(r.stdout, "");
    for (const part of bad.split(/[ ,]+/).filter((p) => p !== "192.0.2.10/32"))
      assert.ok(!r.stderr.includes(part), `does not echo '${part}'`);
  }
});

/** The rendered site file's platform.igs-pharma.be block. */
const platformBlock = (text) =>
  text.slice(text.indexOf("platform.igs-pharma.be {"));

test("igs_render_site: with an allowlist, the allowlist variant filled in, nothing else", () => {
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
  assert.ok(!text.includes("# igs:"), "no variant markers left");
  const platform = platformBlock(text);
  assert.match(platform, /\n\t\t\tHTML 403\n/, "the branded 403 page");
  // the only proxy to the back-office is behind the allowlist matcher
  assert.equal(platform.match(/reverse_proxy igs-platform:3001/g).length, 1);
  assert.match(
    platform,
    /handle @igs_platform_allowed \{\n\t\treverse_proxy igs-platform:3001\n/
  );
});

test("igs_render_site: without an allowlist, the open variant and no leftover placeholder", () => {
  const out = path.join(scratch, "open.caddy");
  const r = lib("igs_render_site", TEMPLATE, "", out);
  assert.equal(r.status, 0, r.stderr);
  const text = readFileSync(out, "utf8");
  assert.ok(!text.includes("{$IGS_PLATFORM_ALLOW_IPS}"), "no placeholder");
  assert.ok(!text.includes("$IGS_PLATFORM_ALLOW_IPS"), "no placeholder");
  assert.ok(!text.includes("# igs:"), "no variant markers left");
  const platform = platformBlock(text);
  assert.doesNotMatch(platform, /remote_ip|@igs_platform_allowed|403/);
  assert.match(
    platform,
    /^platform\.igs-pharma\.be \{\n\treverse_proxy igs-platform:3001\n\}\n$/
  );
  // the rest of the file is the same in both variants
  const allow = path.join(scratch, "allow.caddy");
  assert.equal(
    lib("igs_render_site", TEMPLATE, "192.0.2.10/32", allow).status,
    0
  );
  const head = (t) => t.slice(0, t.indexOf("platform.igs-pharma.be {"));
  assert.equal(head(text), head(readFileSync(allow, "utf8")));
});

test("igs_render_site refuses a template without the placeholder or the variant markers", () => {
  const out = path.join(scratch, "bad.caddy");
  const write = (name, text) => {
    const file = path.join(scratch, name);
    writeFileSync(file, text);
    return file;
  };
  const template = readFileSync(TEMPLATE, "utf8");
  const noToken = write("no-token.caddy", "igs-pharma.be {\n\trespond ok\n}\n");
  const noOpen = write(
    "no-open.caddy",
    template.replace(/\t# igs:open:begin\n[^]*?\t# igs:open:end\n/, "")
  );
  const tokenOutside = write(
    "token-outside.caddy",
    `${template}\nexample.test {\n\t@x remote_ip {$IGS_PLATFORM_ALLOW_IPS}\n}\n`
  );
  for (const [file, allow, message] of [
    [noToken, "192.0.2.10/32", /no \{\$IGS_PLATFORM_ALLOW_IPS\} placeholder/],
    [noOpen, "", /exactly one '# igs:open:begin' line/],
    [tokenOutside, "", /outside the allowlist variant/],
  ]) {
    const r = lib("igs_render_site", file, allow, out);
    assert.notEqual(r.status, 0, String(message));
    assert.match(r.stderr, message);
  }
});

test("the back-office 403 is a branded HTML page, not a bare 'Forbidden'", () => {
  const text = readFileSync(TEMPLATE, "utf8");
  const site = text.slice(text.indexOf("platform.igs-pharma.be {"));
  const page = site.slice(site.indexOf("respond <<HTML"));
  assert.match(page, /^respond <<HTML\n[\s\S]*\n\t+HTML 403\n/);
  assert.ok(!site.includes('respond "Forbidden"'));
  assert.match(site, /Content-Type "text\/html; charset=utf-8"/);
  assert.match(site, /Cache-Control "no-store"/);
  assert.match(site, /X-Robots-Tag "noindex/);
  // Shows the visitor's address and gives a way on.
  assert.ok(page.includes("{client_ip}"));
  assert.ok(page.includes('href="https://igs-pharma.be/"'));
  // Caddy reads every { } in a response body as a placeholder: the page holds
  // only the one it means.
  const body = page.slice(0, page.indexOf("HTML 403"));
  assert.deepEqual(body.match(/[{}]/g), ["{", "}"]);
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
      "DATABASE_MIGRATE_URL=postgres://m",
      'AUTH_SECRET="s$x"',
      "SITE_GATE=coming-soon",
      "",
    ].join("\n")
  );
  assert.equal(lib("igs_app_env", full, apps).status, 0);
  const text = readFileSync(apps, "utf8");
  assert.ok(!/^IGS_/m.test(text), text);
  // The compose file sets each service's connection (#841): none from the env file.
  assert.ok(!/^DATABASE_(MIGRATE_)?URL=/m.test(text), text);
  for (const key of ["AUTH_SECRET", "SITE_GATE"])
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
    // optional, off by default: empty means no IP filter in front of the back-office
    if (key === "IGS_PLATFORM_ALLOW_IPS") {
      assert.equal(value, "", "the allowlist is off by default");
      continue;
    }
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
  const ca = mkdtempSync(path.join(scratch, "ca-"));
  const owner = `${process.getuid()}:${process.getgid()}`;
  const run = () =>
    spawnSync("sh", [path.join(repo, "infra/igs/postgres-tls-init.sh")], {
      encoding: "utf8",
      env: { ...process.env, TLS_DIR: dir, CA_DIR: ca, TLS_OWNER: owner },
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
  // #841: the apps' volume gets the public certificate only, read-only.
  const caMode = () =>
    spawnSync("stat", ["-c", "%a", path.join(ca, "ca.crt")], {
      encoding: "utf8",
    }).stdout.trim();
  assert.equal(readFileSync(path.join(ca, "ca.crt"), "utf8"), cert);
  assert.equal(caMode(), "444");
  assert.deepEqual(readdirSync(ca), ["ca.crt"], "never the key");

  chmodSync(path.join(dir, "server.key"), 0o644);
  const second = run();
  assert.equal(second.status, 0, second.stderr);
  assert.match(second.stdout, /keeping the existing certificate/);
  assert.equal(readFileSync(path.join(dir, "server.crt"), "utf8"), cert);
  assert.equal(mode("server.key"), "600", "the key mode is reset");

  // An interrupted run: a key that doesn't match the certificate is replaced.
  const other = mkdtempSync(path.join(scratch, "tls-other-"));
  spawnSync("sh", [path.join(repo, "infra/igs/postgres-tls-init.sh")], {
    env: { ...process.env, TLS_DIR: other, CA_DIR: other, TLS_OWNER: owner },
  });
  writeFileSync(
    path.join(dir, "server.key"),
    readFileSync(path.join(other, "server.key"))
  );
  const third = run();
  assert.equal(third.status, 0, third.stderr);
  assert.match(third.stdout, /created a self-signed certificate/);
  const renewed = readFileSync(path.join(dir, "server.crt"), "utf8");
  assert.notEqual(renewed, cert);
  assert.equal(readFileSync(path.join(ca, "ca.crt"), "utf8"), renewed);
  assert.equal(caMode(), "444");
});

test("igs-deploy.sh pulls igs-postgres-tls with the rest", () => {
  assert.match(
    readFileSync(DEPLOY, "utf8"),
    /\bpull --quiet igs-postgres-tls igs-postgres igs-migrate\b/
  );
});

// --- The health check (#828): infra/scripts/igs-healthcheck.sh ---
const HEALTH = path.join(repo, "infra/scripts/igs-healthcheck.sh");
// A made-up webhook: it must never show up in any output.
const WEBHOOK = "https://discord.com/api/webhooks/123456/fake-token_for-tests";

/** Run `<fn> args...` with igs-healthcheck.sh sourced. */
function health(fn, ...args) {
  // $0 is not the script: sourcing it must only define the functions.
  return spawnSync(
    "bash",
    ["-c", `source "$1" && shift && ${fn} "$@"`, "test", HEALTH, ...args],
    {
      encoding: "utf8",
    }
  );
}

test("igs_health_transition: an alert on going down, a recovery on coming back, nothing otherwise", () => {
  const dir = mkdtempSync(path.join(scratch, "state-"));
  const state = path.join(dir, "state");
  const step = (s) => {
    const action = health("igs_health_transition", state, s).stdout.trim();
    health("igs_health_record", state, s);
    return action;
  };
  assert.equal(step("ok"), "none", "first run, healthy: nothing to say");
  assert.equal(step("ok"), "none");
  assert.equal(step("down"), "alert");
  assert.equal(step("down"), "none", "still down: no second alert");
  assert.equal(step("ok"), "recover");
  assert.equal(step("ok"), "none");
  rmSync(state);
  assert.equal(step("down"), "alert", "down on the first run alerts");
});

test("igs_alert_webhook accepts only a Discord webhook URL", () => {
  const env = path.join(scratch, "env.webhook");
  for (const [value, ok] of [
    [WEBHOOK, true],
    [`"${WEBHOOK}"`, true],
    ["CHANGE_ME", false],
    ["", false],
    ["http://discord.com/api/webhooks/1/x", false],
    ["https://example.com/api/webhooks/1/x", false],
  ]) {
    writeFileSync(env, `AUTH_SECRET=x\nIGS_ALERT_WEBHOOK_DISCORD=${value}\n`);
    assert.equal(
      health("igs_alert_webhook", env).stdout,
      ok ? WEBHOOK : "",
      value
    );
  }
  assert.equal(
    health("igs_alert_webhook", path.join(scratch, "missing")).stdout,
    ""
  );
});

/**
 * A fake VPS: docker answers for the igs services except those in DOWN, and
 * curl answers the public health URL with PUBLIC (200 by default) and records
 * every webhook post (its stdin config and its body) in posts.log. With
 * FAIL_POST (an HTTP status), Discord rejects the post: like real curl, the
 * fake only exits non-zero (22) when it is called with --fail.
 */
function fakeVps() {
  const dir = mkdtempSync(path.join(scratch, "vps-"));
  const bin = path.join(dir, "bin");
  spawnSync("mkdir", ["-p", bin, path.join(dir, "repo/infra/igs")]);
  writeFileSync(
    path.join(bin, "docker"),
    `#!/usr/bin/env bash
if [[ "$1" == ps ]]; then
  for a in "$@"; do [[ "$a" == label=com.docker.compose.service=* ]] && svc="\${a#*=}" && svc="\${svc#*=}"; done
  [[ " \${DOWN:-} " == *" $svc "* ]] || echo "id-$svc"
  exit 0
fi
if [[ "$1" == exec ]]; then [[ " \${SICK:-} " == *" \${2#id-} "* ]] && exit 1; exit 0; fi
exit 2
`
  );
  writeFileSync(
    path.join(bin, "curl"),
    `#!/usr/bin/env bash
for a in "$@"; do
  if [[ "$a" == "-K" ]]; then
    { cat; printf '%s\\n' "$*"; } >>"${dir}/posts.log"
    [[ -n "\${FAIL_POST:-}" && " $* " == *" --fail "* ]] && exit 22
    exit 0
  fi
done
printf '%s' "\${PUBLIC:-200}"
`
  );
  chmodSync(path.join(bin, "docker"), 0o755);
  chmodSync(path.join(bin, "curl"), 0o755);
  const env = path.join(dir, "repo/infra/igs/.env.igs");
  writeFileSync(env, `IGS_ALERT_WEBHOOK_DISCORD=${WEBHOOK}\n`);
  const run = (extra = {}) =>
    spawnSync("bash", [HEALTH], {
      encoding: "utf8",
      env: {
        ...process.env,
        PATH: `${bin}:${process.env.PATH}`,
        REPO_DIR: path.join(dir, "repo"),
        IGS_HEALTH_STATE_DIR: path.join(dir, "state"),
        ...extra,
      },
    });
  const posts = () => {
    try {
      return readFileSync(path.join(dir, "posts.log"), "utf8");
    } catch {
      return "";
    }
  };
  return { run, posts, env };
}

test("igs-healthcheck.sh posts one alert when igs-worker stops and one recovery when it's back", () => {
  const vps = fakeVps();
  const outputs = [];
  const run = (extra) => {
    const r = vps.run(extra);
    assert.equal(r.status, 0, r.stderr);
    outputs.push(r.stdout + r.stderr);
    return r;
  };

  assert.match(run().stdout, /healthy/);
  assert.equal(vps.posts(), "", "healthy: nothing posted");

  assert.match(
    run({ DOWN: "igs-worker" }).stdout,
    /UNHEALTHY: igs-worker is not running/
  );
  run({ DOWN: "igs-worker" });
  const afterDown = vps.posts();
  assert.equal(afterDown.match(/"content"/g)?.length, 1, "exactly one alert");
  assert.match(afterDown, /unhealthy:\\n- igs-worker is not running/);
  assert.match(
    afterDown,
    /^url = "https:\/\/discord\.com\/api\/webhooks\//m,
    "the URL reaches curl on stdin"
  );

  run();
  run();
  const all = vps.posts();
  assert.equal(all.match(/"content"/g)?.length, 2, "exactly one recovery");
  assert.match(all, /has recovered/);

  for (const out of outputs)
    assert.ok(
      !out.includes("fake-token"),
      "the webhook never shows in the log"
    );
  for (const line of all.split("\n").filter((l) => !l.startsWith("url = ")))
    assert.ok(
      !line.includes("fake-token"),
      "the webhook is not on curl's command line"
    );
});

test("igs-healthcheck.sh keeps the state when Discord rejects the alert, and sends it on the next run (#835)", () => {
  const vps = fakeVps();
  const outputs = [];
  const run = (extra) => {
    const r = vps.run(extra);
    assert.equal(r.status, 0, r.stderr);
    outputs.push(r.stdout + r.stderr);
    return r;
  };
  const alerts = () => vps.posts().match(/"content"/g)?.length ?? 0;

  run();
  for (const status of ["429", "500"]) {
    assert.match(
      run({ DOWN: "igs-worker", FAIL_POST: status }).stdout,
      /could not send the alert message to Discord; retrying on the next run/
    );
  }
  assert.equal(alerts(), 2, "each rejected run tried to post");

  const sent = run({ DOWN: "igs-worker" });
  assert.match(sent.stdout, /sent the alert message to Discord/);
  assert.equal(alerts(), 3, "the next run sends the alert");
  run({ DOWN: "igs-worker" });
  assert.equal(alerts(), 3, "and only once");

  run({ FAIL_POST: "503" });
  run();
  assert.equal(alerts(), 5, "a rejected recovery is retried too");
  assert.match(vps.posts(), /has recovered/);

  for (const out of outputs)
    assert.ok(
      !out.includes("fake-token"),
      "the webhook never shows in the log"
    );
});

test("igs-healthcheck.sh names each failed check, and without a webhook it only logs", () => {
  const vps = fakeVps();
  writeFileSync(vps.env, "IGS_ALERT_WEBHOOK_DISCORD=CHANGE_ME\n");
  const r = vps.run({
    SICK: "igs-platform",
    PUBLIC: "502",
    DOWN: "igs-postgres",
  });
  assert.equal(r.status, 0, r.stderr);
  assert.match(r.stdout, /igs-postgres is not running/);
  assert.match(r.stdout, /igs-platform \/api\/health is not 200/);
  assert.match(r.stdout, /answered 502, not 200/);
  assert.doesNotMatch(r.stdout, /igs-web \/api\/health/);
  assert.match(r.stdout, /no IGS_ALERT_WEBHOOK_DISCORD set/);
  assert.equal(vps.posts(), "");
});

test("igs-deploy.sh installs the health check timer, and the units are well-formed", () => {
  const deploy = readFileSync(DEPLOY, "utf8");
  assert.match(
    deploy,
    /install -m 0755 infra\/scripts\/igs-healthcheck\.sh \/usr\/local\/sbin\/igs-healthcheck/
  );
  assert.match(deploy, /systemctl enable --now --quiet igs-healthcheck\.timer/);
  const service = readFileSync(
    path.join(repo, "infra/igs/igs-healthcheck.service"),
    "utf8"
  );
  assert.match(service, /\nType=oneshot\n/);
  assert.match(service, /\nEnvironment=REPO_DIR=@REPO_DIR@\n/);
  assert.match(service, /\nExecStart=\/usr\/local\/sbin\/igs-healthcheck\n/);
  const timer = readFileSync(
    path.join(repo, "infra/igs/igs-healthcheck.timer"),
    "utf8"
  );
  assert.match(timer, /\nOnUnitActiveSec=2min\n/);
  assert.match(timer, /\nWantedBy=timers\.target\n/);
});

// --- Least-privilege logins and verified TLS (#841) ---
const COMPOSE = path.join(repo, "infra/igs/docker-compose.yml");

/** One service's block of the compose file (two-space-indented key to the next one). */
function service(name) {
  const compose = readFileSync(COMPOSE, "utf8");
  const start = compose.indexOf(`\n  ${name}:\n`);
  assert.notEqual(start, -1, name);
  const rest = compose.slice(start + 1);
  const end = rest.slice(1).search(/\n {2}[a-z][a-z0-9-]*:\n|\n[a-z]/);
  return end === -1 ? rest : rest.slice(0, end + 1);
}

test("each IGS service connects as its own login, the migrator only in igs-migrate (#841)", () => {
  for (const name of ["igs-web", "igs-platform"])
    assert.match(
      service(name),
      /\n {6}DATABASE_URL: \$\{IGS_APP_DATABASE_URL:\?\}\n/,
      name
    );
  assert.match(
    service("igs-worker"),
    /\n {6}DATABASE_URL: \$\{IGS_WORKER_DATABASE_URL:\?\}\n/
  );
  const migrate = service("igs-migrate");
  assert.match(
    migrate,
    /\n {6}DATABASE_MIGRATE_URL: \$\{IGS_MIGRATOR_DATABASE_URL:\?\}\n/
  );
  const runtime = /\n {6}DATABASE_URL: \$\{(IGS_[A-Z_]+):\?\}\n/.exec(migrate);
  assert.ok(runtime, "igs-migrate has a runtime DATABASE_URL");
  assert.notEqual(runtime[1], "IGS_MIGRATOR_DATABASE_URL");
  // The owner's connection reaches no other service.
  for (const name of ["igs-web", "igs-platform", "igs-worker"])
    assert.doesNotMatch(service(name), /MIGRATE|MIGRATOR/, name);
});

test("every IGS app verifies the database against the public certificate only (#841)", () => {
  for (const name of ["igs-migrate", "igs-web", "igs-platform", "igs-worker"]) {
    const block = service(name);
    assert.match(
      block,
      /\n {6}DATABASE_SSL_CA: \/run\/igs-db-ca\/ca\.crt\n/,
      name
    );
    assert.match(block, /\n {6}- igs_postgres_ca:\/run\/igs-db-ca:ro\n/, name);
    assert.doesNotMatch(
      block,
      /igs_postgres_tls/,
      `${name} never mounts the key`
    );
  }
  assert.match(service("igs-postgres-tls"), /\n {6}- igs_postgres_ca:\/ca\n/);
  assert.doesNotMatch(service("igs-postgres"), /igs_postgres_ca/);
  assert.match(
    readFileSync(COMPOSE, "utf8"),
    /\nvolumes:\n(?:.*\n)* {2}igs_postgres_ca:\n/
  );
});

test("nothing turns database TLS verification off (#841)", () => {
  for (const file of [
    COMPOSE,
    path.join(repo, "infra/igs/.env.igs.example"),
    DEPLOY,
    path.join(repo, "infra/scripts/igs-cli.sh"),
  ])
    assert.doesNotMatch(
      readFileSync(file, "utf8"),
      /DATABASE_SSL\s*[:=]\s*["']?(insecure-dev|off)\b/,
      file
    );
});

test("igs_db_logins: own users per service, host igs-postgres, no password in the output", () => {
  const SECRET = "s3cret-never-printed";
  const env = (
    app,
    worker,
    migrator = `postgres://igs:${SECRET}@igs-postgres:5432/igs`
  ) => {
    const file = path.join(mkdtempSync(path.join(scratch, "logins-")), "env");
    writeFileSync(
      file,
      [
        `IGS_MIGRATOR_DATABASE_URL=${migrator}`,
        `IGS_APP_DATABASE_URL=${app}`,
        `IGS_WORKER_DATABASE_URL=${worker}`,
        "",
      ].join("\n")
    );
    return lib("igs_db_logins", file);
  };
  const app = `postgres://igs_app_login:${SECRET}@igs-postgres:5432/igs`;
  const worker = `postgresql://igs_worker_login:${SECRET}@igs-postgres:5432/igs?sslmode=verify-full`;
  assert.equal(env(app, worker).status, 0, env(app, worker).stderr);

  const failures = [
    [
      `postgres://igs:${SECRET}@igs-postgres:5432/igs`,
      worker,
      /IGS_APP_DATABASE_URL logs in as 'igs'/,
    ],
    [
      app,
      `postgres://igs:${SECRET}@igs-postgres/igs`,
      /IGS_WORKER_DATABASE_URL logs in as 'igs'/,
    ],
    [app, app, /the same user/],
    [
      `postgres://igs_app_login:${SECRET}@localhost:5432/igs`,
      worker,
      /host igs-postgres/,
    ],
    [
      "not-a-dsn",
      worker,
      /IGS_APP_DATABASE_URL is not a postgres:\/\/ connection string/,
    ],
  ];
  for (const [a, w, message] of failures) {
    const r = env(a, w);
    assert.notEqual(r.status, 0, String(message));
    assert.match(r.stderr, message);
    assert.ok(!r.stderr.includes(SECRET), "never prints a password");
  }
});

/** A fake checkout + stand-in docker/age that log their arguments. */
function fakeHost({ dockerScript = "", allow = "192.0.2.10/32" } = {}) {
  const root = mkdtempSync(path.join(scratch, "host-"));
  const bin = path.join(root, "bin");
  const calls = path.join(root, "calls.log");
  mkdirSync(bin);
  mkdirSync(path.join(root, ".age"));
  mkdirSync(path.join(root, "infra/igs"), { recursive: true });
  writeFileSync(path.join(root, ".age/key.txt"), "fake");
  writeFileSync(path.join(root, "infra/igs/.env.igs.age"), "fake");
  writeFileSync(
    path.join(root, "infra/igs/create-login-roles.sql"),
    readFileSync(path.join(repo, "infra/igs/create-login-roles.sql"))
  );
  const plain = [
    "IGS_POSTGRES_PASSWORD=p",
    "IGS_MIGRATOR_DATABASE_URL=postgres://igs:p@igs-postgres:5432/igs",
    "IGS_APP_DATABASE_URL=postgres://igs_app_login:a@igs-postgres:5432/igs",
    "IGS_WORKER_DATABASE_URL=postgres://igs_worker_login:w@igs-postgres:5432/igs",
    ...(allow === null ? [] : [`IGS_PLATFORM_ALLOW_IPS=${allow}`]),
    "AUTH_SECRET=x",
    "AUDIT_HMAC_KEY=x",
    "ENCRYPTION_KEY=x",
    "",
  ].join("\n");
  writeFileSync(
    path.join(bin, "age"),
    `#!/bin/sh\necho "age $*" >>"${calls}"\ncat <<'ENV'\n${plain}ENV\n`
  );
  writeFileSync(
    path.join(bin, "docker"),
    `#!/bin/sh\necho "docker $*" >>"${calls}"\n${dockerScript}\nexit 0\n`
  );
  for (const tool of ["age", "docker"]) chmodSync(path.join(bin, tool), 0o755);
  const run = (script, args, env = {}) =>
    spawnSync("bash", [script, ...args], {
      encoding: "utf8",
      env: {
        ...process.env,
        PATH: `${bin}:${process.env.PATH}`,
        REPO_DIR: root,
        ...env,
      },
    });
  const log = () => {
    try {
      return readFileSync(calls, "utf8");
    } catch {
      return "";
    }
  };
  return { root, run, log };
}

const SHA = "0123456789abcdef0123456789abcdef01234567";

test("igs-deploy.sh --migrate-only runs igs-migrate and leaves the apps alone (#841)", () => {
  const host = fakeHost();
  const r = host.run(DEPLOY, ["--migrate-only", SHA]);
  assert.equal(r.status, 0, r.stderr);
  const calls = host.log();
  assert.match(
    calls,
    /docker compose -p igs .* run --rm --no-deps igs-migrate\n/
  );
  assert.doesNotMatch(calls, /up -d --wait --no-deps igs-web/);
  assert.doesNotMatch(calls, /systemctl|edge-deploy-site/);
  assert.match(r.stdout, /Next: infra\/scripts\/igs-db-roles\.sh/);
});

// --- The open back-office (no IGS_PLATFORM_ALLOW_IPS) never runs code older than igs-pharma d4a1eb8 ---

/**
 * A fake host whose deploy stops at step 5: a stand-in edge-deploy-site.sh keeps the site file
 * it is given (published.caddy) and fails, so nothing past the publish runs (no systemctl).
 */
function publishingHost(options) {
  const host = fakeHost(options);
  writeFileSync(
    path.join(host.root, "infra/igs/igs-pharma.caddy.template"),
    readFileSync(TEMPLATE)
  );
  const edge = path.join(host.root, "edge");
  mkdirSync(path.join(edge, "caddy"), { recursive: true });
  writeFileSync(path.join(edge, "caddy/Caddyfile"), "# fake edge\n");
  const scripts = path.join(host.root, "infra/edge/scripts");
  mkdirSync(scripts, { recursive: true });
  writeFileSync(
    path.join(scripts, "edge-deploy-site.sh"),
    `#!/bin/sh\ncp "$2" "${path.join(host.root, "published.caddy")}"\nexit 3\n`
  );
  const deploy = () => host.run(DEPLOY, [SHA], { EDGE_DIR: edge });
  const published = () =>
    readFileSync(path.join(host.root, "published.caddy"), "utf8");
  return { ...host, deploy, published };
}

const GREP_CHECK = new RegExp(
  `docker run --rm --network none --entrypoint grep ghcr\\.io/alisafari-it/igs-pharma-platform:${SHA} -rqF -- `,
  "g"
);

for (const [label, allow] of [
  ["empty", ""],
  ["unset", null],
]) {
  test(`igs-deploy.sh with IGS_PLATFORM_ALLOW_IPS ${label}: checks the platform image, then publishes the open site`, () => {
    const host = publishingHost({ allow });
    const r = host.deploy();
    assert.equal(r.status, 3, "stops at the stand-in publish");
    const calls = host.log();
    // both hardening markers, in the platform image of exactly this SHA, before migrations
    assert.equal(calls.match(GREP_CHECK)?.length, 2, calls);
    assert.match(
      calls,
      /-rqF -- "STAFF_ONLY" \/app\/apps\/platform\/\.next\/server\n/
    );
    assert.match(
      calls,
      /-rqF -- "\/sign-in\/\*" \/app\/apps\/platform\/\.next\/server\n/
    );
    assert.ok(
      calls.search(GREP_CHECK) <
        calls.indexOf("run --rm --no-deps igs-migrate"),
      "checked before anything changes"
    );
    const site = host.published();
    assert.ok(!site.includes("{$IGS_PLATFORM_ALLOW_IPS}"), "no placeholder");
    assert.doesNotMatch(platformBlock(site), /remote_ip|403/);
    assert.match(
      site,
      /platform\.igs-pharma\.be \{\n\treverse_proxy igs-platform:3001\n\}/
    );
  });
}

test("igs-deploy.sh refuses the open back-office on a platform image without the hardening, changing nothing", () => {
  const host = publishingHost({
    allow: "",
    // the image has the first marker but not the second: an older build
    dockerScript:
      'case "$*" in *"--entrypoint grep"*"/sign-in/*"*) exit 1 ;; esac',
  });
  const r = host.deploy();
  assert.equal(r.status, 1);
  assert.match(r.stderr, /does not have the staff sign-in hardening/);
  assert.match(r.stderr, /igs-pharma d4a1eb8/);
  assert.match(r.stderr, /FATAL: nothing was changed/);
  const calls = host.log();
  assert.doesNotMatch(calls, /up -d|igs-migrate\n|edge-deploy-site/);
  assert.throws(() => host.published(), "nothing published");
});

test("igs-deploy.sh with an allowlist keeps today's behaviour: no image check, the 403 variant", () => {
  const host = publishingHost({ allow: "192.0.2.10/32, 2001:db8:1234::/64" });
  const r = host.deploy();
  assert.equal(r.status, 3, r.stderr);
  assert.doesNotMatch(host.log(), /--entrypoint grep/);
  const site = host.published();
  assert.match(
    site,
    /@igs_platform_allowed remote_ip 192\.0\.2\.10\/32 2001:db8:1234::\/64\n/
  );
  assert.match(site, /\n\t\t\tHTML 403\n/, "the branded 403 page");
});

test("igs-deploy.sh refuses an invalid allowlist without echoing it, before docker", () => {
  const host = publishingHost({ allow: "0.0.0.0/0" });
  const r = host.deploy();
  assert.equal(r.status, 1);
  assert.match(r.stderr, /A \/0 would allow everyone/);
  assert.ok(!r.stderr.includes("0.0.0.0/0"));
  assert.doesNotMatch(host.log(), /^docker /m);
});

test("igs-deploy.sh --migrate-only does not need the open-site image check", () => {
  const host = fakeHost({
    allow: "",
    dockerScript: 'case "$*" in *"--entrypoint grep"*) exit 1 ;; esac',
  });
  const r = host.run(DEPLOY, ["--migrate-only", SHA]);
  assert.equal(r.status, 0, r.stderr);
  assert.doesNotMatch(host.log(), /--entrypoint grep/);
});

test("the image check reads the platform image the compose file runs", () => {
  const compose = readFileSync(
    path.join(repo, "infra/igs/docker-compose.yml"),
    "utf8"
  );
  assert.match(
    compose,
    /image: ghcr\.io\/alisafari-it\/igs-pharma-platform:\$\{IGS_IMAGE_TAG:/
  );
  assert.match(
    readFileSync(LIB, "utf8"),
    /^IGS_PLATFORM_IMAGE="ghcr\.io\/alisafari-it\/igs-pharma-platform"$/m
  );
});

test("igs-deploy.sh refuses a runtime login that is the migrator, before docker (#841)", () => {
  const host = fakeHost();
  const env = path.join(host.root, "bin/age");
  writeFileSync(
    env,
    readFileSync(env, "utf8").replace(
      "postgres://igs_app_login:a@",
      "postgres://igs:a@"
    )
  );
  const r = host.run(DEPLOY, [SHA]);
  assert.equal(r.status, 1);
  assert.match(r.stderr, /IGS_APP_DATABASE_URL logs in as 'igs'/);
  assert.doesNotMatch(host.log(), /^docker /m);
});

test("igs-db-roles.sh runs the pinned SQL as the owner with the two login names, no password", () => {
  const host = fakeHost({
    dockerScript: [
      'case "$*" in',
      '  "compose -p igs ps -q igs-postgres") echo pg0123456789ab ;;',
      '  *"SELECT count(*) FROM pg_roles"*) echo 2 ;;',
      '  *"app_login=igs_app_login"*) cat >"$(dirname "$0")/../stdin.sql" ;;',
      "esac",
    ].join("\n"),
  });
  const r = host.run(path.join(repo, "infra/scripts/igs-db-roles.sh"), []);
  assert.equal(r.status, 0, r.stderr);
  assert.match(
    host.log(),
    /docker exec -i pg0123456789ab psql -X -q -U igs -d igs -v ON_ERROR_STOP=1 -v app_login=igs_app_login -v worker_login=igs_worker_login\n/
  );
  assert.equal(
    readFileSync(path.join(host.root, "stdin.sql"), "utf8"),
    readFileSync(path.join(repo, "infra/igs/create-login-roles.sql"), "utf8")
  );
  assert.match(r.stdout, /\\password igs_app_login/);
  assert.doesNotMatch(host.log(), /PASSWORD '/i);
});

test("igs-db-roles.sh stops when the groups don't exist yet", () => {
  const host = fakeHost({
    dockerScript: [
      'case "$*" in',
      '  "compose -p igs ps -q igs-postgres") echo pg0123456789ab ;;',
      '  *"SELECT count(*) FROM pg_roles"*) echo 0 ;;',
      "esac",
    ].join("\n"),
  });
  const r = host.run(path.join(repo, "infra/scripts/igs-db-roles.sh"), []);
  assert.equal(r.status, 1);
  assert.match(r.stderr, /--migrate-only/);
  assert.doesNotMatch(host.log(), /app_login=/);
});

test("the pinned create-login-roles.sql names its igs-pharma commit", () => {
  assert.match(
    readFileSync(path.join(repo, "infra/igs/create-login-roles.sql"), "utf8"),
    /^-- Pinned copy of igs-pharma infra\/db\/create-login-roles\.sql at [0-9a-f]{40}\b/
  );
});

test("igs-cli.sh runs a CLI in igs-migrate on the running worker's image, not in the worker (#841)", () => {
  const dockerScript = [
    'case "$*" in',
    '  "compose -p igs ps -q igs-worker") echo wk0123456789ab ;;',
    `  "inspect -f {{.Config.Image}} wk0123456789ab") echo ghcr.io/alisafari-it/igs-pharma-worker:${SHA} ;;`,
    '  *" run "*) echo "IGS_IMAGE_TAG=$IGS_IMAGE_TAG" >>"$(dirname "$0")/../calls.log" ;;',
    "esac",
  ].join("\n");
  const host = fakeHost({ dockerScript });
  const r = host.run(path.join(repo, "infra/scripts/igs-cli.sh"), [
    "bootstrap-owner",
    "--email",
    "owner@example.test",
    "--reissue",
  ]);
  assert.equal(r.status, 0, r.stderr);
  const calls = host.log();
  assert.match(
    calls,
    /run --rm --no-deps -T igs-migrate node dist\/bootstrap-owner\.js --email owner@example\.test --reissue\n/
  );
  assert.match(calls, new RegExp(`IGS_IMAGE_TAG=${SHA}`));
  assert.doesNotMatch(calls, /docker exec/);

  const seed = fakeHost({ dockerScript });
  const s = seed.run(
    path.join(repo, "infra/scripts/igs-cli.sh"),
    ["seed-catalog"],
    {
      IGS_ALLOW_SYNTHETIC_SEED: "1",
    }
  );
  assert.equal(s.status, 0, s.stderr);
  assert.match(
    seed.log(),
    /run --rm --no-deps -T -e IGS_ALLOW_SYNTHETIC_SEED=1 igs-migrate node dist\/seed-catalog\.js\n/
  );

  const bad = fakeHost({ dockerScript });
  const b = bad.run(path.join(repo, "infra/scripts/igs-cli.sh"), ["migrate"]);
  assert.equal(b.status, 2);
  assert.equal(bad.log(), "");
});
