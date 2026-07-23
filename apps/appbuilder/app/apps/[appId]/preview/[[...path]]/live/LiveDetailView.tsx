"use client";

import { useEffect, useState } from "react";
import type { ApplicationSpecificationType, EntityType, FieldType } from "@asafarim/appbuilder-schema";
import { labelForFieldValue, RENDER_LIMITS } from "@asafarim/appbuilder-runtime";
import { Badge, Button } from "@asafarim/ui";
import { archiveRecord, getRecord, restoreRecord, updateRecord } from "./apiClient";
import { LiveFieldControl, displayLabelFor } from "./fieldControls";
import { hasLivePermission } from "./liveAuth";
import { LiveApiError, type GeneratedRecord } from "./types";

function visibleFields(entity: EntityType, fieldIds: string[] | undefined): FieldType[] {
  const all = entity.fields.filter((field) => !field.archived);
  if (!fieldIds || fieldIds.length === 0) return all.slice(0, RENDER_LIMITS.MAX_FORM_FIELDS);
  const known = new Set(all.map((field) => field.id));
  return fieldIds
    .filter((id) => known.has(id))
    .slice(0, RENDER_LIMITS.MAX_FORM_FIELDS)
    .map((id) => all.find((field) => field.id === id)!);
}

function RelatedRecordLabel({ appId, targetEntity, recordId, simulateRoleId }: { appId: string; targetEntity: EntityType; recordId: string; simulateRoleId: string | undefined }) {
  const [label, setLabel] = useState<string>("…");
  useEffect(() => {
    let cancelled = false;
    getRecord(appId, targetEntity.id, recordId, simulateRoleId)
      .then((res) => {
        if (!cancelled) setLabel(displayLabelFor(targetEntity, res.record));
      })
      .catch(() => {
        if (!cancelled) setLabel("(not accessible)");
      });
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [appId, targetEntity.id, recordId, simulateRoleId]);
  return <>{label}</>;
}

export interface LiveDetailViewProps {
  appId: string;
  entityId: string;
  entity: EntityType;
  spec: ApplicationSpecificationType;
  roleIds: string[];
  recordId: string | null;
  simulateRoleId: string | undefined;
  fieldIds?: string[];
  refreshToken: number;
  onMutated: () => void;
}

/** Live, interactive equivalent of M06's DetailViewRenderer — fetches a real record, resolves relation fields to their target's display label, and supports inline edit/save (optimistic concurrency) plus archive/restore. */
export function LiveDetailView({ appId, entityId, entity, spec, roleIds, recordId, simulateRoleId, fieldIds, refreshToken, onMutated }: LiveDetailViewProps) {
  const fields = visibleFields(entity, fieldIds);
  const [record, setRecord] = useState<GeneratedRecord | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [editing, setEditing] = useState(false);
  const [values, setValues] = useState<Record<string, unknown>>({});
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!recordId) {
      setRecord(null);
      return;
    }
    let cancelled = false;
    setLoading(true);
    setError(null);
    getRecord(appId, entityId, recordId, simulateRoleId)
      .then((res) => {
        if (cancelled) return;
        setRecord(res.record);
        setEditing(false);
      })
      .catch((err) => {
        if (!cancelled) setError(err instanceof LiveApiError ? err.message : "Failed to load record.");
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [appId, entityId, recordId, simulateRoleId, refreshToken]);

  function relationTarget(field: FieldType): EntityType | undefined {
    if (field.type !== "relation") return undefined;
    const relation = spec.relations.find((r) => r.id === field.relationId && !r.archived);
    return relation ? spec.entities.find((e) => e.id === relation.toEntityId && !e.archived) : undefined;
  }

  function startEdit() {
    if (!record) return;
    setValues({ ...record.data });
    setFieldErrors({});
    setEditing(true);
  }

  async function handleSave() {
    if (!record) return;
    setSaving(true);
    setFieldErrors({});
    try {
      const res = await updateRecord(appId, entityId, record.id, values, record.revision, simulateRoleId);
      setRecord(res.record);
      setEditing(false);
      onMutated();
    } catch (err) {
      if (err instanceof LiveApiError && err.payload.errors) {
        const byField: Record<string, string> = {};
        for (const issue of err.payload.errors) byField[issue.field] = issue.message;
        setFieldErrors(byField);
      } else if (err instanceof LiveApiError && err.payload.code === "stale_revision") {
        setError("This record changed elsewhere since you started editing — reload and try again.");
      } else {
        setError(err instanceof LiveApiError ? err.message : "Failed to save record.");
      }
    } finally {
      setSaving(false);
    }
  }

  async function handleArchive() {
    if (!record) return;
    setBusy(true);
    try {
      const res = await archiveRecord(appId, entityId, record.id, simulateRoleId);
      setRecord(res.record);
      onMutated();
    } catch (err) {
      setError(err instanceof LiveApiError ? err.message : "Failed to archive record.");
    } finally {
      setBusy(false);
    }
  }

  async function handleRestore() {
    if (!record) return;
    setBusy(true);
    try {
      const res = await restoreRecord(appId, entityId, record.id, simulateRoleId);
      setRecord(res.record);
      onMutated();
    } catch (err) {
      setError(err instanceof LiveApiError ? err.message : "Failed to restore record.");
    } finally {
      setBusy(false);
    }
  }

  const canUpdate = hasLivePermission(spec, roleIds, entityId, "update");
  const canDelete = hasLivePermission(spec, roleIds, entityId, "delete");

  if (!recordId) {
    return <p className="ab-hint">Select a {entity.name.toLowerCase()} above to see its details.</p>;
  }
  if (loading) return <p className="ab-hint">Loading…</p>;
  if (error && !record) return <p className="ui-field-error" role="alert">{error}</p>;
  if (!record) return null;

  if (editing) {
    return (
      <div className="ab-detail" aria-label={`Edit ${entity.name}`}>
        {error ? <p className="ui-field-error" role="alert">{error}</p> : null}
        {fields.map((field) => (
          <LiveFieldControl
            key={field.id}
            appId={appId}
            field={field}
            value={values[field.id]}
            onChange={(value) => setValues((v) => ({ ...v, [field.id]: value }))}
            componentId={`${entity.id}-edit`}
            relationTargetEntity={relationTarget(field)}
            simulateRoleId={simulateRoleId}
            error={fieldErrors[field.id]}
          />
        ))}
        <div className="ab-detail__actions">
          <Button type="button" disabled={saving} onClick={handleSave}>
            {saving ? "Saving…" : "Save"}
          </Button>
          <Button type="button" variant="secondary" disabled={saving} onClick={() => setEditing(false)}>
            Cancel
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div>
      {error ? <p className="ui-field-error" role="alert">{error}</p> : null}
      <dl className="ab-detail" aria-label={`${entity.name} detail`}>
        {fields.map((field) => {
          const target = relationTarget(field);
          const value = record.data[field.id];
          return (
            <div className="ab-detail__row" key={field.id}>
              <dt>{field.name}</dt>
              <dd>{target && typeof value === "string" && value ? <RelatedRecordLabel appId={appId} targetEntity={target} recordId={value} simulateRoleId={simulateRoleId} /> : labelForFieldValue(field, value)}</dd>
            </div>
          );
        })}
        <div className="ab-detail__row">
          <dt>Status</dt>
          <dd>
            <Badge tone={record.status === "active" ? "success" : "neutral"}>{record.status}</Badge>
          </dd>
        </div>
      </dl>
      <div className="ab-detail__actions">
        {canUpdate && record.status === "active" ? (
          <Button type="button" variant="secondary" onClick={startEdit}>
            Edit
          </Button>
        ) : null}
        {canDelete && record.status === "active" ? (
          <Button type="button" variant="danger" disabled={busy} onClick={handleArchive}>
            Archive
          </Button>
        ) : null}
        {canUpdate && record.status === "archived" ? (
          <Button type="button" variant="secondary" disabled={busy} onClick={handleRestore}>
            Restore
          </Button>
        ) : null}
      </div>
    </div>
  );
}
