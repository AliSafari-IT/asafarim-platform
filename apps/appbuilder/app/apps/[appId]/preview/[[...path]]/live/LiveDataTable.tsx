"use client";

import { useMemo, useState } from "react";
import type { ApplicationSpecificationType, EntityType, FieldType } from "@asafarim/appbuilder-schema";
import { labelForFieldValue, RENDER_LIMITS } from "@asafarim/appbuilder-runtime";
import { Badge, Button, Input, Select } from "@asafarim/ui";
import { archiveRecord, restoreRecord } from "./apiClient";
import { useEntityRecords } from "./useEntityRecords";
import { hasLivePermission } from "./liveAuth";
import { LiveApiError, type GeneratedRecord } from "./types";

function visibleFields(entity: EntityType, fieldIds: string[] | undefined): FieldType[] {
  const all = entity.fields.filter((field) => !field.archived && field.type !== "longText");
  if (!fieldIds || fieldIds.length === 0) return all.slice(0, RENDER_LIMITS.MAX_TABLE_COLUMNS);
  const known = new Set(all.map((field) => field.id));
  return fieldIds
    .filter((id) => known.has(id))
    .slice(0, RENDER_LIMITS.MAX_TABLE_COLUMNS)
    .map((id) => all.find((field) => field.id === id)!);
}

export interface LiveDataTableProps {
  appId: string;
  entityId: string;
  entity: EntityType;
  spec: ApplicationSpecificationType;
  roleIds: string[];
  simulateRoleId: string | undefined;
  fieldIds?: string[];
  selectedRecordId?: string | null;
  onSelectRecord?: (recordId: string) => void;
  refreshToken: number;
  onMutated: () => void;
}

