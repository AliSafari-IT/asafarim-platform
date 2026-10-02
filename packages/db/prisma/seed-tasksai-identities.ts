// TasksAI test identities CLI (#742 slice 2a).
//
// Creates the synthetic Hub accounts Testora's TasksAI catalog signs in as
// (definitions and logic: @asafarim/seed-manager, providers/tasksai-identities).
//
// Usage (repo root .env.local / .env supply DATABASE_URL):
//   pnpm --filter @asafarim/db db:seed:tasksai-identities                # ensure; set passwords where missing
//   pnpm --filter @asafarim/db db:seed:tasksai-identities -- --rotate    # new passwords for all
//   pnpm --filter @asafarim/db db:seed:tasksai-identities -- --remove    # delete the synthetic accounts
// Options:
//   --env=<label>            names the output files (default "local"; e.g. "remote-test")
//   --confirm-host=<host>    required when DATABASE_URL is not local
//   --allow-production-baseline   OWNER ONLY: on the production database, create
//                                 just the remote-smoke member account
//
// Output (git-ignored, repo root .tasksai-test/):
//   identities.<env>.json          opaque platform user ids + emails + secret NAMES.
//                                  apps/tasks-ai/scripts/test-data.ts reads this.
//   credentials.<env>.json         passwords set on this run (mode 600). Copy each
//                                  into the matching Testora target secret, then
//                                  delete the file. Nothing else stores them.

import { randomBytes } from "node:crypto";
import { chmodSync, existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import {
  ensureTasksaiIdentities,
  removeTasksaiIdentities,
  tasksaiIdentitiesGuard,
  tasksaiIdentitySecretNames,
  validateTasksaiIdentityDefinitions,
  withPrisma,
} from "@asafarim/seed-manager";

import { resolveCliDatabaseUrl } from "./seed-cli-env";

const arg = (name: string) => process.argv.find((a) => a.startsWith(`--${name}=`))?.split("=").slice(1).join("=");
const flag = (name: string) => process.argv.includes(`--${name}`);

const OUT_DIR = path.resolve(process.cwd(), "../../.tasksai-test");

function generatePassword(): string {
  // 24 random bytes → 32 url-safe chars; satisfies any password policy.
  return randomBytes(24).toString("base64url");
}

async function main() {
  const errors = validateTasksaiIdentityDefinitions().filter((i) => i.severity === "error");
  if (errors.length) {
    for (const issue of errors) console.error(`[${issue.code}] ${issue.message}`);
    throw new Error("TasksAI identity definitions are invalid — refusing to run.");
  }

  const decision = tasksaiIdentitiesGuard({
    rawDatabaseUrl: process.env.DATABASE_URL ?? "postgresql://asafarim:asafarim_dev@localhost:5432/asafarim",
    nodeEnv: process.env.NODE_ENV,
    allowProductionBaseline: flag("allow-production-baseline"),
    confirmHost: arg("confirm-host"),
  });
  if (!decision.ok) {
    console.error(`Refused: ${decision.reason}`);
    process.exit(2);
  }
  const env = decision.production ? "production" : (arg("env") ?? "local");
  if (!/^[a-z0-9-]+$/.test(env)) throw new Error("--env must be lowercase letters, digits and hyphens.");

  await withPrisma(resolveCliDatabaseUrl(), async (prisma) => {
    if (flag("remove")) {
      const { deleted, retained } = await removeTasksaiIdentities(prisma, { identities: decision.identities });
      console.log(`Removed ${deleted.length} synthetic account(s)${deleted.length ? `: ${deleted.join(", ")}` : ""}.`);
      for (const r of retained) console.log(`Retained ${r.key}: ${r.reason}.`);
      return;
    }

    const ensured = await ensureTasksaiIdentities(prisma, {
      identities: decision.identities,
      rotate: flag("rotate"),
      generatePassword,
    });

    mkdirSync(OUT_DIR, { recursive: true });
    const identitiesFile = path.join(OUT_DIR, `identities.${env}.json`);
    writeFileSync(
      identitiesFile,
      JSON.stringify(
        {
          environment: env,
          generatedAt: new Date().toISOString(),
          identities: Object.fromEntries(
            ensured.map((e) => [
              e.key,
              { role: e.role, platformUserId: e.platformUserId, email: e.email, secretNames: tasksaiIdentitySecretNames(e.key) },
            ]),
          ),
        },
        null,
        2,
      ) + "\n",
    );

    const withPasswords = ensured.filter((e) => e.password);
    if (withPasswords.length) {
      const credentialsFile = path.join(OUT_DIR, `credentials.${env}.json`);
      const previous = existsSync(credentialsFile) ? JSON.parse(readFileSync(credentialsFile, "utf8")) : {};
      for (const e of withPasswords) {
        const names = tasksaiIdentitySecretNames(e.key);
        previous[e.key] = { [names.email]: e.email, [names.password]: e.password };
      }
      writeFileSync(credentialsFile, JSON.stringify(previous, null, 2) + "\n", { mode: 0o600 });
      chmodSync(credentialsFile, 0o600);
      console.log(`New passwords for: ${withPasswords.map((e) => e.key).join(", ")} → ${credentialsFile}`);
      console.log("Copy them into the Testora target's secrets (names are the JSON keys), then delete that file.");
    }
    for (const e of ensured) {
      console.log(`${e.created ? "created " : "present "} ${e.key.padEnd(8)} ${e.platformUserId}`);
    }
    console.log(`Opaque ids → ${identitiesFile}`);
  });
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
