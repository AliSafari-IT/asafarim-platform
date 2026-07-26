import { and, eq } from "drizzle-orm";
import { Operation, checksumOf as schemaChecksumOf } from "@asafarim/appbuilder-schema";
import { appliedOperations } from "../../db/schema";
import type { GateContext, GateDefinition, GateResult } from "../types";
import { redactFailures } from "../redaction";

/**
 * Defense-in-depth over the pinned version's provenance: (a) the version's
 * stored checksum still matches its own payload (the same corruption check
 * `requestPreviewBuild` already performs at build time — re-verified here so
 * a validation run never trusts a possibly-stale build's word for it), and
 * (b) if this version was produced by a recorded `appliedOperations` row
 * (not every version has one — a root/template version or a restored/undone
 * version is appended directly, never through the operation-allowlist path;
 * see lib/repositories/versions.ts), that row's operation payload still
 * structurally parses against the CURRENT allowlisted `Operation` union —
 * catching the case where an operation schema version was retired but a
 * historical row still references it.
 */
export const operationLegalityGate: GateDefinition = {
  key: "operation_legality",
  version: "1.0.0",
  mandatory: true,
  title: "Operation legality",
  description: "The pinned version's checksum matches its payload, and (if produced by a recorded operation) that operation still parses against the current allowlist.",
  async execute(ctx: GateContext): Promise<GateResult> {
    const computedChecksum = schemaChecksumOf(ctx.specPayload);
    if (computedChecksum !== ctx.specChecksum) {
      return {
        status: "failed",
        failureCode: "checksum_mismatch",
        failureMessage: "The pinned specification version's checksum no longer matches its own payload.",
        structuredFailures: redactFailures([{ code: "checksum_mismatch", message: "Checksum mismatch on the pinned version." }]),
      };
    }

    const producingOps = await ctx.db
      .select()
      .from(appliedOperations)
      .where(and(eq(appliedOperations.appId, ctx.appId), eq(appliedOperations.resultingVersionId, ctx.specVersionId)));

    const illegal: { code: string; message: string }[] = [];
    for (const op of producingOps) {
      const parsed = Operation.safeParse(op.payload);
      if (!parsed.success) {
        illegal.push({ code: "operation_not_allowlisted", message: `Recorded operation ${op.id} (${op.operationType}) no longer parses against the allowlisted operation schema.` });
      }
    }

    if (illegal.length > 0) {
      return {
        status: "failed",
        failureCode: "operation_not_allowlisted",
        failureMessage: `${illegal.length} recorded operation(s) failed re-validation against the current allowlist.`,
        structuredFailures: redactFailures(illegal),
      };
    }

    return { status: "passed", evidence: { checksumVerified: true, producingOperationCount: producingOps.length } };
  },
};
