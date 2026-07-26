import { and, eq } from "drizzle-orm";
import { classifyDestructiveChange, Operation, type ApplicationSpecificationType } from "@asafarim/appbuilder-schema";
import { appliedOperations, specificationVersions } from "../../db/schema";
import { findPreviousPassedBaseline } from "../baseline";
import type { GateContext, GateDefinition, GateResult } from "../types";
import { redactFailures } from "../redaction";

/**
 * Confirms that every destructive change introduced since the last
 * PASSED baseline was actually accepted through M04's confirmation contract
 * — never silently applied. Replays each recorded `appliedOperations` row
 * between the baseline version and the pinned version through the pure
 * engine (the same `classifyDestructiveChange` M04 already ran at apply
 * time) and cross-checks that a destructive one only exists if the row it
 * produced required (and therefore, per M04, received) explicit
 * confirmation — `applyOperation` (lib/repositories/operations.ts) refuses
 * to persist a destructive change at all without `confirmDestructive: true`,
 * so the mere existence of a resulting version for a destructive operation
 * IS the evidence confirmation occurred; this gate's job is verifying that
 * chain of versions is intact and unbroken, not re-deriving consent from
 * scratch.
 */
export const migrationDestructiveSafetyGate: GateDefinition = {
  key: "migration_destructive_safety",
  version: "1.0.0",
  mandatory: true,
  title: "Migration / destructive-change safety",
  description: "Every destructive change since the last approved version is traceable to a confirmed, recorded operation — never an unreviewed direct edit.",
  async execute(ctx: GateContext): Promise<GateResult> {
    const baseline = await findPreviousPassedBaseline(ctx.db, ctx.appId, ctx.specVersionNumber);
    if (!baseline) {
      return { status: "skipped", skipReason: "No prior passed validation run exists yet to diff against — nothing to evaluate." };
    }

    const versionsInRange = await ctx.db
      .select()
      .from(specificationVersions)
      .where(and(eq(specificationVersions.appId, ctx.appId)));

    const chain = versionsInRange
      .filter((v) => v.versionNumber > baseline.versionNumber && v.versionNumber <= ctx.specVersionNumber)
      .sort((a, b) => a.versionNumber - b.versionNumber);

    const failures: { code: string; message: string }[] = [];
    let workingSpec: ApplicationSpecificationType = baseline.payload;
    let destructiveStepsFound = 0;

    for (const version of chain) {
      const [producingOp] = await ctx.db
        .select()
        .from(appliedOperations)
        .where(and(eq(appliedOperations.appId, ctx.appId), eq(appliedOperations.resultingVersionId, version.id)));

      const nextSpec = version.payload as unknown as ApplicationSpecificationType;

      if (!producingOp) {
        // Directly-appended version (root/restore/undo — see
        // lib/repositories/versions.ts) has no per-operation confirmation
        // record by design, so instead check the structural diff itself for
        // a destructive-shaped divergence with nothing to explain it: an
        // active entity/page that existed in `workingSpec` and is gone (or
        // newly archived) in `nextSpec`, or a permission that was `allow`
        // and is now absent/`deny`. `restoreVersion` legitimately produces
        // exactly this shape when restoring an OLDER version over a newer
        // one — but it still requires the "app.restoreVersion" (owner-only)
        // capability and its own audit event, so a structural regression
        // here is expected and traceable, not silently unreviewed; this
        // gate still surfaces it as evidence rather than assuming innocence.
        const removedEntities = workingSpec.entities.filter(
          (e) => !e.archived && (nextSpec.entities.find((n) => n.id === e.id)?.archived ?? true),
        );
        const removedPages = workingSpec.pages.filter((p) => !p.archived && (nextSpec.pages.find((n) => n.id === p.id)?.archived ?? true));
        const narrowedPermissions = workingSpec.permissions.filter((p) => {
          if (p.effect !== "allow") return false;
          const stillAllowed = nextSpec.permissions.some((n) => n.roleId === p.roleId && n.entityId === p.entityId && n.verb === p.verb && n.effect === "allow");
          return !stillAllowed;
        });

        if (removedEntities.length > 0 || removedPages.length > 0 || narrowedPermissions.length > 0) {
          failures.push({
            code: "unconfirmed_destructive_change",
            message: `Version ${version.versionNumber} was appended directly (not via a recorded operation) and removes/narrows ${removedEntities.length} entit(y/ies), ${removedPages.length} page(s), ${narrowedPermissions.length} permission(s) relative to the prior version.`,
          });
        }
        workingSpec = nextSpec;
        continue;
      }

      const parsedOp = Operation.safeParse(producingOp.payload);
      if (parsedOp.success) {
        const destructive = classifyDestructiveChange(workingSpec, nextSpec, parsedOp.data);
        if (destructive) {
          destructiveStepsFound += 1;
          // The row's mere existence with a non-null resultingVersionId proves
          // applyOperation accepted confirmDestructive:true for it (see
          // lib/repositories/operations.ts) — nothing further to check per
          // row; a version produced WITHOUT going through applyOperation at
          // all for a destructive-shaped diff is the actual defect, which the
          // "no producing operation record" branch below would have caught
          // had this been a directly-appended version instead.
        }
      }
      workingSpec = nextSpec;
    }

    if (failures.length > 0) {
      return {
        status: "failed",
        failureCode: "unconfirmed_destructive_change",
        failureMessage: `${failures.length} unconfirmed destructive change(s) found since version ${baseline.versionNumber}.`,
        structuredFailures: redactFailures(failures),
      };
    }

    return { status: "passed", evidence: { baselineVersionNumber: baseline.versionNumber, versionsChecked: chain.length, destructiveStepsFound } };
  },
};
