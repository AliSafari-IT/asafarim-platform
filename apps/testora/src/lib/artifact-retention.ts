import "server-only";
import { desc, eq } from "drizzle-orm";
import { deleteObject } from "@asafarim/storage";
import { db } from "@/db/client";
import { testResults } from "@/db/schema";
import type { ArtifactKind, StoredArtifactRef } from "@/test-engine/artifact-timeline";

/**
 * Deletes failure artifacts (screenshot / DOM snapshot / video, #259) whose
 * retention window has passed and strips their refs from
 * `test_results.details.artifactRefs`. Idempotent and safe to run repeatedly
 * from a scheduled job; the artifact route already 410s expired refs, so this
 * is purely storage/DB hygiene.
 */
export async function pruneExpiredArtifacts(
  options: { now?: Date; limit?: number } = {},
): Promise<{ scannedRows: number; deletedObjects: number; updatedRows: number }> {
  const now = options.now ?? new Date();
  const rows = await db.query.testResults.findMany({
    orderBy: desc(testResults.createdAt),
    limit: options.limit ?? 5000,
    columns: { id: true, details: true },
  });

  let deletedObjects = 0;
  let updatedRows = 0;

  for (const row of rows) {
    const details = (row.details as Record<string, unknown> | null) ?? null;
    const refs = details?.artifactRefs as
      | Partial<Record<ArtifactKind, StoredArtifactRef>>
      | undefined;
    if (!refs) continue;

    const kept: Partial<Record<ArtifactKind, StoredArtifactRef>> = {};
    let changed = false;

    for (const [kind, ref] of Object.entries(refs) as [ArtifactKind, StoredArtifactRef][]) {
      const expiresMs = Date.parse(ref?.expiresAt ?? "");
      if (Number.isFinite(expiresMs) && expiresMs < now.getTime() && ref?.key) {
        await deleteObject(ref.key);
        deletedObjects += 1;
        changed = true;
      } else if (ref) {
        kept[kind] = ref;
      }
    }

    if (changed) {
      const nextDetails = { ...details } as Record<string, unknown>;
      if (Object.keys(kept).length > 0) nextDetails.artifactRefs = kept;
      else delete nextDetails.artifactRefs;
      await db
        .update(testResults)
        .set({ details: nextDetails })
        .where(eq(testResults.id, row.id));
      updatedRows += 1;
    }
  }

  return { scannedRows: rows.length, deletedObjects, updatedRows };
}
