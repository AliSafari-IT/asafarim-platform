"use client";

import type { EntityType, FieldType } from "@asafarim/appbuilder-schema";
import { labelForFieldValue } from "@asafarim/appbuilder-runtime";
import { useEntityRecords } from "./useEntityRecords";

export interface LiveKanbanProps {
  appId: string;
  entityId: string;
  entity: EntityType;
  groupByFieldId: string;
  cardTitleFieldId?: string;
  simulateRoleId: string | undefined;
  refreshToken: number;
}

/** Live, read-only Kanban grouping of real records by a select field — matches M06's non-interactive (no drag-and-drop) Kanban policy; editing a task's status happens on the Tasks table/detail page, which stays the single source of truth for writes. */
export function LiveKanban({ appId, entityId, entity, groupByFieldId, cardTitleFieldId, simulateRoleId, refreshToken }: LiveKanbanProps) {
  const groupField = entity.fields.find((f) => !f.archived && f.id === groupByFieldId) as Extract<FieldType, { type: "select" }> | undefined;
  const titleField = entity.fields.find((f) => !f.archived && f.id === cardTitleFieldId);
  const { records, loading, error } = useEntityRecords(appId, entityId, { pageSize: 100 }, simulateRoleId, refreshToken);

  if (!groupField) return <p className="ab-hint">Board misconfigured — its group-by field must be a select field.</p>;
  if (loading) return <p className="ab-hint">Loading…</p>;
  if (error) return <p className="ui-field-error" role="alert">{error}</p>;

  return (
    <div className="ab-kanban" role="group" aria-label={`${entity.name} board`}>
      {groupField.options.map((column) => (
        <section key={column.value} className="ab-kanban__column" aria-label={column.label}>
          <h4>{column.label}</h4>
          <ul>
            {records
              .filter((r) => r.data[groupField.id] === column.value)
              .map((r) => (
                <li key={r.id} className="ab-kanban__card">
                  {titleField ? labelForFieldValue(titleField, r.data[titleField.id]) : `${entity.name} ${r.id}`}
                </li>
              ))}
          </ul>
        </section>
      ))}
    </div>
  );
}
