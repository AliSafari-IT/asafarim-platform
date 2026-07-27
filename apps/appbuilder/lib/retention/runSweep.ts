#!/usr/bin/env -S node
/**
 * M12 retention sweep. Dry-run by default (reports what WOULD be deleted);
 * pass `--apply` to actually delete. See docs/appbuilder-m12-privacy-retention.md
 * for the full policy this implements, and lib/retention/policy.ts for why
 * only `validation_artifacts` has automated deletion in M12.
 *
 * Usage: `pnpm --filter appbuilder retention:sweep [--apply]`.
 */
import { getDb, closeDb } from "../db/client";
import { sweepExpiredValidationArtifacts } from "./sweep";

async function main(): Promise<void> {
  const apply = process.argv.includes("--apply");
  const db = getDb();

  const result = await sweepExpiredValidationArtifacts(db, { dryRun: !apply });

  console.log(
    `[retention] validation_artifacts: ${result.eligible} eligible, ${result.deleted} deleted (dryRun=${result.dryRun})`
  );
  if (!apply && result.eligible > 0) {
    console.log(
      "[retention] Re-run with --apply to actually delete these rows/objects."
    );
  }

  await closeDb();
}

main();
