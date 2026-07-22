import { and, eq } from "drizzle-orm";
import {
  applySpecOperation,
  invertOperation,
  validateSpecification,
  emptySpecification,
  checksumOf as schemaChecksumOf,
  SPEC_SCHEMA_VERSION,
  ENGINE_VERSION,
  type ApplicationSpecificationType,
  type OperationType,
} from "@asafarim/appbuilder-schema";
import type { Db } from "../db/client";
import { appliedOperations, specifications, specificationVersions } from "../db/schema";
import type { Actor } from "../auth/actor";
import { assertCapability } from "./authz";
import { recordAuditEvent } from "./audit";
import { generateId } from "../db/ids";
import { checksumOf } from "../db/hash";
import { ConflictError, NotFoundError, OperationValidationError, RestoreRequiredError, StaleVersionError } from "../errors";
import type { AppliedOperationRow, SpecificationVersionRow } from "./operations";

export interface RestoreVersionInput {
  targetVersionNumber: number;
  baseVersionNumber: number;
  idempotencyKey: string;
}

export interface VersionMutationResult {
  operation: AppliedOperationRow;
  version: SpecificationVersionRow;
}

/**
 * Restores an older version as a brand-new version — never rewrites or
 * deletes the historical rows. Goes through the same optimistic-concurrency
 * and idempotency contract as `applyOperation` (see operations.ts); the
 * resulting version's payload is byte-for-byte the target version's
 * payload, re-validated against the *current* schema before being
 * persisted (defense against a schema evolution making an old version
 * unsafe to resurrect).
 */
export async function restoreVersion(
  db: Db,
  actor: Actor,
  appId: string,
  input: RestoreVersionInput,
): Promise<VersionMutationResult> {
  await assertCapability(db, actor, appId, "app.restoreVersion");
  const requestHash = checksumOf({ action: "restore", targetVersionNumber: input.targetVersionNumber, baseVersionNumber: input.baseVersionNumber });

  return db.transaction(async (tx) => {
    const [existingOp] = await tx
      .select()
      .from(appliedOperations)
      .where(eq(appliedOperations.idempotencyKey, input.idempotencyKey))
      .limit(1);

    if (existingOp && existingOp.appId === appId) {
      if (existingOp.requestHash !== requestHash) {
        throw new ConflictError("Idempotency key reused with a different request payload");
      }
      const [version] = existingOp.resultingVersionId
        ? await tx.select().from(specificationVersions).where(eq(specificationVersions.id, existingOp.resultingVersionId)).limit(1)
        : [];
      if (!version) throw new NotFoundError("Specification version", "resulting version");
      return { operation: existingOp, version };
    }

    const [spec] = await tx.select().from(specifications).where(eq(specifications.appId, appId)).for("update").limit(1);
    if (!spec) throw new NotFoundError("Specification for app", appId);

    if (spec.currentVersionNumber !== input.baseVersionNumber) {
      throw new StaleVersionError(spec.currentVersionNumber, input.baseVersionNumber);
    }

    const [target] = await tx
      .select()
      .from(specificationVersions)
      .where(and(eq(specificationVersions.specificationId, spec.id), eq(specificationVersions.versionNumber, input.targetVersionNumber)))
      .limit(1);
    if (!target) {
      throw new NotFoundError("Specification version", String(input.targetVersionNumber));
    }

    const restoredSpec = target.payload as unknown as ApplicationSpecificationType;
    const validation = validateSpecification(restoredSpec);
    if (!validation.ok) {
      throw new OperationValidationError(validation.errors);
    }

    const [currentVersion] =
      spec.currentVersionNumber > 0
        ? await tx
            .select()
            .from(specificationVersions)
            .where(and(eq(specificationVersions.specificationId, spec.id), eq(specificationVersions.versionNumber, spec.currentVersionNumber)))
            .limit(1)
        : [];

    const nextVersionNumber = spec.currentVersionNumber + 1;
    const versionId = generateId();

    const [version] = await tx
      .insert(specificationVersions)
      .values({
        id: versionId,
        specificationId: spec.id,
        appId,
        versionNumber: nextVersionNumber,
        parentVersionId: currentVersion?.id ?? null,
        schemaVersion: SPEC_SCHEMA_VERSION,
        engineVersion: ENGINE_VERSION,
        summary: `Restored version ${input.targetVersionNumber}`,
        payload: restoredSpec,
        checksum: schemaChecksumOf(restoredSpec),
        createdByPrincipalId: actor.principalId,
      })
      .returning();

    await tx
      .update(specifications)
      .set({ currentVersionNumber: nextVersionNumber, updatedAt: new Date() })
      .where(eq(specifications.id, spec.id));

    const [operation] = await tx
      .insert(appliedOperations)
      .values({
        id: generateId(),
        appId,
        specificationId: spec.id,
        resultingVersionId: versionId,
        operationType: "RESTORE_VERSION",
        payload: { targetVersionNumber: input.targetVersionNumber },
        status: "applied",
        appliedByPrincipalId: actor.principalId,
        idempotencyKey: input.idempotencyKey,
        requestHash,
        baseVersionNumber: input.baseVersionNumber,
      })
      .returning();

    await recordAuditEvent(tx, {
      appId,
      actorPrincipalId: actor.principalId,
      action: "version.restored",
      targetType: "specification_version",
      targetId: versionId,
      metadata: { targetVersionNumber: input.targetVersionNumber },
    });

    return { operation, version };
  });
}

export interface UndoLastOperationInput {
  baseVersionNumber: number;
  idempotencyKey: string;
}

