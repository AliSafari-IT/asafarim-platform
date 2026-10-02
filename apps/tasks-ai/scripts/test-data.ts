/**
 * TasksAI synthetic test data for Testora's TasksAI catalog (#742 slice 2b).
 * Separate from prisma/seed.ts and never run by a Testora catalog update.
 *
 *   pnpm --filter @asafarim/tasks-ai test-data -- <command> [options]
 *
 * Commands
 *   setup        create the synthetic workspaces if missing (re-running is a no-op)
 *   reset        cleanup + setup (re-anchors dates to today)
 *   verify       read-only: does the database hold what setup promises?
 *   cleanup      delete every synthetic workspace and every row scoped to one
 *   prune-runs   delete records a Testora run created ("[run:<id>] …" titles)
 *                  --run=<id>               one run only
 *                  --older-than-hours=<n>   abandoned runs only
 *
 * Options
 *   --env=<label>              output/input file label (default "local")
 *   --identities=<path>        default: <repo>/.tasksai-test/identities.<env>.json,
 *                              written by `pnpm --filter @asafarim/db db:seed:tasksai-identities`
 *   --confirm-host=<host>      required when TASKSAI_DATABASE_URL is not the local dev database
 *   --mark-database=<development|test>  one-time: mark this database (only where the
 *                              URL/machine checks already agree) so the script can prove it isn't production
 *   --allow-production-baseline  OWNER ONLY, production database: the read-only
 *                                remote-smoke baseline (main workspace, member only)
 *   --anchor=YYYY-MM-DD  --tz=<IANA zone>   the controlled clock (default today, Europe/Brussels)
 *
 * Writes <repo>/.tasksai-test/test-data.<env>.json (ids/handles, no secrets).
 */
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { hostname } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "../lib/db/generated";
import { checkDatabaseMarker, parseDatabaseMarker, testDataGuard } from "../lib/test-data/guard";
import { HANDOFF_FILE_SUFFIX } from "@asafarim/tool-handoff";
import {
  DEFAULT_TIMEZONE,
  IDENTITY_KEYS,
  PRODUCTION_BASELINE_IDENTITIES,
  SAMPLE_FILES,
  buildHandoffSamples,
  type IdentityKey,
} from "../lib/test-data/plan";
import { cleanupTestData, pruneRunData, setupTestData, verifyTestData, type IdentityMap } from "../lib/test-data/provision";

const here = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(here, "../../..");
const OUT_DIR = path.join(REPO_ROOT, ".tasksai-test");
const SAMPLES_DIR = path.join(here, "test-data", "samples");

const arg = (name: string) => process.argv.find((a) => a.startsWith(`--${name}=`))?.split("=").slice(1).join("=");
const flag = (name: string) => process.argv.includes(`--${name}`);
const COMMANDS = ["setup", "reset", "verify", "cleanup", "prune-runs"] as const;

function readIdentities(file: string, needed: readonly IdentityKey[]): IdentityMap {
  if (!existsSync(file)) {
    throw new Error(`Identities file not found: ${file}\nCreate the accounts first: pnpm --filter @asafarim/db db:seed:tasksai-identities`);
  }
  const parsed = JSON.parse(readFileSync(file, "utf8")) as { identities?: Record<string, { platformUserId?: string }> };
  const map: IdentityMap = {};
  for (const key of IDENTITY_KEYS) {
    const id = parsed.identities?.[key]?.platformUserId;
    if (id) map[key] = id;
  }
  const missing = needed.filter((k) => !map[k]);
  if (missing.length) throw new Error(`Identities file lacks: ${missing.join(", ")}`);
  return map;
}

