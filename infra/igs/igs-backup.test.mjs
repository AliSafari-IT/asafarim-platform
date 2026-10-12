// igs-pharma.be staging backups (#829): infra/scripts/igs-backup.sh and
// infra/scripts/igs-restore-drill.sh.
//
// - Pure checks: retention selection, the backup keys, object names, the apps'
//   env filter.
// - End to end (needs Docker and age): a real Postgres with labels like the igs
//   stack's, a fake S3 client (a docker shim stands in for the aws-cli image and
//   keeps objects in a folder), a real pg_dump | age | upload, retention, the
//   failure path (partial object deleted, Discord alert), and the restore drill
//   into a throwaway Postgres.
//
// CI: .github/workflows/edge.yml.   node --test infra/igs/igs-backup.test.mjs
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { randomBytes } from "node:crypto";
import {
  chmodSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  readdirSync,
  rmSync,
  statSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { after, before, describe, test } from "node:test";

const repo = path.resolve(import.meta.dirname, "../..");
const BACKUP = path.join(repo, "infra/scripts/igs-backup.sh");
const DRILL = path.join(repo, "infra/scripts/igs-restore-drill.sh");
const LIB = path.join(repo, "infra/scripts/lib/igs.sh");
const scratch = mkdtempSync(path.join(tmpdir(), "igs-backup-"));
after(() => rmSync(scratch, { recursive: true, force: true }));

/** Run `<fn> args...` with igs-backup.sh sourced; `input` goes to stdin. */
function fn(name, args = [], input = "") {
  // $0 is not the script, so its main doesn't run when it is sourced.
  return spawnSync(
    "bash",
    ["-c", `source "$1" && shift && ${name} "$@"`, "test", BACKUP, ...args],
    { encoding: "utf8", input }
  );
}

const RECIPIENT = "age1" + "q".repeat(58);
function envFile(values) {
  const file = path.join(scratch, `env-${randomBytes(3).toString("hex")}`);
  writeFileSync(
    file,
    Object.entries(values)
      .map(([k, v]) => `${k}=${v}`)
      .join("\n") + "\n"
  );
  return file;
}
const FULL = {
  IGS_BACKUP_S3_ENDPOINT: "https://fra1.digitaloceanspaces.com",
  IGS_BACKUP_S3_REGION: "fra1",
  IGS_BACKUP_S3_BUCKET: "igs-backups",
  IGS_BACKUP_S3_ACCESS_KEY: "test-access",
  IGS_BACKUP_S3_SECRET_KEY: "test-secret",
  IGS_BACKUP_AGE_RECIPIENT: RECIPIENT,
};

describe("retention", () => {
  const today = "2026-10-11";
  const keys = [
    "igs/2026/10/igs-20261011T003000Z.dump.age", // today
    "igs/2026/09/igs-20260928T003000Z.dump.age", // 13 days ago: the 14th day, kept
    "igs/2026/09/igs-20260927T003000Z.dump.age", // 14 days ago, not September's first
    "igs/2026/09/igs-20260901T003000Z.dump.age", // September's first
    "igs/2026/05/igs-20260502T003000Z.dump.age", // May's first, 5 months back: kept
    "igs/2026/05/igs-20260503T003000Z.dump.age", // May, not the first
    "igs/2026/04/igs-20260401T003000Z.dump.age", // April's first, 6 months back: gone
    "igs/notes.txt", // not a backup: never touched
    "igs/2026/10/other.dump",
  ];

  test("keeps the last 14 days and the first dump of each of the last 6 months", () => {
    const r = fn(
      "igs_backup_expired",
      [today],
      [...keys].reverse().join("\n") + "\n"
    );
    assert.equal(r.status, 0, r.stderr);
    assert.deepEqual(r.stdout.trim().split("\n"), [
      "igs/2026/04/igs-20260401T003000Z.dump.age",
      "igs/2026/05/igs-20260503T003000Z.dump.age",
      "igs/2026/09/igs-20260927T003000Z.dump.age",
    ]);
  });

  test("deletes nothing when every dump is recent, and handles an empty bucket", () => {
    assert.equal(
      fn("igs_backup_expired", [today], keys.slice(0, 2).join("\n")).stdout,
      ""
    );
    const r = fn("igs_backup_expired", [today], "");
    assert.equal(r.status, 0, r.stderr);
    assert.equal(r.stdout, "");
  });

  test("the first dump of a month is the earliest one, whatever the listing order", () => {
    const r = fn(
      "igs_backup_expired",
      ["2026-12-20"],
      [
        "igs/2026/11/igs-20261130T003000Z.dump.age",
        "igs/2026/11/igs-20261102T003000Z.dump.age",
        "igs/2026/11/igs-20261115T003000Z.dump.age",
      ].join("\n")
    );
    assert.deepEqual(r.stdout.trim().split("\n"), [
      "igs/2026/11/igs-20261115T003000Z.dump.age",
      "igs/2026/11/igs-20261130T003000Z.dump.age",
    ]);
  });
});

describe("configuration", () => {
  test("object keys are igs/YYYY/MM/igs-<stamp>.dump.age", () => {
    assert.equal(
      fn("igs_backup_object_key", ["20261011T003012Z"]).stdout,
      "igs/2026/10/igs-20261011T003012Z.dump.age"
    );
  });

  test("all six backup keys must be set, with a URL endpoint and an age1 recipient", () => {
    assert.equal(fn("igs_backup_unset_keys", [envFile(FULL)]).stdout, "");
    const r = fn("igs_backup_unset_keys", [
      envFile({
        ...FULL,
        IGS_BACKUP_S3_BUCKET: "CHANGE_ME",
        IGS_BACKUP_S3_ENDPOINT: "fra1",
        IGS_BACKUP_AGE_RECIPIENT: "AGE-SECRET-KEY-1X",
      }),
    ]);
    assert.deepEqual(r.stdout.trim().split("\n").sort(), [
      "IGS_BACKUP_AGE_RECIPIENT",
      "IGS_BACKUP_S3_BUCKET",
      "IGS_BACKUP_S3_ENDPOINT",
    ]);
    const { IGS_BACKUP_S3_SECRET_KEY, ...noSecret } = FULL;
    assert.equal(
      fn("igs_backup_unset_keys", [envFile(noSecret)]).stdout.trim(),
      "IGS_BACKUP_S3_SECRET_KEY"
    );
  });

  test("--check exits 3 and names the missing keys (never values) when backups are not configured", () => {
    const r = spawnSync("bash", [BACKUP, "--check"], {
      encoding: "utf8",
      env: {
        ...process.env,
        IGS_BACKUP_ENV_FILE: envFile({
          ...FULL,
          IGS_BACKUP_S3_ACCESS_KEY: "CHANGE_ME",
        }),
      },
    });
    assert.equal(r.status, 3);
    assert.match(r.stderr, /IGS_BACKUP_S3_ACCESS_KEY/);
    assert.ok(!r.stderr.includes("test-secret"));
    const ok = spawnSync("bash", [BACKUP, "--check"], {
      encoding: "utf8",
      env: { ...process.env, IGS_BACKUP_ENV_FILE: envFile(FULL) },
    });
    assert.equal(ok.status, 0, ok.stderr);
  });

  test("the backup keys never reach the apps (igs_app_env drops every IGS_* key)", () => {
    const full = envFile({
      ...FULL,
      DATABASE_URL: "postgres://app",
      AUTH_SECRET: "s",
    });
    const out = path.join(scratch, "apps.env");
    const r = spawnSync(
      "bash",
      ["-c", 'source "$0" && igs_app_env "$1" "$2"', LIB, full, out],
      { encoding: "utf8" }
    );
    assert.equal(r.status, 0, r.stderr);
    const text = readFileSync(out, "utf8");
    assert.ok(!/IGS_BACKUP|test-secret|age1/.test(text), text);
    assert.match(text, /^DATABASE_URL=/m);
  });
});

const hasDocker =
  spawnSync("docker", ["info"], { stdio: "ignore" }).status === 0;
const hasAge =
  spawnSync("age", ["--version"], { stdio: "ignore" }).status === 0;

describe(
  "end to end: backup, retention, failure, restore drill",
  { skip: !(hasDocker && hasAge) && "needs Docker and age" },
  () => {
    const id = randomBytes(4).toString("hex");
    const PG = `igs-backup-test-pg-${id}`;
    const S3 = path.join(scratch, "bucket-root");
    const BIN = path.join(scratch, "bin");
    const CALLS = path.join(scratch, "aws-calls.log");
    const CURL = path.join(scratch, "curl.log");
    const AWS_IMAGE = "fake/aws-cli:test";
    let identity, env, envPath;

    before(() => {
      mkdirSync(BIN, { recursive: true });
      mkdirSync(S3, { recursive: true });
      const realDocker = spawnSync("bash", ["-c", "command -v docker"], {
        encoding: "utf8",
      }).stdout.trim();
      // docker: the aws-cli image is emulated on a folder; everything else is real
      // Docker (FAIL_PGDUMP makes pg_dump fail half-way).
      writeFileSync(
        path.join(BIN, "docker"),
        `#!/usr/bin/env bash
if [[ " $* " == *" ${AWS_IMAGE} "* ]]; then
  echo "$*" >>"${CALLS}"
  while [[ "$1" != "${AWS_IMAGE}" ]]; do
    if [[ "$1" == -v ]]; then cat "\${2%%:*}/config" >>"${CALLS}"; fi
    shift
  done
  shift 3 # image, --endpoint-url, endpoint
  root="${S3}"
  arg() { local want="$1"; shift; while (($#)); do [[ "$1" == "$want" ]] && { echo "$2"; return; }; shift; done; }
  case "$1 $2" in
    "s3 cp")
      if [[ "$3" == - ]]; then f="$root/\${4#s3://}"; mkdir -p "\$(dirname "$f")"; cat >"$f"
      else cat "$root/\${3#s3://}"; fi ;;
    "s3 rm") rm -f "$root/\${3#s3://}" ;;
    "s3api head-object") f="$root/$(arg --bucket "$@")/$(arg --key "$@")"; [[ -f "$f" ]] || exit 254; stat -c %s "$f" ;;
    "s3api list-objects-v2")
      b="$root/$(arg --bucket "$@")"
      keys="\$(cd "$b" 2>/dev/null && find igs -type f 2>/dev/null | sort | paste -sd $'\\t')"
      echo "\${keys:-None}" ;;
    *) echo "fake aws: unsupported $*" >&2; exit 2 ;;
  esac
  exit 0
fi
if [[ -n "\${FAIL_PGDUMP:-}" && " $* " == *" pg_dump "* ]]; then printf 'PGDMP-partial'; exit 1; fi
exec "${realDocker}" "$@"
`
      );
      writeFileSync(
        path.join(BIN, "curl"),
        `#!/usr/bin/env bash\n{ echo "ARGS $*"; cat; echo; } >>"${CURL}"\n`
      );
      for (const f of ["docker", "curl"]) chmodSync(path.join(BIN, f), 0o755);

      const keygen = spawnSync("age-keygen", [], { encoding: "utf8" });
      identity = keygen.stdout;
      const recipient = /public key: (age1\w+)/.exec(
        keygen.stdout + keygen.stderr
      )[1];
      envPath = envFile({
        ...FULL,
        IGS_BACKUP_S3_ENDPOINT: "https://s3.example.test",
        IGS_BACKUP_AGE_RECIPIENT: recipient,
        IGS_ALERT_WEBHOOK_DISCORD:
          "https://discord.com/api/webhooks/123/test-token",
      });
      env = {
        ...process.env,
        PATH: `${BIN}:${process.env.PATH}`,
        IGS_S3_IMAGE: AWS_IMAGE,
        IGS_BACKUP_ENV_FILE: envPath,
      };

      // A Postgres the backup finds the way it finds igs-postgres, with some data.
      const run = spawnSync(
        "docker",
        [
          "run",
          "-d",
          "--name",
          PG,
          "--label",
          "com.docker.compose.project=igs",
          "--label",
          "com.docker.compose.service=igs-postgres",
          "-e",
          "POSTGRES_USER=igs",
          "-e",
          "POSTGRES_DB=igs",
          "-e",
          "POSTGRES_PASSWORD=test",
          "postgres:16-alpine",
        ],
        { encoding: "utf8" }
      );
      assert.equal(run.status, 0, run.stderr);
      for (let i = 0; i < 60; i++) {
        if (
          spawnSync("docker", [
            "exec",
            PG,
            "pg_isready",
            "-h",
            "127.0.0.1",
            "-U",
            "igs",
            "-d",
            "igs",
          ]).status === 0
        )
          break;
        spawnSync("sleep", ["1"]);
      }
      const seed = spawnSync(
        "docker",
        [
          "exec",
          PG,
          "psql",
          "-U",
          "igs",
          "-d",
          "igs",
          "-v",
          "ON_ERROR_STOP=1",
          "-c",
          `
      CREATE SCHEMA drizzle;
      CREATE TABLE drizzle.__drizzle_migrations (id serial PRIMARY KEY, hash text NOT NULL);
      INSERT INTO drizzle.__drizzle_migrations (hash) VALUES ('a'), ('b'), ('c');
      CREATE TABLE products (id serial PRIMARY KEY, name text NOT NULL);
      INSERT INTO products (name) SELECT 'product ' || g FROM generate_series(1, 5) g;`,
        ],
        { encoding: "utf8" }
      );
      assert.equal(seed.status, 0, seed.stderr);
    });

    after(() => {
      spawnSync("docker", ["rm", "-f", PG]);
    });

    const bucketKeys = () => {
      const b = path.join(S3, "igs-backups");
      if (!existsSync(b)) return [];
      const out = [];
      const walk = (d) =>
        readdirSync(d, { withFileTypes: true }).forEach((e) =>
          e.isDirectory()
            ? walk(path.join(d, e.name))
            : out.push(path.relative(b, path.join(d, e.name)))
        );
      walk(b);
      return out.sort();
    };
    const put = (key, body = "old") => {
      const f = path.join(S3, "igs-backups", key);
      mkdirSync(path.dirname(f), { recursive: true });
      writeFileSync(f, body);
    };
    const stamp = (daysAgo) => {
      const d = new Date(Date.now() - daysAgo * 86400000);
      const s = d.toISOString().replace(/[-:]/g, "").slice(0, 15) + "Z";
      return `igs/${s.slice(0, 4)}/${s.slice(4, 6)}/igs-${s}.dump.age`;
    };

    test("a backup uploads an age-encrypted pg_dump, verifies it, and applies retention", () => {
      const old = stamp(400); // older than 6 months: deleted
      const recent = stamp(3); // within 14 days: kept
      put(old);
      put(recent);
      put("igs/README.txt", "not a backup");

      const r = spawnSync("bash", [BACKUP], { encoding: "utf8", env });
      assert.equal(r.status, 0, r.stdout + r.stderr);
      assert.match(
        r.stdout,
        /uploaded igs\/\d{4}\/\d{2}\/igs-\d{8}T\d{6}Z\.dump\.age: \d+ bytes in \d+s/
      );
      assert.match(
        r.stdout,
        new RegExp(`retention: deleted ${old.replace(/[.]/g, "\\.")}`)
      );

      const keys = bucketKeys();
      assert.ok(!keys.includes(old));
      assert.ok(keys.includes(recent) && keys.includes("igs/README.txt"));
      const fresh = keys.filter((k) => /\.dump\.age$/.test(k) && k !== recent);
      assert.equal(fresh.length, 1, keys.join(", "));

      // Encrypted at rest: not a pg_dump on its own, a valid one once decrypted.
      const object = path.join(S3, "igs-backups", fresh[0]);
      assert.match(
        readFileSync(object, "latin1").slice(0, 40),
        /^age-encryption\.org\/v1/
      );
      const idFile = path.join(scratch, "id.txt");
      writeFileSync(idFile, identity, { mode: 0o600 });
      const plain = spawnSync("age", ["-d", "-i", idFile, object]);
      assert.equal(plain.status, 0, String(plain.stderr));
      assert.equal(plain.stdout.subarray(0, 5).toString(), "PGDMP");

      // Path-style addressing, and credentials passed by name only.
      const calls = readFileSync(CALLS, "utf8");
      assert.match(calls, /addressing_style = path/);
      assert.match(calls, /-e AWS_SECRET_ACCESS_KEY /);
      assert.ok(
        !calls.includes("test-secret"),
        "the secret never appears on a command line"
      );
      assert.ok(
        !r.stdout.includes("test-secret") && !r.stderr.includes("test-secret")
      );
      assert.equal(existsSync(CURL), false, "success alerts nothing");
    });

    test("a failed pg_dump deletes the partial object and alerts Discord", () => {
      const before = bucketKeys();
      const r = spawnSync("bash", [BACKUP], {
        encoding: "utf8",
        env: { ...env, FAIL_PGDUMP: "1" },
      });
      assert.equal(r.status, 1);
      assert.match(
        r.stdout,
        /FAILED: dump or upload failed \(pg_dump 1, age 0, upload 0\); the partial object was deleted/
      );
      assert.deepEqual(bucketKeys(), before);
      const curl = readFileSync(CURL, "utf8");
      assert.match(curl, /backup failed/);
      assert.ok(
        !r.stdout.includes("test-token"),
        "the webhook URL is never printed"
      );
    });

    test("the restore drill restores the newest backup into a throwaway Postgres", () => {
      const r = spawnSync("bash", [DRILL, "-i", "-", "--env", envPath], {
        encoding: "utf8",
        env,
        input: identity,
      });
      assert.equal(r.status, 0, r.stdout + r.stderr);
      assert.match(r.stdout, /restored 2 tables/);
      assert.match(r.stdout, /public\.products\t5/);
      assert.match(r.stdout, /applied Drizzle migrations in the backup: 3/);
      assert.match(
        r.stdout,
        /timing: download \+ decrypt \+ restore \d+s, total \d+s/
      );
      const left = spawnSync(
        "docker",
        ["ps", "-aq", "--filter", "name=igs-restore-drill"],
        { encoding: "utf8" }
      );
      assert.equal(
        left.stdout.trim(),
        "",
        "the throwaway container is removed"
      );
      assert.ok(!r.stdout.includes("AGE-SECRET-KEY"));
    });

    test("the restore drill refuses a wrong key and still cleans up", () => {
      const wrong = spawnSync("age-keygen", [], { encoding: "utf8" }).stdout;
      const r = spawnSync("bash", [DRILL, "-i", "-", "--env", envPath], {
        encoding: "utf8",
        env,
        input: wrong,
      });
      assert.equal(r.status, 1);
      assert.match(r.stderr, /decrypt [1-9]/);
      const left = spawnSync(
        "docker",
        ["ps", "-aq", "--filter", "name=igs-restore-drill"],
        { encoding: "utf8" }
      );
      assert.equal(left.stdout.trim(), "");
    });
  }
);

test("a backup failure whose Discord alert is rejected logs that and still exits 1 (#835)", () => {
  const bin = mkdtempSync(path.join(scratch, "bin-"));
  const posts = path.join(bin, "posts.log");
  // Discord answers 429: like real curl, only --fail turns that into exit 22.
  writeFileSync(
    path.join(bin, "curl"),
    `#!/usr/bin/env bash\n{ echo "ARGS $*"; cat; echo; } >>"${posts}"\n[[ " $* " == *" --fail "* ]] && exit 22\nexit 0\n`
  );
  chmodSync(path.join(bin, "curl"), 0o755);
  const env = envFile({
    IGS_ALERT_WEBHOOK_DISCORD:
      "https://discord.com/api/webhooks/123/test-token",
  });
  const r = spawnSync(
    "bash",
    [
      "-c",
      `source "$1" && IGS_BACKUP_ENV_FILE="$2" igs_backup_fail "pg_dump broke"`,
      "test",
      BACKUP,
      env,
    ],
    {
      encoding: "utf8",
      env: { ...process.env, PATH: `${bin}:${process.env.PATH}` },
    }
  );
  assert.equal(r.status, 1, r.stderr);
  assert.match(r.stdout, /FAILED: pg_dump broke/);
  assert.match(r.stdout, /could not post the failure to Discord/);
  assert.match(readFileSync(posts, "utf8"), /backup failed: pg_dump broke/);
  assert.ok(
    !(r.stdout + r.stderr).includes("test-token"),
    "the webhook URL is never printed"
  );
});

test("the timer runs nightly at 02:30 Brussels time and the deploy installs it only when configured", () => {
  const timer = readFileSync(
    path.join(repo, "infra/igs/igs-backup.timer"),
    "utf8"
  );
  assert.match(timer, /^OnCalendar=\*-\*-\* 02:30:00 Europe\/Brussels$/m);
  assert.match(timer, /^Persistent=true$/m);
  const service = readFileSync(
    path.join(repo, "infra/igs/igs-backup.service"),
    "utf8"
  );
  assert.match(service, /^ExecStart=\/usr\/local\/sbin\/igs-backup$/m);
  const deploy = readFileSync(
    path.join(repo, "infra/scripts/igs-deploy.sh"),
    "utf8"
  );
  assert.match(
    deploy,
    /igs-backup\.sh --check; then\n\s+as_root systemctl enable --now --quiet igs-backup\.timer/
  );
  assert.match(deploy, /systemctl disable --now --quiet igs-backup\.timer/);
  assert.ok(
    statSync(path.join(repo, "infra/scripts/igs-backup.sh")).mode & 0o100,
    "igs-backup.sh is executable"
  );
});
