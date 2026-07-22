import type { EntityType, FieldType } from "@asafarim/appbuilder-schema";
import { Button, FieldHint, FormRow, Input, Label, Select, Textarea } from "@asafarim/ui";
import { RENDER_LIMITS } from "../limits";
import type { ComponentRenderProps } from "../types";
import type { FiltersConfig, FormConfig, SettingsPanelConfig } from "../configSchemas";
import { ComponentEmptyState } from "./states";

function visibleFields(entity: EntityType, fieldIds: string[] | undefined): FieldType[] {
  const all = entity.fields.filter((field) => !field.archived);
  if (!fieldIds || fieldIds.length === 0) return all.slice(0, RENDER_LIMITS.MAX_FORM_FIELDS);
  const known = new Set(all.map((field) => field.id));
  return fieldIds
    .filter((id) => known.has(id))
    .slice(0, RENDER_LIMITS.MAX_FORM_FIELDS)
    .map((id) => all.find((field) => field.id === id)!);
}

function FieldControl({ field, componentId }: { field: FieldType; componentId: string }) {
  const fieldElementId = `${componentId}-${field.id}`;
  const hintId = `${fieldElementId}-hint`;

  const control = (() => {
    switch (field.type) {
      case "longText":
        return <Textarea id={fieldElementId} name={field.machineName} disabled aria-describedby={hintId} />;
      case "boolean":
        return <input id={fieldElementId} name={field.machineName} type="checkbox" disabled aria-describedby={hintId} />;
      case "select":
        return (
          <Select
            id={fieldElementId}
            name={field.machineName}
            disabled
            aria-describedby={hintId}
            options={field.options.map((option) => ({ value: option.value, label: option.label }))}
          />
        );
      case "date":
        return <Input id={fieldElementId} name={field.machineName} type="date" disabled aria-describedby={hintId} />;
      case "datetime":
        return <Input id={fieldElementId} name={field.machineName} type="datetime-local" disabled aria-describedby={hintId} />;
      case "integer":
      case "decimal":
        return <Input id={fieldElementId} name={field.machineName} type="number" disabled aria-describedby={hintId} />;
      case "email":
        return <Input id={fieldElementId} name={field.machineName} type="email" disabled aria-describedby={hintId} />;
      case "url":
        return <Input id={fieldElementId} name={field.machineName} type="url" disabled aria-describedby={hintId} />;
      case "file":
      case "image":
        return <Input id={fieldElementId} name={field.machineName} type="file" disabled aria-describedby={hintId} />;
      default:
        return <Input id={fieldElementId} name={field.machineName} type="text" disabled aria-describedby={hintId} />;
    }
  })();

  return (
    <FormRow>
      <Label htmlFor={fieldElementId}>
        {field.name}
        {field.required ? " *" : ""}
      </Label>
      {control}
      <FieldHint id={hintId}>Preview only — this field isn't wired to persistence yet (M09).</FieldHint>
    </FormRow>
  );
}

export function FormRenderer({ config, entity, componentId }: ComponentRenderProps<FormConfig>) {
  if (!entity) {
    return <ComponentEmptyState title="No form yet" description="This form isn't bound to an entity yet." />;
  }

  const fields = visibleFields(entity, config.fieldIds);
  if (fields.length === 0) {
    return <ComponentEmptyState title={`No ${entity.name.toLowerCase()} fields to show`} />;
  }

  return (
    // Every field and the submit button below are disabled — this is
    // display-only until M09 wires real persistence — so no onSubmit
    // handler is needed (and none may be attached here: this renders from
    // a Server Component, where a raw event-handler prop cannot cross the
    // RSC boundary).
    <form className="ab-form" aria-label={`${entity.name} form (preview)`}>
      {/* A plain hint, not <Alert tone="info">: that shared component's
          info tone fails WCAG AA contrast for this app's violet mood — see
          states.tsx's DemoDataNotice comment. */}
      <p className="ab-hint" role="status">
        Preview only — {entity.name} record creation/editing ships with M09.
      </p>
      {fields.map((field) => (
        <FieldControl key={field.id} field={field} componentId={componentId} />
      ))}
      <Button type="submit" disabled>
        {config.submitLabel ?? `Save ${entity.name}`}
      </Button>
    </form>
  );
}

export function FiltersRenderer({ config, entity, reportWarning }: ComponentRenderProps<FiltersConfig>) {
  if (!entity) {
    return <ComponentEmptyState title="No filters yet" description="Filters aren't bound to an entity yet." />;
  }

  const known = entity.fields.filter((field) => !field.archived);
  const knownIds = new Set(known.map((field) => field.id));
  for (const id of config.filterableFieldIds) {
    if (!knownIds.has(id)) {
      reportWarning({
        code: "invalid_binding",
        message: `Filters reference unknown field "${id}" on entity "${entity.id}"`,
      });
    }
  }
  const fields = config.filterableFieldIds
    .filter((id) => knownIds.has(id))
    .map((id) => known.find((field) => field.id === id)!);

  return (
    // All controls below are disabled — see FormRenderer's comment above.
    <form className="ab-filters" role="search" aria-label={`Filter ${entity.name}`}>
      {config.searchable ? (
        <FormRow>
          <Label htmlFor="ab-filter-search">Search</Label>
          <Input id="ab-filter-search" type="search" disabled placeholder={`Search ${entity.name.toLowerCase()}...`} />
        </FormRow>
      ) : null}
      {fields.map((field) => (
        <FormRow key={field.id}>
          <Label htmlFor={`ab-filter-${field.id}`}>{field.name}</Label>
          {field.type === "select" ? (
            <Select
              id={`ab-filter-${field.id}`}
              disabled
              options={[{ value: "", label: "All" }, ...field.options.map((option) => ({ value: option.value, label: option.label }))]}
            />
          ) : (
            <Input id={`ab-filter-${field.id}`} type="text" disabled />
          )}
        </FormRow>
      ))}
    </form>
  );
}

export function SettingsPanelRenderer({ config }: ComponentRenderProps<SettingsPanelConfig>) {
  const sections = config.sections ?? [];
  if (sections.length === 0) {
    return <ComponentEmptyState title="No settings configured" description="This settings panel has no sections yet." />;
  }

  return (
    <div className="ab-settings">
      {sections.map((section, index) => (
        <section key={`${section.title}-${index}`} className="ab-settings__section">
          <h3>{section.title}</h3>
          <dl>
            {section.fields.map((field, fieldIndex) => (
              <div className="ab-settings__row" key={`${field.label}-${fieldIndex}`}>
                <dt>{field.label}</dt>
                <dd>{field.value ?? "—"}</dd>
              </div>
            ))}
          </dl>
        </section>
      ))}
    </div>
  );
}
