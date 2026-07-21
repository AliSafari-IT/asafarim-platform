import type { EntityType, FieldType } from "@asafarim/appbuilder-schema";

/**
 * M09 (functional generated-record CRUD) has not shipped — nothing has
 * actually been persisted for a generated app yet. Every data-dependent
 * registry entry either renders a safe empty state or this deterministic,
 * clearly-labelled preview/demo data (see registry/components/states.tsx's
 * `DemoDataNotice`) — never data implying a real record was saved.
 * Deterministic (no `Math.random`/`Date.now`) so snapshot/a11y tests are
 * reproducible and preview renders are stable across requests.
 */
export function generateDemoRows(entity: EntityType, count = 3): Record<string, unknown>[] {
  return Array.from({ length: count }, (_, index) => {
    const row: Record<string, unknown> = { id: `demo-${entity.id}-${index + 1}` };
    for (const field of entity.fields) {
      if (field.archived) continue;
      row[field.machineName] = demoValueForField(field, index);
    }
    return row;
  });
}

function demoValueForField(field: FieldType, index: number): unknown {
  switch (field.type) {
    case "text":
      return `${field.name} ${index + 1}`;
    case "longText":
      return `Sample ${field.name.toLowerCase()} text for preview record ${index + 1}.`;
    case "integer":
      return (index + 1) * 10;
    case "decimal":
      return Number(((index + 1) * 10.5).toFixed(field.decimalPlaces ?? 2));
    case "boolean":
      return index % 2 === 0;
    case "date":
      return isoDateOffset(index);
    case "datetime":
      return `${isoDateOffset(index)}T09:00:00.000Z`;
    case "select":
      return field.options[index % field.options.length]?.value;
    case "email":
      return `person${index + 1}@example.com`;
    case "url":
      return "https://example.com";
    case "relation":
    case "file":
    case "image":
      // Related/attached-content rendering needs a real data engine (M09) —
      // the field-level renderer shows its own placeholder for these.
      return null;
    default:
      return null;
  }
}

/** Deterministic ISO date a fixed number of days after a stable epoch — never wall-clock time. */
function isoDateOffset(index: number): string {
  const base = Date.UTC(2026, 0, 1);
  const day = 24 * 60 * 60 * 1000;
  return new Date(base + index * day).toISOString().slice(0, 10);
}

export function labelForFieldValue(field: FieldType | undefined, value: unknown): string {
  if (value === null || value === undefined) return "—";
  if (field?.type === "select") {
    const option = field.options.find((candidate) => candidate.value === value);
    return option?.label ?? String(value);
  }
  if (field?.type === "boolean") return value ? "Yes" : "No";
  return String(value);
}
