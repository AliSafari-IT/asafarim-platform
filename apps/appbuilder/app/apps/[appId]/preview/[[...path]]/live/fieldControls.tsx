"use client";

import { useEffect, useState } from "react";
import type { EntityType, FieldType } from "@asafarim/appbuilder-schema";
import { FieldHint, FormRow, Input, Label, Select, Textarea } from "@asafarim/ui";
import { listRecords } from "./apiClient";
import type { GeneratedRecord } from "./types";

/** Picks the most human-readable field on an entity for use as a relation option's label — prefers an obviously-named text field, falls back to the first visible field, then the record id. */
function pickDisplayField(entity: EntityType): FieldType | undefined {
  const visible = entity.fields.filter((f) => !f.archived);
  const named = visible.find((f) => f.type === "text" && /name|title/i.test(f.machineName));
  if (named) return named;
  return visible.find((f) => f.type === "text") ?? visible[0];
}

export function displayLabelFor(entity: EntityType | undefined, record: GeneratedRecord): string {
  if (!entity) return record.id;
  const field = pickDisplayField(entity);
  if (!field) return record.id;
  const value = record.data[field.id];
  return typeof value === "string" && value.length > 0 ? value : record.id;
}

/** Always called (Rules of Hooks) — a falsy `targetEntityId` (non-relation fields) short-circuits without fetching. */
function useRelationOptions(appId: string, targetEntityId: string | undefined, targetEntity: EntityType | undefined, simulateRoleId: string | undefined) {
  const [options, setOptions] = useState<Array<{ value: string; label: string }>>([]);
  const [loading, setLoading] = useState(Boolean(targetEntityId));

  useEffect(() => {
    if (!targetEntityId) {
      setOptions([]);
      setLoading(false);
      return;
    }
    let cancelled = false;
    setLoading(true);
    listRecords(appId, targetEntityId, { pageSize: 100 }, simulateRoleId)
      .then((res) => {
        if (cancelled) return;
        setOptions(res.records.map((r) => ({ value: r.id, label: displayLabelFor(targetEntity, r) })));
      })
      .catch(() => {
        if (!cancelled) setOptions([]);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [appId, targetEntityId, simulateRoleId]);

  return { options, loading };
}

export interface FieldControlProps {
  appId: string;
  field: FieldType;
  value: unknown;
  onChange: (value: unknown) => void;
  componentId: string;
  relationTargetEntity?: EntityType;
  simulateRoleId: string | undefined;
  error?: string;
}

/** A live, controlled input for one field — the interactive counterpart to `@asafarim/appbuilder-runtime`'s always-disabled `FieldControl` (M06). File/image fields are not yet supported here (no live upload UI ships with this milestone — see docs/appbuilder-m09-data-engine.md#deferred-to-m10). */
export function LiveFieldControl({ appId, field, value, onChange, componentId, relationTargetEntity, simulateRoleId, error }: FieldControlProps) {
  const fieldElementId = `${componentId}-${field.id}`;
  const hintId = `${fieldElementId}-hint`;
  const errorId = `${fieldElementId}-error`;
  const describedBy = [hintId, error ? errorId : null].filter(Boolean).join(" ") || undefined;

  const relationOptions = useRelationOptions(appId, field.type === "relation" ? relationTargetEntity?.id : undefined, relationTargetEntity, simulateRoleId);

  const control = (() => {
    switch (field.type) {
      case "longText":
        return <Textarea id={fieldElementId} value={typeof value === "string" ? value : ""} onChange={(e) => onChange(e.target.value)} aria-describedby={describedBy} aria-invalid={!!error} />;
      case "boolean":
        return <input id={fieldElementId} type="checkbox" checked={Boolean(value)} onChange={(e) => onChange(e.target.checked)} aria-describedby={describedBy} />;
      case "select":
        return (
          <Select
            id={fieldElementId}
            value={typeof value === "string" ? value : ""}
            onChange={(e) => onChange(e.target.value)}
            aria-describedby={describedBy}
            aria-invalid={!!error}
            options={[{ value: "", label: "Select…" }, ...field.options.map((o) => ({ value: o.value, label: o.label }))]}
          />
        );
      case "date":
        return <Input id={fieldElementId} type="date" value={typeof value === "string" ? value : ""} onChange={(e) => onChange(e.target.value)} aria-describedby={describedBy} aria-invalid={!!error} />;
      case "datetime":
        return <Input id={fieldElementId} type="datetime-local" value={typeof value === "string" ? value.slice(0, 16) : ""} onChange={(e) => onChange(new Date(e.target.value).toISOString())} aria-describedby={describedBy} aria-invalid={!!error} />;
      case "integer":
      case "decimal":
        return (
          <Input
            id={fieldElementId}
            type="number"
            value={typeof value === "number" ? value : ""}
            onChange={(e) => onChange(e.target.value === "" ? undefined : field.type === "integer" ? parseInt(e.target.value, 10) : parseFloat(e.target.value))}
            aria-describedby={describedBy}
            aria-invalid={!!error}
          />
        );
      case "email":
        return <Input id={fieldElementId} type="email" value={typeof value === "string" ? value : ""} onChange={(e) => onChange(e.target.value)} aria-describedby={describedBy} aria-invalid={!!error} />;
      case "url":
        return <Input id={fieldElementId} type="url" value={typeof value === "string" ? value : ""} onChange={(e) => onChange(e.target.value)} aria-describedby={describedBy} aria-invalid={!!error} />;
      case "relation":
        return (
          <Select
            id={fieldElementId}
            value={typeof value === "string" ? value : ""}
            onChange={(e) => onChange(e.target.value || undefined)}
            aria-describedby={describedBy}
            aria-invalid={!!error}
            options={[{ value: "", label: relationOptions.loading ? "Loading…" : "None" }, ...relationOptions.options]}
          />
        );
      case "file":
      case "image":
        return <p className="ab-hint">File/image fields aren&apos;t editable in live preview yet.</p>;
      default:
        return <Input id={fieldElementId} type="text" value={typeof value === "string" ? value : ""} onChange={(e) => onChange(e.target.value)} aria-describedby={describedBy} aria-invalid={!!error} />;
    }
  })();

  return (
    <FormRow>
      <Label htmlFor={fieldElementId}>
        {field.name}
        {field.required ? " *" : ""}
      </Label>
      {control}
      {error ? (
        <p id={errorId} className="ui-field-error" role="alert">
          {error}
        </p>
      ) : (
        <FieldHint id={hintId}>{field.type === "relation" ? `Links to another ${field.name.toLowerCase()} record.` : " "}</FieldHint>
      )}
    </FormRow>
  );
}
