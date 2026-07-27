import type { ApplicationSpecificationType } from "@asafarim/appbuilder-schema";
import type { Db } from "../db/client";
import { classifyEntityEvolution, checkExistingRecordsAgainstField } from "../generated-data/schemaEvolution";
import { PRODUCTION } from "../generated-data/environment";

/**
 * The verdict frozen onto `releases.dataCompatibility` (lib/db/schema.ts).
 * "none" — there is no prior production release to diff against (this
 * app's first-ever deployment). "safe" — every entity/field change since
 * the currently-live production release is non-destructive. "requires_review"
 * — a change tightens a constraint but no LIVE PRODUCTION record currently
 * violates it (still surfaced to the approver, never silently treated as
 * "safe"). "unsafe" — a change requires a reviewed migration (a field type
 * change) or a tightened constraint IS violated by live production data;
 * this release can never become eligible while "unsafe".
 */
export type DataCompatibilityVerdict = "none" | "safe" | "requires_review" | "unsafe";

export interface DataCompatibilityIssue {
  entityId: string;
  fieldId: string;
  kind: "requires_migration" | "requires_validation";
  reason: string;
  violatingRecordCount?: number;
}

export interface DataCompatibilityResult {
  verdict: DataCompatibilityVerdict;
  issues: DataCompatibilityIssue[];
}

/**
 * Diffs the CANDIDATE specification (the version being prepared for
 * release) against the specification currently live in PRODUCTION for this
 * app, if any — never against preview/demo data, which is irrelevant to
 * whether real production records would be broken by this change. Read-only:
 * this never migrates or repairs anything, only reports.
 */
export async function computeDataCompatibility(
  db: Db,
  appId: string,
  candidateSpec: ApplicationSpecificationType,
  currentProductionSpec: ApplicationSpecificationType | null,
): Promise<DataCompatibilityResult> {
  if (!currentProductionSpec) {
    return { verdict: "none", issues: [] };
  }

  const issues: DataCompatibilityIssue[] = [];

  for (const newEntity of candidateSpec.entities) {
    const oldEntity = currentProductionSpec.entities.find((e) => e.id === newEntity.id);
    if (!oldEntity) continue; // brand-new entity — nothing production-live to evolve from

    for (const report of classifyEntityEvolution(oldEntity, newEntity)) {
      if (report.kind === "requires_migration") {
        issues.push({ entityId: newEntity.id, fieldId: report.fieldId, kind: "requires_migration", reason: report.reason });
      } else if (report.kind === "requires_validation") {
        const field = newEntity.fields.find((f) => f.id === report.fieldId);
        if (!field) continue;
        const violations = await checkExistingRecordsAgainstField(db, appId, PRODUCTION, newEntity.id, field);
        issues.push({
          entityId: newEntity.id,
          fieldId: report.fieldId,
          kind: "requires_validation",
          reason: report.reason,
          violatingRecordCount: violations.length,
        });
      }
    }
  }

  if (issues.some((i) => i.kind === "requires_migration")) {
    return { verdict: "unsafe", issues };
  }
  const violated = issues.filter((i) => i.kind === "requires_validation" && (i.violatingRecordCount ?? 0) > 0);
  if (violated.length > 0) {
    return { verdict: "unsafe", issues };
  }
  if (issues.length > 0) {
    return { verdict: "requires_review", issues };
  }
  return { verdict: "safe", issues };
}
