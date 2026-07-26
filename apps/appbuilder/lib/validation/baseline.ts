import { and, desc, eq, lt } from "drizzle-orm";
import type { ApplicationSpecificationType } from "@asafarim/appbuilder-schema";
import type { Db } from "../db/client";
import { specificationVersions, validationRuns } from "../db/schema";

/**
 * The most recent PASSED validation run's specification payload with a
 * version number strictly before the one currently being validated — the
 * baseline "requires_migration"/destructive-change gates diff against.
 * Never the app's live current draft (which could be mid-edit and unrelated
 * to what was last actually approved) and never a non-terminal or
 * non-passed run (an in-progress or failed run was never approved evidence
 * of anything). Returns null when no prior passed run exists yet (e.g. the
 * very first validation run for an app) — callers treat that as "nothing to
 * diff against" (skip, not fail).
 */
export async function findPreviousPassedBaseline(
  db: Db,
  appId: string,
  currentVersionNumber: number,
): Promise<{ payload: ApplicationSpecificationType; versionNumber: number } | null> {
  const [priorRun] = await db
    .select({
      payload: specificationVersions.payload,
      versionNumber: specificationVersions.versionNumber,
    })
    .from(validationRuns)
    .innerJoin(specificationVersions, eq(validationRuns.specificationVersionId, specificationVersions.id))
    .where(
      and(
        eq(validationRuns.appId, appId),
        eq(validationRuns.status, "passed"),
        lt(specificationVersions.versionNumber, currentVersionNumber),
      ),
    )
    .orderBy(desc(specificationVersions.versionNumber))
    .limit(1);

  if (!priorRun) return null;
  return {
    payload: priorRun.payload as unknown as ApplicationSpecificationType,
    versionNumber: priorRun.versionNumber,
  };
}