/**
 * Undoes the operation that produced the current version, by computing and
 * applying its inverse (see @asafarim/appbuilder-schema's invertOperation)
 * — never by rewriting or deleting the current version. If no safe inverse
 * exists for that operation, throws `RestoreRequiredError` instead of
 * guessing; the caller should offer `restoreVersion` to an earlier version
 * instead.
 */
export async function undoLastOperation(
  db: Db,
  actor: Actor,
  appId: string,
  input: UndoLastOperationInput,
): Promise<VersionMutationResult> {
  const { app } = await assertCapability(db, actor, appId, "app.editSpecification");
  const requestHash = checksumOf({ action: "undo", baseVersionNumber: input.baseVersionNumber });

  return db.transaction(async (tx) => {
    const [existingOp] = await tx
      .select()
      .from(appliedOperations)
      .where(eq(appliedOperations.idempotencyKey, input.idempotencyKey))
      .limit(1);

    if (existingOp && existingOp.appId === appId) {
      if (existingOp.requestHash !== requestHash) {
        throw new ConflictError("Idempotency key reused with a different request payload");
      }
      const [version] = existingOp.resultingVersionId
        ? await tx.select().from(specificationVersions).where(eq(specificationVersions.id, existingOp.resultingVersionId)).limit(1)
        : [];
      if (!version) throw new NotFoundError("Specification version", "resulting version");
      return { operation: existingOp, version };
    }

    const [spec] = await tx.select().from(specifications).where(eq(specifications.appId, appId)).for("update").limit(1);
    if (!spec) throw new NotFoundError("Specification for app", appId);

    if (spec.currentVersionNumber !== input.baseVersionNumber) {
      throw new StaleVersionError(spec.currentVersionNumber, input.baseVersionNumber);
    }
    if (spec.currentVersionNumber === 0) {
      throw new NotFoundError("Applied operation", "none");
    }

    const [currentVersion] = await tx
      .select()
      .from(specificationVersions)
      .where(and(eq(specificationVersions.specificationId, spec.id), eq(specificationVersions.versionNumber, spec.currentVersionNumber)))
      .limit(1);
    if (!currentVersion) throw new NotFoundError("Specification version", String(spec.currentVersionNumber));

    const [producingOperation] = await tx
      .select()
      .from(appliedOperations)
      .where(eq(appliedOperations.resultingVersionId, currentVersion.id))
      .limit(1);
    if (!producingOperation || producingOperation.operationType === "RESTORE_VERSION") {
      // The current version was produced by a restore (or has no tracked
      // producing operation at all) — there is no single operation here to
      // compute a safe inverse from.
      throw new RestoreRequiredError();
    }

    // Version 1's "parent" is the implicit empty specification — never a
    // stored row — so a null parentVersionId there is expected, not an error.
    let beforeSpec: ApplicationSpecificationType;
    if (currentVersion.parentVersionId) {
      const [beforeVersion] = await tx
        .select()
        .from(specificationVersions)
        .where(eq(specificationVersions.id, currentVersion.parentVersionId))
        .limit(1);
      if (!beforeVersion) throw new RestoreRequiredError();
      beforeSpec = beforeVersion.payload as unknown as ApplicationSpecificationType;
    } else if (currentVersion.versionNumber === 1) {
      beforeSpec = emptySpecification({ name: app.name, slug: app.slug });
    } else {
      throw new RestoreRequiredError();
    }

    // The inverse is computed from the state the *original* operation was
    // applied against (`beforeSpec`), but it must be *applied* to the
    // *current* spec — e.g. undoing a CREATE_ENTITY archives the entity
    // (the only safe inverse available), it does not resurrect a state
    // where the entity never existed.
    const inverse = invertOperation(beforeSpec, producingOperation.payload as unknown as OperationType);
    if (!inverse) {
      throw new RestoreRequiredError(
        `No safe inverse exists for operation "${producingOperation.operationType}" — restore an earlier version instead`,
      );
    }

    const currentSpec = currentVersion.payload as unknown as ApplicationSpecificationType;
    const outcome = applySpecOperation(currentSpec, inverse, { confirmDestructive: true });
    if (!outcome.ok) {
      throw new OperationValidationError(outcome.errors);
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
        parentVersionId: currentVersion.id,
        schemaVersion: SPEC_SCHEMA_VERSION,
        engineVersion: outcome.engineVersion,
        summary: `Undid: ${producingOperation.operationType}`,
        payload: outcome.spec,
        checksum: outcome.checksum,
        createdByPrincipalId: actor.principalId,
      })
      .returning();

    await tx
      .update(specifications)
      .set({ currentVersionNumber: nextVersionNumber, updatedAt: new Date() })
      .where(eq(specifications.id, spec.id));

    const [operation] = await tx
      .insert(appliedOperations)
      .values({
        id: generateId(),
        appId,
        specificationId: spec.id,
        resultingVersionId: versionId,
        operationType: inverse.type,
        payload: inverse,
        status: "applied",
        appliedByPrincipalId: actor.principalId,
        idempotencyKey: input.idempotencyKey,
        requestHash,
        baseVersionNumber: input.baseVersionNumber,
      })
      .returning();

    await recordAuditEvent(tx, {
      appId,
      actorPrincipalId: actor.principalId,
      action: "operation.undone",
      targetType: "specification_version",
      targetId: versionId,
      metadata: { undidOperationType: producingOperation.operationType, inverseType: inverse.type },
    });

    return { operation, version };
  });
}
