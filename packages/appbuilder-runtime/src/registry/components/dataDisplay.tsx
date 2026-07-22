import type { EntityType, FieldType } from "@asafarim/appbuilder-schema";
import { generateDemoRows, labelForFieldValue } from "../../render/demoData";
import { RENDER_LIMITS } from "../limits";
import type { ComponentRenderProps } from "../types";
import type { CalendarConfig, DataTableConfig, KanbanConfig } from "../configSchemas";
import { ComponentEmptyState, ComponentErrorState, DemoDataNotice } from "./states";

function fieldById(entity: EntityType | undefined, fieldId: string | undefined): FieldType | undefined {
  if (!entity || !fieldId) return undefined;
  return entity.fields.find((field) => field.id === fieldId && !field.archived);
}

function visibleFields(entity: EntityType, fieldIds: string[] | undefined): FieldType[] {
  const all = entity.fields.filter((field) => !field.archived);
  if (!fieldIds || fieldIds.length === 0) return all.slice(0, RENDER_LIMITS.MAX_TABLE_COLUMNS);
  const known = new Set(all.map((field) => field.id));
  return fieldIds
    .filter((id) => known.has(id))
    .slice(0, RENDER_LIMITS.MAX_TABLE_COLUMNS)
    .map((id) => all.find((field) => field.id === id)!);
}

export function DataTableRenderer({
  config,
  entity,
  reportWarning,
}: ComponentRenderProps<DataTableConfig>) {
  if (!entity) {
    return <ComponentEmptyState title="No data table yet" description="This table isn't bound to an entity yet." />;
  }

  if (config.fieldIds) {
    for (const id of config.fieldIds) {
      if (!entity.fields.some((field) => field.id === id && !field.archived)) {
        reportWarning({
          code: "invalid_binding",
          message: `Data table references unknown field "${id}" on entity "${entity.id}"`,
        });
      }
    }
  }

  const columns = visibleFields(entity, config.fieldIds);
  const rows = generateDemoRows(entity, Math.min(config.pageSize ?? 3, RENDER_LIMITS.MAX_TABLE_ROWS));

  if (columns.length === 0) {
    return <ComponentEmptyState title={`No ${entity.name.toLowerCase()} fields to show`} />;
  }

  return (
    <DemoDataNotice>
      <div className="ab-table-wrap" role="region" aria-label={`${entity.name} table`} tabIndex={0}>
        <table className="ab-table">
          <caption className="ab-visually-hidden">{entity.name} records (preview data)</caption>
          <thead>
            <tr>
              {columns.map((field) => (
                <th key={field.id} scope="col">
                  {field.name}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr key={row.id as string}>
                {columns.map((field) => (
                  <td key={field.id}>{labelForFieldValue(field, row[field.machineName])}</td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </DemoDataNotice>
  );
}

export function KanbanRenderer({ config, entity, reportWarning }: ComponentRenderProps<KanbanConfig>) {
  if (!entity) {
    return <ComponentEmptyState title="No Kanban board yet" description="This board isn't bound to an entity yet." />;
  }

  const groupField = fieldById(entity, config.groupByFieldId);
  if (!groupField || groupField.type !== "select") {
    reportWarning({
      code: "invalid_binding",
      message: `Kanban board's groupByFieldId "${config.groupByFieldId}" is not a select field on entity "${entity.id}"`,
    });
    return (
      <ComponentErrorState
        title="Kanban board misconfigured"
        description="Its group-by field must be a select field on the bound entity."
      />
    );
  }

  const titleField = fieldById(entity, config.cardTitleFieldId);
  const columns = groupField.options.slice(0, RENDER_LIMITS.MAX_KANBAN_COLUMNS);
  const rows = generateDemoRows(entity, RENDER_LIMITS.MAX_KANBAN_CARDS_PER_COLUMN > 6 ? 6 : RENDER_LIMITS.MAX_KANBAN_CARDS_PER_COLUMN);

  return (
    <DemoDataNotice>
      <div className="ab-kanban" role="group" aria-label={`${entity.name} board`}>
        {columns.map((column, columnIndex) => (
          <section key={column.value} className="ab-kanban__column" aria-label={column.label}>
            <h4>{column.label}</h4>
            <ul>
              {rows
                .filter((_, rowIndex) => rowIndex % columns.length === columnIndex)
                .map((row) => (
                  <li key={row.id as string} className="ab-kanban__card">
                    {titleField ? labelForFieldValue(titleField, row[titleField.machineName]) : `${entity.name} ${row.id}`}
                  </li>
                ))}
            </ul>
          </section>
        ))}
      </div>
    </DemoDataNotice>
  );
}

export function CalendarRenderer({ config, entity, reportWarning }: ComponentRenderProps<CalendarConfig>) {
  if (!entity) {
    return <ComponentEmptyState title="No calendar yet" description="This calendar isn't bound to an entity yet." />;
  }

  const dateField = fieldById(entity, config.dateFieldId);
  if (!dateField || (dateField.type !== "date" && dateField.type !== "datetime")) {
    reportWarning({
      code: "invalid_binding",
      message: `Calendar's dateFieldId "${config.dateFieldId}" is not a date/datetime field on entity "${entity.id}"`,
    });
    return (
      <ComponentErrorState
        title="Calendar misconfigured"
        description="Its date field must be a date or datetime field on the bound entity."
      />
    );
  }

  const titleField = fieldById(entity, config.titleFieldId);
  const rows = generateDemoRows(entity, 4);
  const grouped = new Map<string, Record<string, unknown>[]>();
  for (const row of rows) {
    const raw = String(row[dateField.machineName] ?? "").slice(0, 10);
    grouped.set(raw, [...(grouped.get(raw) ?? []), row]);
  }

  return (
    <DemoDataNotice>
      <div className="ab-calendar" aria-label={`${entity.name} schedule`}>
        {[...grouped.entries()].map(([date, items]) => (
          <section key={date} className="ab-calendar__day">
            <h4>{date}</h4>
            <ul>
              {items.map((row) => (
                <li key={row.id as string}>
                  {titleField ? labelForFieldValue(titleField, row[titleField.machineName]) : `${entity.name} ${row.id}`}
                </li>
              ))}
            </ul>
          </section>
        ))}
      </div>
    </DemoDataNotice>
  );
}
