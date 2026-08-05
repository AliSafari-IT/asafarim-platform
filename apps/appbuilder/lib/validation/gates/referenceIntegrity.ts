import { validateSpecification } from "@asafarim/appbuilder-schema";
import type { GateContext, GateDefinition, GateResult } from "../types";
import { redactFailures } from "../redaction";

const REFERENCE_CODES = new Set(["orphaned_reference", "circular_reference", "invalid_relation_direction"]);

/**
 * Every cross-reference in the pinned specification resolves: field
 * `relationId`s, permission `roleId`/`entityId`, page/navigation
 * `requiredRoleIds`, dashboard/action `entityId`, workflow trigger/step
 * targets — plus workflow step cycle detection. Reuses
 * `validateSpecification` (the same function M04's operation engine already
 * runs after every transform) filtered to just these codes, rather than
 * reimplementing the traversal — see docs/appbuilder-m10-validation-qa.md
 * for why this gate is a lens on validateSpecification's output rather than
 * a second implementation that could drift from M04's own guarantee.
 */
export const referenceIntegrityGate: GateDefinition = {
  key: "reference_integrity",
  version: "1.1.0",
  mandatory: true,
  title: "Reference integrity",
  description: "Every cross-reference in the specification (relations, permissions, navigation, workflow targets) resolves to a real, non-archived target, and every relation field is declared on its relation's \"from\" side.",
  async execute(ctx: GateContext): Promise<GateResult> {
    const result = validateSpecification(ctx.specPayload);
    const referenceIssues = result.errors.filter((e) => REFERENCE_CODES.has(e.code));
    if (referenceIssues.length === 0) {
      return {
        status: "passed",
        evidence: {
          relationCount: ctx.specPayload.relations.length,
          permissionCount: ctx.specPayload.permissions.length,
          workflowCount: ctx.specPayload.workflows.length,
        },
      };
    }
    return {
      status: "failed",
      failureCode: "orphaned_reference",
      failureMessage: `${referenceIssues.length} unresolved reference(s) found.`,
      structuredFailures: redactFailures(referenceIssues.map((e) => ({ code: e.code, message: e.message, path: e.path }))),
    };
  },
};
