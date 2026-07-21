import { eq } from "drizzle-orm";
import type { Db } from "../db/client";
import { appliedOperations, specifications, specificationVersions } from "../db/schema";
import type { Actor } from "../auth/actor";
import { assertAppAccess } from "./authz";
import { recordAuditEvent } from "./audit";
import { generateId } from "../db/ids";
import { checksumOf } from "../db/hash";
import { NotFoundError } from "../errors";

export type AppliedOperationRow = typeof appliedOperations.$inferSelect;

export interface ApplyOperationInput {
  operationType: string;
  payload: Record<string, unknown>;
  idempotencyKey: string;
}

/**
 * Appends a new immutable specification version and records the operation
 * that produced it, in one transaction. Idempotent on
 * `(appId, idempotencyKey)`: a retried request with the same key returns the
 * original operation instead of appending a second version.
 *
 * M02 keeps the operation/version contract conservative (opaque JSON
 * payload) — M04 formalizes the actual operation schema and validation.
 */
export async function applyOperation(
  db: Db,
  actor: Actor,
  appId: string,
  input: ApplyOperationInput,
): Promise<AppliedOperationRow> {
  await assertAppAccess(db, actor, appId, "editor");

  return db.transaction(async (tx) => {
    const [existing] = await tx
      .select()
      .from(appliedOperations)
      .where(eq(appliedOperations.idempotencyKey, input.idempotencyKey))
      .limit(1);

    if (existing && existing.appId === appId) {
      return existing;
    }

    const [spec] = await tx.select().from(specifications).where(eq(specifications.appId, appId)).limit(1);
    if (!spec) {
      throw new NotFoundError("Specification for app", appId);
    }

    const nextVersionNumber = spec.currentVersionNumber + 1;
    const versionId = generateId();

    await tx.insert(specificationVersions).values({
      id: versionId,
      specificationId: spec.id,
      appId,
      versionNumber: nextVersionNumber,
      payload: input.payload,
      checksum: checksumOf(input.payload),
      createdByPrincipalId: actor.principalId,
    });

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
        operationType: input.operationType,
        payload: input.payload,
        status: "applied",
        appliedByPrincipalId: actor.principalId,
        idempotencyKey: input.idempotencyKey,
      })
      .returning();

    await recordAuditEvent(tx, {
      appId,
      actorPrincipalId: actor.principalId,
      action: "operation.applied",
      targetType: "specification_version",
      targetId: versionId,
      metadata: { operationType: input.operationType },
    });

    return operation;
  });
}

export async function listOperationsForActor(
  db: Db,
  actor: Actor,
  appId: string,
): Promise<AppliedOperationRow[]> {
  await assertAppAccess(db, actor, appId, "viewer");
  return db.select().from(appliedOperations).where(eq(appliedOperations.appId, appId));
}
