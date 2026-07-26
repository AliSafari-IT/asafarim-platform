import { validateSpecification } from "@asafarim/appbuilder-schema";
import type { GateContext, GateDefinition, GateResult } from "../types";
import { redactFailures } from "../redaction";

const REFERENCE_CODES = new Set(["orphaned_reference", "circular_reference"]);

/**
 * Structural/shape validity of the pinned specification — everything
 * `validateSpecification` reports EXCEPT reference-integrity issues, which
 * get their own gate (`reference_integrity.ts`) so a builder sees a
 * distinct, actionable signal for "you named two things the same" vs. "you
 * pointed at something that doesn't exist."
 */
export const specSchemaValidityGate: GateDefinition = {
  key: "spec_schema_validity",
  version: "1.0.0",
  mandatory: true,
  title: "Specification schema validity",
  description:
    "The pinned specification satisfies structural invariants: unique ids/names, no reserved names, and passes the content-safety sweep.",
  async execute(ctx: GateContext): Promise<GateResult> {
    const result = validateSpecification(ctx.specPayload);
    const structural = result.errors.filter((e) => !REFERENCE_CODES.has(e.code));
    if (structural.length === 0) {
      return {
        status: "passed",
        evidence: {
          entityCount: ctx.specPayload.entities.length,
          pageCount: ctx.specPayload.pages.length,
          roleCount: ctx.specPayload.roles.length,
        },
      };
    }
    return {
      status: "failed",
      failureCode: "schema_invalid",
      failureMessage: `${structural.length} structural validation issue(s) found.`,
      structuredFailures: redactFailures(structural.map((e) => ({ code: e.code, message: e.message, path: e.path }))),
    };
  },
};
