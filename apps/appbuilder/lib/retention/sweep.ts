import { eq, lt } from "drizzle-orm";
import { deleteObject } from "@asafarim/storage";
import type { Db } from "../db/client";
import { validationArtifacts } from "../db/schema";
import { recordOperationalEvent } from "../observability/events";

export interface SweepResult {
  category: string;
  eligible: number;
  deleted: number;
  dryRun: boolean;
}

/**
 * The one category with real automated cleanup in M12 (see
 * lib/retention/policy.ts's docstring for why the others are eligibility-
 * reporting-only for now). Deletes the underlying storage object first,
 * then the row — if the storage delete fails, the row is left in place so
 * the next sweep retries rather than losing track of an orphaned object.
 */
export async function sweepExpiredValidationArtifacts(
  db: Db,
  options: { dryRun: boolean; now?: Date }
): Promise<SweepResult> {
  const now = options.now ?? new Date();
  const eligible = await db
    .select()
    .from(validationArtifacts)
    .where(lt(validationArtifacts.retentionExpiresAt, now));

  if (options.dryRun) {
    return {
      category: "validation_artifacts",
      eligible: eligible.length,
      deleted: 0,
      dryRun: true,
    };
  }

  let deleted = 0;
  for (const artifact of eligible) {
    await deleteObject(artifact.storageKey).catch(() => undefined);
    await db
      .delete(validationArtifacts)
      .where(eq(validationArtifacts.id, artifact.id));
    deleted += 1;
  }

  if (deleted > 0) {
    await recordOperationalEvent(db, {
      category: "storage",
      kind: "retention.swept",
      severity: "info",
      detail: { table: "validation_artifacts", deleted },
    });
  }

  return {
    category: "validation_artifacts",
    eligible: eligible.length,
    deleted,
    dryRun: false,
  };
}
