import { and, eq } from "drizzle-orm";
import type { EntityType, FieldType } from "@asafarim/appbuilder-schema";
import type { Db } from "../db/client";
import { generatedRecords } from "../db/schema";
import { validateFieldValue } from "./validation";

/**
 * Classifies a single field's change between the specification version a
 * batch of existing records was written against and the CURRENT pinned
 * version — never executes a migration itself (M09 has no automatic
 * destructive migration path anywhere). Used by the builder-facing "is
 * this schema change safe?" surface; the actual decision to proceed with
 * a `requires_validation`/`requires_migration`/`blocked` change stays a
 * human, explicit action outside this module (M04's operation engine
 * already refuses type changes as anything but archive+re-add — see
 * @asafarim/appbuilder-schema's operations/types.ts comment on
 * `FieldPatch` — so this module's job is reporting DATA-level impact, not
 * gatekeeping the specification edit itself, which M04 already does).
 */

export type FieldEvolutionKind = "safe" | "requires_validation" | "requires_migration" | "blocked";

export interface FieldEvolutionReport {
  fieldId: string;
  kind: FieldEvolutionKind;
  reason: string;
}

export function classifyFieldEvolution(oldField: FieldType | undefined, newField: FieldType | undefined): FieldEvolutionReport {
  if (!oldField && newField) {
    if (newField.required && newField.type !== "boolean") {
      return { fieldId: newField.id, kind: "requires_validation", reason: "New required field — existing records must be backfilled before it can be safely enforced." };
    }
    return { fieldId: newField.id, kind: "safe", reason: "New optional field (or a boolean, which always has a default)." };
  }
  if (oldField && !newField) {
    return { fieldId: oldField.id, kind: "safe", reason: "Field archived — existing data is preserved and the field remains recoverable." };
  }
  if (!oldField || !newField) {
    return { fieldId: "unknown", kind: "safe", reason: "No change." };
  }

  if (oldField.type !== newField.type) {
    return { fieldId: newField.id, kind: "requires_migration", reason: `Type changed from "${oldField.type}" to "${newField.type}" — requires an explicit, reviewed migration plan; never applied automatically.` };
  }
  if (!oldField.required && newField.required) {
    return { fieldId: newField.id, kind: "requires_validation", reason: "Field tightened to required — existing records must be validated before this is safe." };
  }
  if (!oldField.unique && newField.unique) {
    return { fieldId: newField.id, kind: "requires_validation", reason: "Field tightened to unique — existing records must be checked for duplicate values before this is safe." };
  }
  if (newField.type === "select" && oldField.type === "select") {
    const removedOptions = oldField.options.filter((o) => !newField.options.some((n) => n.value === o.value));
    if (removedOptions.length > 0) {
      return { fieldId: newField.id, kind: "requires_validation", reason: `Option(s) removed (${removedOptions.map((o) => o.value).join(", ")}) — existing records referencing them must be checked.` };
    }
  }

  return { fieldId: newField.id, kind: "safe", reason: "Only display metadata (name/description) changed — existing data is untouched." };
}

export function classifyEntityEvolution(oldEntity: EntityType | undefined, newEntity: EntityType | undefined): FieldEvolutionReport[] {
  if (!oldEntity || !newEntity) return [];
  const oldFields = new Map(oldEntity.fields.map((f) => [f.id, f]));
  const newFields = new Map(newEntity.fields.map((f) => [f.id, f]));
  const allIds = new Set([...oldFields.keys(), ...newFields.keys()]);
  return [...allIds].map((id) => classifyFieldEvolution(oldFields.get(id), newFields.get(id)));
}

export interface ValidationViolation {
  recordId: string;
  message: string;
}

/**
 * Checks existing ACTIVE records of an entity against a single tightened
 * field constraint (required/unique/select-options) — read-only, reports
 * violations rather than fixing or blocking anything itself. A builder
 * decides what to do with the report; M09 never auto-corrects data.
 */
export async function checkExistingRecordsAgainstField(
  db: Db,
  appId: string,
  entityId: string,
  field: FieldType,
  limit = 500,
): Promise<ValidationViolation[]> {
  const rows = await db
    .select()
    .from(generatedRecords)
    .where(and(eq(generatedRecords.appId, appId), eq(generatedRecords.entityId, entityId), eq(generatedRecords.status, "active")))
    .limit(limit);

  const violations: ValidationViolation[] = [];
  const seenUniqueValues = new Map<string, string>();
  for (const row of rows) {
    const value = (row.data as Record<string, unknown>)[field.id];
    const issue = validateFieldValue(field, value);
    if (issue) {
      violations.push({ recordId: row.id, message: issue.message });
      continue;
    }
    if (field.unique && value !== undefined && value !== null) {
      const key = JSON.stringify(value);
      const existingRecordId = seenUniqueValues.get(key);
      if (existingRecordId) {
        violations.push({ recordId: row.id, message: `Duplicate value with record ${existingRecordId} — would violate the new uniqueness constraint.` });
      } else {
        seenUniqueValues.set(key, row.id);
      }
    }
  }
  return violations;
}
