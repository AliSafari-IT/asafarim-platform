#!/usr/bin/env -S node
/**
 * The retention sweep. Dry-run by default (reports what WOULD be deleted);
 * pass `--apply` to actually delete. See docs/appbuilder-m12-privacy-retention.md
 * for the full policy this implements and lib/retention/policy.ts for which
 * categories have automated cleanup.
 *
 * M13 slice G added the two M13 categories to this runner. Until now
 * `sweepUnclaimedAttachments` existed and was tested but nothing outside
 * tests ever called it — the 24-hour unclaimed-upload deletion the milestone
 * promises was implemented and never actually ran. That is exactly the gap
 * the new `cleanupLag` readiness section (lib/observability/m13Readiness.ts)
 * now makes visible: it counts rows already past their deadline, so a sweep
 * that is not scheduled shows up as a growing number rather than as silence.
 *
 * Exit code is 1 if any sweep threw, so a scheduled run that half-failed is
 * not reported as success by whatever runs it.
 *
 * Usage: `pnpm --filter @asafarim/appbuilder retention:sweep [--apply]`.
 */
import { getDb, closeDb } from "../db/client";
import {
  sweepExpiredValidationArtifacts,
  sweepOrphanedMemoryFacts,
  sweepUnclaimedAttachments,
  type SweepResult,
} from "./sweep";
import { recordOperationalEvent } from "../observability/events";

async function main(): Promise<void> {
  const apply = process.argv.includes("--apply");
  const db = getDb();
  const dryRun = !apply;

  const sweeps: Array<[string, () => Promise<SweepResult>]> = [
    ["validation_artifacts", () => sweepExpiredValidationArtifacts(db, { dryRun })],
    ["conversation_attachments", () => sweepUnclaimedAttachments(db, { dryRun })],
    ["conversation_memories", () => sweepOrphanedMemoryFacts(db, { dryRun })],
  ];

  let failed = 0;
  let totalEligible = 0;

  for (const [name, run] of sweeps) {
    try {
      const result = await run();
      totalEligible += result.eligible;
      console.log(
        `[retention] ${result.category}: ${result.eligible} eligible, ${result.deleted} deleted (dryRun=${result.dryRun})`
      );
    } catch (err) {
      failed += 1;
      // One sweep failing must not stop the others: they are independent
      // categories, and skipping the rest would turn a single bad row into a
      // platform-wide retention stall.
      console.error(
        `[retention] ${name}: FAILED — ${err instanceof Error ? err.message : "unknown error"}`
      );
      await recordOperationalEvent(db, {
        category: "storage",
        kind: "retention.sweep_failed",
        severity: "error",
        detail: { sweep: name, reason: err instanceof Error ? err.name : "unknown" },
      }).catch(() => undefined);
    }
  }

  if (dryRun && totalEligible > 0) {
    console.log("[retention] Re-run with --apply to actually delete these rows/objects.");
  }

  await closeDb();
  if (failed > 0) process.exitCode = 1;
}

main();
