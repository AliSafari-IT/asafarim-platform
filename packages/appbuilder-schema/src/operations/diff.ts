import type { ApplicationSpecificationType } from "../specification";
import { canonicalize } from "../canonical";

export type DiffKind = "added" | "removed" | "changed";

export interface DiffEntry {
  path: (string | number)[];
  kind: DiffKind;
  before?: unknown;
  after?: unknown;
}

export interface SpecificationDiff {
  entries: DiffEntry[];
}

function deepEqual(a: unknown, b: unknown): boolean {
  return canonicalize(a) === canonicalize(b);
}

/** Diffs two id-keyed collections, reporting added/removed/changed by id. */
function diffCollection<T extends { id: string }>(
  path: (string | number)[],
  before: readonly T[],
  after: readonly T[],
  entries: DiffEntry[],
  onChanged?: (path: (string | number)[], before: T, after: T, entries: DiffEntry[]) => void,
): void {
  const beforeById = new Map(before.map((item) => [item.id, item]));
  const afterById = new Map(after.map((item) => [item.id, item]));

  for (const [id, item] of afterById) {
    if (!beforeById.has(id)) {
      entries.push({ path: [...path, id], kind: "added", after: item });
    }
  }
  for (const [id, item] of beforeById) {
    if (!afterById.has(id)) {
      entries.push({ path: [...path, id], kind: "removed", before: item });
    }
  }
  for (const [id, beforeItem] of beforeById) {
    const afterItem = afterById.get(id);
    if (!afterItem) continue;
    if (!deepEqual(beforeItem, afterItem)) {
      if (onChanged) {
        onChanged([...path, id], beforeItem, afterItem, entries);
      } else {
        entries.push({ path: [...path, id], kind: "changed", before: beforeItem, after: afterItem });
      }
    }
  }
}

/**
 * Structured, path-aware comparison of two specification versions. Entities
 * additionally diff their nested `fields` collection; every other
 * top-level collection is compared as whole records (added/removed/changed
 * by id). `branding`/`app` are compared as single records.
 */
export function diffSpecifications(
  before: ApplicationSpecificationType,
  after: ApplicationSpecificationType,
): SpecificationDiff {
  const entries: DiffEntry[] = [];

  diffCollection(["entities"], before.entities, after.entities, entries, (path, beforeEntity, afterEntity, entries) => {
    const entityChanged =
      beforeEntity.name !== afterEntity.name ||
      beforeEntity.description !== afterEntity.description ||
      beforeEntity.machineName !== afterEntity.machineName ||
      beforeEntity.archived !== afterEntity.archived;
    if (entityChanged) {
      entries.push({ path, kind: "changed", before: beforeEntity, after: afterEntity });
    }
    diffCollection([...path, "fields"], beforeEntity.fields, afterEntity.fields, entries);
    diffCollection([...path, "indexes"], beforeEntity.indexes, afterEntity.indexes, entries);
  });

  diffCollection(["relations"], before.relations, after.relations, entries);
  diffCollection(["roles"], before.roles, after.roles, entries);
  diffCollection(["permissions"], before.permissions, after.permissions, entries);
  diffCollection(["navigation"], before.navigation, after.navigation, entries);
  diffCollection(["pages"], before.pages, after.pages, entries, (path, beforePage, afterPage, entries) => {
    entries.push({ path, kind: "changed", before: beforePage, after: afterPage });
    diffCollection([...path, "components"], beforePage.components, afterPage.components, entries);
  });
  diffCollection(["actions"], before.actions, after.actions, entries);
  diffCollection(["workflows"], before.workflows, after.workflows, entries);
  diffCollection(["dashboard", "widgets"], before.dashboard.widgets, after.dashboard.widgets, entries);

  if (!deepEqual(before.branding, after.branding)) {
    entries.push({ path: ["branding"], kind: "changed", before: before.branding, after: after.branding });
  }
  if (!deepEqual(before.app, after.app)) {
    entries.push({ path: ["app"], kind: "changed", before: before.app, after: after.app });
  }

  return { entries };
}
