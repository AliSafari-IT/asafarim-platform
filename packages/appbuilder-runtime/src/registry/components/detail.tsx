import type { EntityType, FieldType } from "@asafarim/appbuilder-schema";
import { Timeline } from "@asafarim/ui";
import { generateDemoRows, labelForFieldValue } from "../../render/demoData";
import { RENDER_LIMITS } from "../limits";
import type { ComponentRenderProps } from "../types";
import type { ActivityTimelineConfig, DetailViewConfig, FileFieldConfig } from "../configSchemas";
import { ComponentEmptyState, DemoDataNotice } from "./states";

function visibleFields(entity: EntityType, fieldIds: string[] | undefined): FieldType[] {
  const all = entity.fields.filter((field) => !field.archived);
  if (!fieldIds || fieldIds.length === 0) return all.slice(0, RENDER_LIMITS.MAX_FORM_FIELDS);
  const known = new Set(all.map((field) => field.id));
  return fieldIds
    .filter((id) => known.has(id))
    .slice(0, RENDER_LIMITS.MAX_FORM_FIELDS)
    .map((id) => all.find((field) => field.id === id)!);
}

export function DetailViewRenderer({ config, entity }: ComponentRenderProps<DetailViewConfig>) {
  if (!entity) {
    return <ComponentEmptyState title="No record detail yet" description="This view isn't bound to an entity yet." />;
  }

  const fields = visibleFields(entity, config.fieldIds);
  const [record] = generateDemoRows(entity, 1);

  if (fields.length === 0 || !record) {
    return <ComponentEmptyState title={`No ${entity.name.toLowerCase()} to show`} />;
  }

  return (
    <DemoDataNotice>
      <dl className="ab-detail" aria-label={`${entity.name} detail`}>
        {fields.map((field) => (
          <div className="ab-detail__row" key={field.id}>
            <dt>{field.name}</dt>
            <dd>{labelForFieldValue(field, record[field.machineName])}</dd>
          </div>
        ))}
      </dl>
    </DemoDataNotice>
  );
}

export function ActivityTimelineRenderer({ config, entity }: ComponentRenderProps<ActivityTimelineConfig>) {
  const items =
    config.items ??
    (entity
      ? generateDemoRows(entity, 3).map((row, index) => ({
          time: `${index === 0 ? "Today" : `${index} day(s) ago`}`,
          title: `${entity.name} ${row.id} updated`,
          meta: "Preview activity — not a real audit event.",
        }))
      : []);

  if (items.length === 0) {
    return <ComponentEmptyState title="No activity yet" description="Nothing has happened on this app yet." />;
  }

  return (
    <DemoDataNotice>
      <Timeline items={items} />
    </DemoDataNotice>
  );
}

export function FileFieldRenderer({ config, entity }: ComponentRenderProps<FileFieldConfig>) {
  const field = entity?.fields.find((candidate) => candidate.id === config.fieldId && !candidate.archived);
  const label = config.label ?? field?.name ?? "Attachment";

  return (
    <div className="ab-file-field" role="group" aria-label={label}>
      <div className="ab-file-field__placeholder" aria-hidden="true">
        {field?.type === "image" ? "🖼" : "📎"}
      </div>
      <p>{label}</p>
      <p className="ab-hint">No file attached — file/image upload ships with M09.</p>
    </div>
  );
}
