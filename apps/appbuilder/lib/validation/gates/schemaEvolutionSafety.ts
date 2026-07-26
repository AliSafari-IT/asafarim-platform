import { classifyEntityEvolution, checkExistingRecordsAgainstField } from "../../generated-data/schemaEvolution";
import { findPreviousPassedBaseline } from "../baseline";
import type { GateContext, GateDefinition, GateResult } from "../types";
import { redactFailures } from "../redaction";

/**
 * Diffs the pinned specification against the most recent PASSED baseline
 * (see lib/validation/baseline.ts) using M09's own
 * `classifyEntityEvolution`/`checkExistingRecordsAgainstField` — never
 * reimplemented here. A field evolution classified `requires_migration`
 * (a type change) is never auto-repaired or auto-approved: it fails this
 * gate and surfaces as `migration_data_safety_failure` to the repair
 * classifier (lib/repair/classify.ts), which refuses to attempt an automatic
 * repair for it — a human must review and apply a reviewed migration plan.
 * `requires_validation` changes (a newly tightened required/unique
 * constraint) only fail if existing generated data actually violates the
 * tightened constraint right now; a tightened constraint with zero
 * violating rows is safe.
 */
export const schemaEvolutionSafetyGate: GateDefinition = {
  key: "schema_evolution_safety",
  version: "1.0.0",
  mandatory: true,
  title: "Schema-evolution safety",
  description: "No field change since the last approved version requires an unreviewed migration, and no tightened constraint is violated by existing generated data.",
  async execute(ctx: GateContext): Promise<GateResult> {
    const baseline = await findPreviousPassedBaseline(ctx.db, ctx.appId, ctx.specVersionNumber);
    if (!baseline) {
      return { status: "skipped", skipReason: "No prior passed validation run exists yet to diff against — nothing to evaluate." };
    }

    const failures: { code: string; message: string }[] = [];
    let requiresValidationChecked = 0;

    for (const newEntity of ctx.specPayload.entities) {
      const oldEntity = baseline.payload.entities.find((e) => e.id === newEntity.id);
      if (!oldEntity) continue; // brand-new entity — nothing to evolve from
      const reports = classifyEntityEvolution(oldEntity, newEntity);
      for (const report of reports) {
        if (report.kind === "requires_migration") {
          failures.push({ code: "requires_migration", message: `Entity "${newEntity.name}" field "${report.fieldId}": ${report.reason}` });
        } else if (report.kind === "requires_validation") {
          requiresValidationChecked += 1;
          const field = newEntity.fields.find((f) => f.id === report.fieldId);
          if (!field) continue;
          const violations = await checkExistingRecordsAgainstField(ctx.db, ctx.appId, newEntity.id, field);
          if (violations.length > 0) {
            failures.push({
              code: "constraint_violated_by_existing_data",
              message: `Entity "${newEntity.name}" field "${report.fieldId}": ${violations.length} existing record(s) violate the tightened constraint (${report.reason}).`,
            });
          }
        }
      }
    }

    if (failures.length > 0) {
      return {
        status: "failed",
        failureCode: failures.some((f) => f.code === "requires_migration") ? "requires_migration" : "constraint_violated_by_existing_data",
        failureMessage: `${failures.length} schema-evolution safety issue(s) found relative to version ${baseline.versionNumber}.`,
        structuredFailures: redactFailures(failures),
      };
    }

    return { status: "passed", evidence: { baselineVersionNumber: baseline.versionNumber, requiresValidationChecked } };
  },
};