async function main() {
  const command = process.argv.slice(2).find((a) => !a.startsWith("--")) as (typeof COMMANDS)[number] | undefined;
  if (!command || !COMMANDS.includes(command)) {
    console.error(`Usage: test-data <${COMMANDS.join("|")}> [options] — see scripts/test-data.ts`);
    process.exit(64);
  }
  // Default: the docker-compose.yml development database (host port 55438).
  const rawUrl = process.env.TASKSAI_DATABASE_URL ?? "postgres://tasksai:tasksai_dev@127.0.0.1:55438/tasksai";
  const decision = testDataGuard({
    rawDatabaseUrl: rawUrl,
    platformDatabaseUrl: process.env.DATABASE_URL,
    nodeEnv: process.env.NODE_ENV,
    allowProductionBaseline: flag("allow-production-baseline"),
    confirmHost: arg("confirm-host"),
    machineHostname: hostname(),
    cwd: process.cwd(),
  });
  if (!decision.ok) {
    console.error(`Refused: ${decision.reason}`);
    process.exit(2);
  }
  const env = decision.mode === "production-baseline" ? "production" : (arg("env") ?? "local");
  if (!/^[a-z0-9-]+$/.test(env)) throw new Error("--env must be lowercase letters, digits and hyphens.");

  const db = new PrismaClient({ adapter: new PrismaPg({ connectionString: rawUrl }) });
  try {
    // Signal 3: the database itself must agree before anything is written.
    const comment = await db.$queryRaw<{ comment: string | null }[]>`
      SELECT shobj_description(d.oid, 'pg_database') AS comment FROM pg_database d WHERE d.datname = current_database()`;
    const markArg = arg("mark-database");
    if (markArg) {
      const environment = decision.environment;
      if (environment === "production" || markArg !== environment) {
        throw new Error(`--mark-database=${markArg} refused: the URL/machine checks say this is "${environment}".`);
      }
      const [{ db: name }] = await db.$queryRaw<{ db: string }[]>`SELECT current_database() AS db`;
      await db.$executeRawUnsafe(`COMMENT ON DATABASE "${name.replace(/"/g, '""')}" IS 'asafarim-env=${environment}'`);
      console.log(`Marked this database as "${environment}" (COMMENT ON DATABASE). Re-run without --mark-database.`);
      return;
    }
    const marker = checkDatabaseMarker(decision.environment, parseDatabaseMarker(comment[0]?.comment));
    if (!marker.ok) {
      console.error(`Refused: ${marker.reason}`);
      process.exitCode = 2;
      return;
    }

    if (command === "cleanup" || command === "reset") {
      const removed = await cleanupTestData(db);
      console.log(`cleanup: removed ${removed.workspaces.length} synthetic workspace(s)${removed.workspaces.length ? ` (${removed.workspaces.join(", ")})` : ""}`);
      if (command === "cleanup") return;
    }
    if (command === "prune-runs") {
      const olderThan = arg("older-than-hours");
      const pruned = await pruneRunData(db, { runId: arg("run"), olderThanHours: olderThan ? Number(olderThan) : undefined });
      console.log(`prune-runs: ${JSON.stringify(pruned)}`);
      return;
    }
    if (command === "verify") {
      const report = await verifyTestData(db, decision.mode);
      for (const c of report.checks) console.log(`${c.ok ? "ok  " : "FAIL"} ${c.name.padEnd(28)} ${c.detail}`);
      const samples = SAMPLE_FILES.filter((f) => !existsSync(path.join(SAMPLES_DIR, f)));
      console.log(`${samples.length ? "FAIL" : "ok  "} ${"samples".padEnd(28)} ${samples.length ? `missing ${samples.join(", ")}` : `${SAMPLE_FILES.length} files`}`);
      if (!report.ok || samples.length) process.exit(1);
      return;
    }

    // setup (or the second half of reset)
    const needed = decision.mode === "production-baseline" ? PRODUCTION_BASELINE_IDENTITIES : IDENTITY_KEYS.filter((k) => k !== "outsider");
    const identities = readIdentities(arg("identities") ?? path.join(OUT_DIR, `identities.${env}.json`), needed);
    const anchorArg = arg("anchor");
    const result = await setupTestData(db, {
      mode: decision.mode,
      identities,
      anchor: anchorArg ? new Date(`${anchorArg}T12:00:00.000Z`) : undefined,
      timeZone: arg("tz") ?? DEFAULT_TIMEZONE,
    });
    for (const [key, ws] of Object.entries(result.workspaces)) {
      console.log(`${ws.created ? "created" : "present"}  ${key.padEnd(10)} ${ws.slug}`);
    }
    mkdirSync(OUT_DIR, { recursive: true });
    // Fresh handoff samples every setup (handoffs expire): the original and its exact duplicate.
    const { handoff, duplicate } = buildHandoffSamples(new Date());
    for (const [name, envelope] of [["handoff", handoff], ["handoff-duplicate", duplicate]] as const) {
      writeFileSync(path.join(OUT_DIR, `${name}.${env}${HANDOFF_FILE_SUFFIX}`), JSON.stringify(envelope, null, 2) + "\n");
    }
    console.log(`Handoff samples (expire ${handoff.expiresAt}) → ${OUT_DIR}`);
    const outFile = path.join(OUT_DIR, `test-data.${env}.json`);
    // On a no-op run keep the earlier handles (they are still valid).
    const previous = existsSync(outFile) ? JSON.parse(readFileSync(outFile, "utf8")) : {};
    const anyCreated = Object.values(result.workspaces).some((w) => w.created);
    writeFileSync(outFile, JSON.stringify(anyCreated ? { mode: decision.mode, ...result } : { ...previous, workspaces: result.workspaces }, null, 2) + "\n");
    console.log(`${anyCreated ? "Handles" : "No changes; handles kept"} → ${outFile}`);
  } finally {
    await db.$disconnect();
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
