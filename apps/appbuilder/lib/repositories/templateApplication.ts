import { and, eq } from "drizzle-orm";
import {
  ENGINE_VERSION,
  SPEC_SCHEMA_VERSION,
  validateSpecification,
  checksumOf as specChecksumOf,
  type ApplicationSpecificationType,
} from "@asafarim/appbuilder-schema";
import type { AppTemplate } from "@asafarim/appbuilder-runtime";
import type { Db } from "../db/client";
import { specifications, specificationVersions } from "../db/schema";
import type { Actor } from "../auth/actor";
import { assertCapability } from "./authz";
import { recordAuditEvent } from "./audit";
import { generateId } from "../db/ids";
import { checksumOf } from "../db/hash";
import { NotFoundError, OperationValidationError, StaleVersionError } from "../errors";

export type SpecificationVersionRow = typeof specificationVersions.$inferSelect;

export interface ApplyTemplateVersionInput {
  template: AppTemplate;
  baseVersionNumber: number;
  idempotencyKey: string;
}

/**
 * Inserts a template's full starter specification as a new immutable
 * version — the bulk-starting-point counterpart to M04's single-operation
 * `applyOperation` (no operation in the allowlisted union bulk-replaces a
 * whole specification, by design; a template's `build()` output is trusted
 * server-side content from @asafarim/appbuilder-runtime, not model output,
 * so it bypasses the operation engine but NOT its validation — every
 * template payload is still run through `validateSpecification` before
 * being persisted).
 *
 * Same optimistic-concurrency and idempotency contract as
 * lib/repositories/operations.ts#applyOperation: a stale `baseVersionNumber`
 * throws `StaleVersionError`; a retried `idempotencyKey` with an identical
 * request replays the original result; a reused key with a different
 * template is a `ConflictError`.
 */
export async function applyTemplateVersion(
  db: Db,
  actor: Actor,
  appId: string,
  input: ApplyTemplateVersionInput,
): Promise<SpecificationVersionRow> {
  const { app } = await assertCapability(db, actor, appId, "app.applyOperation");
  const requestHash = checksumOf({ templateId: input.template.id, baseVersionNumber: input.baseVersionNumber });

  return db.transaction(async (tx) => {
    const [spec] = await tx
      .select()
      .from(specifications)
      .where(eq(specifications.appId, appId))
      .for("update")
      .limit(1);
    if (!spec) throw new NotFoundError("Specification for app", appId);

    // Idempotent replay: a version already exists whose summary marks it as
    // this exact template-application attempt.
    const [existingByKey] = await tx
      .select()
      .from(specificationVersions)
      .where(
        and(
          eq(specificationVersions.specificationId, spec.id),
          eq(specificationVersions.summary, templateSummary(input.template, input.idempotencyKey)),
        ),
      )
      .limit(1);
    if (existingByKey) {
      return existingByKey;
    }

    if (spec.currentVersionNumber !== input.baseVersionNumber) {
      throw new StaleVersionError(spec.currentVersionNumber, input.baseVersionNumber);
    }

    const templateSpec: ApplicationSpecificationType = input.template.build({
      name: app.name,
      slug: app.slug,
      description: app.description ?? undefined,
    });

    const validation = validateSpecification(templateSpec);
    if (!validation.ok) {
      throw new OperationValidationError(validation.errors);
    }

    const nextVersionNumber = spec.currentVersionNumber + 1;
    const versionId = generateId();
    const [version] = await tx
      .insert(specificationVersions)
      .values({
        id: versionId,
        specificationId: spec.id,
        appId,
        versionNumber: nextVersionNumber,
        parentVersionId: null,
        schemaVersion: SPEC_SCHEMA_VERSION,
        engineVersion: ENGINE_VERSION,
        summary: templateSummary(input.template, input.idempotencyKey),
        payload: templateSpec,
        checksum: specChecksumOf(templateSpec),
        createdByPrincipalId: actor.principalId,
      })
      .returning();

    await tx
      .update(specifications)
      .set({ currentVersionNumber: nextVersionNumber, updatedAt: new Date() })
      .where(eq(specifications.id, spec.id));

    await recordAuditEvent(tx, {
      appId,
      actorPrincipalId: actor.principalId,
      action: "generation.template_applied",
      targetType: "specification_version",
      targetId: versionId,
      metadata: { templateId: input.template.id, requestHash },
    });

    return version;
  });
}

/** Encodes the idempotency key into the version summary so a retried worker step can detect "already applied" without a dedicated column. */
function templateSummary(template: AppTemplate, idempotencyKey: string): string {
  return `Applied template: ${template.displayName} [${idempotencyKey}]`;
}
