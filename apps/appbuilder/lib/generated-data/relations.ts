import { and, eq, or } from "drizzle-orm";
import type { ApplicationSpecificationType, RelationType } from "@asafarim/appbuilder-schema";
import type { Db } from "../db/client";
import { generatedRecordRelations, generatedRecords } from "../db/schema";
import { generateId } from "../db/ids";
import { ConflictError } from "../errors";

/**
 * Validated relation edges between generated records. A relation-typed
 * field's VALUE (a record id) lives inside `generatedRecords.data` as the
 * source of truth; the `generatedRecordRelations` edge table is a
 * transactionally-maintained, indexed PROJECTION of it — never the other
 * way around — so reverse lookups ("every task for project X") don't need
 * a JSONB scan. Every write here re-validates that both records belong to
 * the SAME app and the correct entities, closing off cross-app relation
 * injection regardless of what a client claims.
 */

export class UnknownRelationError extends ConflictError {
  constructor(relationId: string) {
    super(`Relation "${relationId}" does not exist in the app's current specification.`);
    this.name = "UnknownRelationError";
  }
}

export class InvalidRelationTargetError extends ConflictError {
  constructor(message: string) {
    super(message);
    this.name = "InvalidRelationTargetError";
  }
}

export class RelationRestrictedError extends ConflictError {
  constructor(relationName: string) {
    super(`Cannot archive: other records still reference it through the "${relationName}" relation.`);
    this.name = "RelationRestrictedError";
  }
}

const MAX_CASCADE_DEPTH = 8;

export function findRelation(spec: ApplicationSpecificationType, relationId: string): RelationType {
  const relation = spec.relations.find((r) => r.id === relationId && !r.archived);
  if (!relation) throw new UnknownRelationError(relationId);
  return relation;
}

/**
 * Validates a relation-typed field's value: the relation must exist, the
 * record carrying the field must be on the relation's `fromEntityId` side
 * (the only direction an MVP relation field is declared on), and the
 * referenced record must be a real, same-app, non-archived record of the
 * relation's `toEntityId`. Throws on ANY mismatch — including a
 * same-shaped id from a DIFFERENT app, which fails purely because the
 * `(id, appId, entityId)` triple never matches.
 */
export async function validateRelationTarget(
  db: Db,
  appId: string,
  spec: ApplicationSpecificationType,
  relationId: string,
  entityIdOfRecord: string,
  targetRecordId: string,
): Promise<RelationType> {
  const relation = findRelation(spec, relationId);
  if (relation.fromEntityId !== entityIdOfRecord) {
    throw new InvalidRelationTargetError(`Relation "${relationId}" is not declared from entity "${entityIdOfRecord}".`);
  }

  const [target] = await db
    .select()
    .from(generatedRecords)
    .where(
      and(
        eq(generatedRecords.id, targetRecordId),
        eq(generatedRecords.appId, appId),
        eq(generatedRecords.entityId, relation.toEntityId),
      ),
    )
    .limit(1);
  if (!target) {
    throw new InvalidRelationTargetError(`Relation "${relationId}" target record was not found in this app.`);
  }
  if (target.status === "archived") {
    throw new InvalidRelationTargetError(`Relation "${relationId}" target record is archived.`);
  }

  return relation;
}

export async function upsertRelationEdge(
  tx: Db,
  appId: string,
  relationId: string,
  fromRecordId: string,
  toRecordId: string,
): Promise<void> {
  const [existing] = await tx
    .select()
    .from(generatedRecordRelations)
    .where(
      and(
        eq(generatedRecordRelations.relationId, relationId),
        eq(generatedRecordRelations.fromRecordId, fromRecordId),
        eq(generatedRecordRelations.toRecordId, toRecordId),
      ),
    )
    .limit(1);
  if (existing) return;
  await tx.insert(generatedRecordRelations).values({ id: generateId(), appId, relationId, fromRecordId, toRecordId });
}

/** Removes every edge (either direction) a record participates in — used before archiving/hard-clearing a record's relation edges. */
export async function removeRelationEdgesForRecord(tx: Db, recordId: string): Promise<void> {
  await tx
    .delete(generatedRecordRelations)
    .where(or(eq(generatedRecordRelations.fromRecordId, recordId), eq(generatedRecordRelations.toRecordId, recordId)));
}

/** Bounded reverse lookup: every `fromRecordId` currently pointing at `toRecordId` through `relationId`. */
export async function listIncomingEdges(db: Db, relationId: string, toRecordId: string, limit = 200): Promise<string[]> {
  const rows = await db
    .select({ fromRecordId: generatedRecordRelations.fromRecordId })
    .from(generatedRecordRelations)
    .where(and(eq(generatedRecordRelations.relationId, relationId), eq(generatedRecordRelations.toRecordId, toRecordId)))
    .limit(Math.min(limit, 200));
  return rows.map((r) => r.fromRecordId);
}

/**
 * Applies the specification's `onDelete` behavior for every relation whose
 * TARGET entity is the one being archived, for every incoming edge onto
 * `recordId`. `restrict` blocks the archive outright; `setNull` clears the
 * referencing field on each source record; `cascade` recursively archives
 * each source record too, bounded by `MAX_CASCADE_DEPTH` so a
 * misconfigured or cyclic relation graph can never recurse unboundedly.
 * Runs inside the caller's own transaction.
 */
export async function applyDeleteBehaviorOnArchive(
  tx: Db,
  appId: string,
  spec: ApplicationSpecificationType,
  entityId: string,
  recordId: string,
  depth = 0,
): Promise<void> {
  if (depth >= MAX_CASCADE_DEPTH) {
    throw new ConflictError("Archive cascade exceeded the maximum allowed depth — check this app's relation graph for a cycle.");
  }

  const incomingRelations = spec.relations.filter((r) => !r.archived && r.toEntityId === entityId);
  for (const relation of incomingRelations) {
    const sourceIds = await listIncomingEdges(tx, relation.id, recordId);
    if (sourceIds.length === 0) continue;

    if (relation.onDelete === "restrict") {
      throw new RelationRestrictedError(relation.name);
    }

    for (const sourceId of sourceIds) {
      const [sourceRecord] = await tx.select().from(generatedRecords).where(eq(generatedRecords.id, sourceId)).limit(1);
      if (!sourceRecord || sourceRecord.status === "archived") continue;

      if (relation.onDelete === "setNull") {
        const field = spec.entities
          .find((e) => e.id === relation.fromEntityId)
          ?.fields.find((f) => !f.archived && f.type === "relation" && f.relationId === relation.id);
        if (field) {
          const nextData = { ...sourceRecord.data, [field.id]: null };
          await tx.update(generatedRecords).set({ data: nextData, updatedAt: new Date() }).where(eq(generatedRecords.id, sourceId));
        }
        await tx
          .delete(generatedRecordRelations)
          .where(and(eq(generatedRecordRelations.relationId, relation.id), eq(generatedRecordRelations.fromRecordId, sourceId)));
      } else if (relation.onDelete === "cascade") {
        await tx
          .update(generatedRecords)
          .set({ status: "archived", archivedAt: new Date(), updatedAt: new Date() })
          .where(eq(generatedRecords.id, sourceId));
        await applyDeleteBehaviorOnArchive(tx, appId, spec, relation.fromEntityId, sourceId, depth + 1);
      }
    }
  }
}
