"use client";

import type { EntityType } from "@asafarim/appbuilder-schema";
import { labelForFieldValue } from "@asafarim/appbuilder-runtime";
import { useEntityRecords } from "./useEntityRecords";

export interface LiveCalendarProps {
  appId: string;
  entityId: string;
  entity: EntityType;
  dateFieldId: string;
  titleFieldId?: string;
  simulateRoleId: string | undefined;
  refreshToken: number;
}

/** Live, read-only agenda-list grouping of real records by a date field — same layout as M06's CalendarRenderer, real data instead of demo rows. */
export function LiveCalendar({ appId, entityId, entity, dateFieldId, titleFieldId, simulateRoleId, refreshToken }: LiveCalendarProps) {
  const dateField = entity.fields.find((f) => !f.archived && f.id === dateFieldId);
  const titleField = entity.fields.find((f) => !f.archived && f.id === titleFieldId);
  const { records, loading, error } = useEntityRecords(appId, entityId, { pageSize: 100, sortFieldId: dateFieldId, sortDirection: "asc" }, simulateRoleId, refreshToken);

  if (!dateField || (dateField.type !== "date" && dateField.type !== "datetime")) {
    return <p className="ab-hint">Schedule misconfigured — its date field must be a date/datetime field.</p>;
  }
  if (loading) return <p className="ab-hint">Loading…</p>;
  if (error) return <p className="ui-field-error" role="alert">{error}</p>;

  const grouped = new Map<string, typeof records>();
  for (const record of records) {
    const raw = String(record.data[dateField.id] ?? "").slice(0, 10);
    if (!raw) continue;
    grouped.set(raw, [...(grouped.get(raw) ?? []), record]);
  }

  const days = [...grouped.entries()].sort(([a], [b]) => a.localeCompare(b));
  if (days.length === 0) return <p className="ab-hint">Nothing scheduled yet.</p>;

  return (
    <div className="ab-calendar" aria-label={`${entity.name} schedule`}>
      {days.map(([date, items]) => (
        <section key={date} className="ab-calendar__day">
          <h4>{date}</h4>
          <ul>
            {items.map((r) => (
              <li key={r.id}>{titleField ? labelForFieldValue(titleField, r.data[titleField.id]) : `${entity.name} ${r.id}`}</li>
            ))}
          </ul>
        </section>
      ))}
    </div>
  );
}
