"use client";

import { useState, type FormEvent } from "react";
import type { ApplicationSpecificationType, EntityType, FieldType } from "@asafarim/appbuilder-schema";
import { RENDER_LIMITS } from "@asafarim/appbuilder-runtime";
import { Button, ValidationSummary } from "@asafarim/ui";
import { createRecord } from "./apiClient";
import { LiveFieldControl } from "./fieldControls";
import { LiveApiError } from "./types";

function visibleFields(entity: EntityType, fieldIds: string[] | undefined): FieldType[] {
  const all = entity.fields.filter((field) => !field.archived);
  if (!fieldIds || fieldIds.length === 0) return all.slice(0, RENDER_LIMITS.MAX_FORM_FIELDS);
  const known = new Set(all.map((field) => field.id));
  return fieldIds
    .filter((id) => known.has(id))
    .slice(0, RENDER_LIMITS.MAX_FORM_FIELDS)
    .map((id) => all.find((field) => field.id === id)!);
}

export interface LiveFormProps {
  appId: string;
  entityId: string;
  entity: EntityType;
  spec: ApplicationSpecificationType;
  componentId: string;
  fieldIds?: string[];
  submitLabel?: string;
  simulateRoleId: string | undefined;
  onCreated: () => void;
}

/** Live, interactive equivalent of M06's FormRenderer — actually creates a record via the M09 runtime API instead of rendering permanently-disabled fields. */
export function LiveForm({ appId, entityId, entity, spec, componentId, fieldIds, submitLabel, simulateRoleId, onCreated }: LiveFormProps) {
  const fields = visibleFields(entity, fieldIds);
  const [values, setValues] = useState<Record<string, unknown>>({});
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  function relationTarget(field: FieldType): EntityType | undefined {
    if (field.type !== "relation") return undefined;
    const relation = spec.relations.find((r) => r.id === field.relationId && !r.archived);
    return relation ? spec.entities.find((e) => e.id === relation.toEntityId && !e.archived) : undefined;
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setSubmitError(null);
    setFieldErrors({});
    setSubmitting(true);
    try {
      await createRecord(appId, entityId, values, simulateRoleId);
      setValues({});
      onCreated();
    } catch (err) {
      if (err instanceof LiveApiError && err.payload.errors) {
        const byField: Record<string, string> = {};
        for (const issue of err.payload.errors) byField[issue.field] = issue.message;
        setFieldErrors(byField);
        setSubmitError("Please fix the highlighted fields.");
      } else {
        setSubmitError(err instanceof LiveApiError ? err.message : "Failed to create record.");
      }
    } finally {
      setSubmitting(false);
    }
  }

  const summaryErrors = Object.entries(fieldErrors).map(([fieldId, message]) => ({
    fieldId: `${componentId}-${fieldId}`,
    label: fields.find((f) => f.id === fieldId)?.name ?? fieldId,
    messages: [message],
  }));

  return (
    <form className="ab-form" aria-label={`Create ${entity.name}`} onSubmit={handleSubmit}>
      <ValidationSummary errors={summaryErrors} />
      {submitError && summaryErrors.length === 0 ? (
        <p className="ui-field-error" role="alert">
          {submitError}
        </p>
      ) : null}
      {fields.map((field) => (
        <LiveFieldControl
          key={field.id}
          appId={appId}
          field={field}
          value={values[field.id]}
          onChange={(value) => setValues((v) => ({ ...v, [field.id]: value }))}
          componentId={componentId}
          relationTargetEntity={relationTarget(field)}
          simulateRoleId={simulateRoleId}
          error={fieldErrors[field.id]}
        />
      ))}
      <Button type="submit" disabled={submitting}>
        {submitting ? "Saving…" : (submitLabel ?? `Save ${entity.name}`)}
      </Button>
    </form>
  );
}