/** Live, interactive equivalent of M06's DataTableRenderer — real fetched rows, sortable columns, bounded search/filter, and (permission-gated) archive/restore. */
export function LiveDataTable({ appId, entityId, entity, spec, roleIds, simulateRoleId, fieldIds, selectedRecordId, onSelectRecord, refreshToken, onMutated }: LiveDataTableProps) {
  const columns = visibleFields(entity, fieldIds);
  const filterableField = entity.fields.find((f): f is Extract<FieldType, { type: "select" }> => !f.archived && f.type === "select");

  const [page, setPage] = useState(1);
  const [sortFieldId, setSortFieldId] = useState<string | undefined>(undefined);
  const [sortDirection, setSortDirection] = useState<"asc" | "desc">("asc");
  const [search, setSearch] = useState("");
  const [filterValue, setFilterValue] = useState("");
  const [includeArchived, setIncludeArchived] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);
  const [busyRecordId, setBusyRecordId] = useState<string | null>(null);

  const params = useMemo(
    () => ({
      page,
      pageSize: 10,
      sortFieldId,
      sortDirection,
      search: search || undefined,
      filterFieldId: filterableField && filterValue ? filterableField.id : undefined,
      filterValue: filterValue || undefined,
      includeArchived,
    }),
    [page, sortFieldId, sortDirection, search, filterableField, filterValue, includeArchived],
  );

  const { records, total, loading, error, refetch } = useEntityRecords(appId, entityId, params, simulateRoleId, refreshToken);
  const canDelete = hasLivePermission(spec, roleIds, entityId, "delete");
  const canUpdate = hasLivePermission(spec, roleIds, entityId, "update");

  function toggleSort(fieldId: string) {
    if (sortFieldId === fieldId) {
      setSortDirection((d) => (d === "asc" ? "desc" : "asc"));
    } else {
      setSortFieldId(fieldId);
      setSortDirection("asc");
    }
  }

  async function handleArchive(record: GeneratedRecord) {
    setBusyRecordId(record.id);
    setActionError(null);
    try {
      await archiveRecord(appId, entityId, record.id, simulateRoleId);
      refetch();
      onMutated();
    } catch (err) {
      setActionError(err instanceof LiveApiError ? err.message : "Failed to archive record.");
    } finally {
      setBusyRecordId(null);
    }
  }

  async function handleRestore(record: GeneratedRecord) {
    setBusyRecordId(record.id);
    setActionError(null);
    try {
      await restoreRecord(appId, entityId, record.id, simulateRoleId);
      refetch();
      onMutated();
    } catch (err) {
      setActionError(err instanceof LiveApiError ? err.message : "Failed to restore record.");
    } finally {
      setBusyRecordId(null);
    }
  }

  const pageCount = Math.max(1, Math.ceil(total / params.pageSize));

  return (
    <div className="ab-live-table">
      <div className="ab-live-table__toolbar" role="search" aria-label={`Filter ${entity.name}`}>
        <Input
          type="search"
          aria-label={`Search ${entity.name.toLowerCase()}`}
          placeholder={`Search ${entity.name.toLowerCase()}...`}
          value={search}
          onChange={(e) => {
            setPage(1);
            setSearch(e.target.value);
          }}
        />
        {filterableField ? (
          <Select
            aria-label={`Filter by ${filterableField.name}`}
            value={filterValue}
            onChange={(e) => {
              setPage(1);
              setFilterValue(e.target.value);
            }}
            options={[{ value: "", label: `All ${filterableField.name.toLowerCase()}` }, ...filterableField.options.map((o) => ({ value: o.value, label: o.label }))]}
          />
        ) : null}
        {canDelete ? (
          <label className="ab-live-table__archived-toggle">
            <input type="checkbox" checked={includeArchived} onChange={(e) => setIncludeArchived(e.target.checked)} /> Show archived
          </label>
        ) : null}
      </div>

      {error ? <p className="ab-hint" role="alert">{error}</p> : null}
      {actionError ? <p className="ab-hint" role="alert">{actionError}</p> : null}

      <div className="ab-table-wrap" role="region" aria-label={`${entity.name} table`} tabIndex={0}>
        <table className="ab-table">
          <caption className="ab-visually-hidden">{entity.name} records</caption>
          <thead>
            <tr>
              {columns.map((field) => (
                <th key={field.id} scope="col" aria-sort={sortFieldId === field.id ? (sortDirection === "asc" ? "ascending" : "descending") : "none"}>
                  <button type="button" className="ab-live-table__sort" onClick={() => toggleSort(field.id)}>
                    {field.name}
                    {sortFieldId === field.id ? (sortDirection === "asc" ? " ▲" : " ▼") : ""}
                  </button>
                </th>
              ))}
              <th scope="col">Status</th>
              {canDelete || canUpdate ? <th scope="col">Actions</th> : null}
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr>
                <td colSpan={columns.length + 2}>Loading…</td>
              </tr>
            ) : records.length === 0 ? (
              <tr>
                <td colSpan={columns.length + 2}>No {entity.name.toLowerCase()} records yet.</td>
              </tr>
            ) : (
              records.map((record) => (
                <tr
                  key={record.id}
                  onClick={onSelectRecord ? () => onSelectRecord(record.id) : undefined}
                  aria-current={selectedRecordId === record.id ? "true" : undefined}
                  className={onSelectRecord ? "ab-live-table__row--clickable" : undefined}
                  style={onSelectRecord ? { cursor: "pointer" } : undefined}
                >
                  {columns.map((field) => (
                    <td key={field.id}>{labelForFieldValue(field, record.data[field.id])}</td>
                  ))}
                  <td>
                    <Badge tone={record.status === "active" ? "success" : "neutral"}>{record.status}</Badge>
                  </td>
                  {canDelete || canUpdate ? (
                    <td>
                      {record.status === "active" && canDelete ? (
                        <Button type="button" variant="secondary" disabled={busyRecordId === record.id} onClick={(e) => { e.stopPropagation(); handleArchive(record); }}>
                          Archive
                        </Button>
                      ) : null}
                      {record.status === "archived" && canUpdate ? (
                        <Button type="button" variant="secondary" disabled={busyRecordId === record.id} onClick={(e) => { e.stopPropagation(); handleRestore(record); }}>
                          Restore
                        </Button>
                      ) : null}
                    </td>
                  ) : null}
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      <div className="ab-live-table__pager">
        <Button type="button" variant="secondary" disabled={page <= 1} onClick={() => setPage((p) => p - 1)}>
          Previous
        </Button>
        <span className="ab-hint">
          Page {page} of {pageCount} ({total} total)
        </span>
        <Button type="button" variant="secondary" disabled={page >= pageCount} onClick={() => setPage((p) => p + 1)}>
          Next
        </Button>
      </div>
    </div>
  );
}
