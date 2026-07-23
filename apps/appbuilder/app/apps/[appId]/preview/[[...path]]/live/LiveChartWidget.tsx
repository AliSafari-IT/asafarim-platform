"use client";

import { useEffect, useState } from "react";
import type { EntityType } from "@asafarim/appbuilder-schema";
import { getGroupedCounts } from "./apiClient";

export interface LiveChartWidgetProps {
  appId: string;
  entity: EntityType;
  groupByFieldId: string;
  simulateRoleId: string | undefined;
}

/** Live equivalent of M06's ChartWidgetRenderer — real, permission-scoped grouped counts rendered as the same accessible bar chart markup (role="img" + visually-hidden data table). */
export function LiveChartWidget({ appId, entity, groupByFieldId, simulateRoleId }: LiveChartWidgetProps) {
  const [counts, setCounts] = useState<Array<{ value: string; label: string; count: number }> | null>(null);

  useEffect(() => {
    let cancelled = false;
    getGroupedCounts(appId, entity.id, groupByFieldId, simulateRoleId)
      .then((res) => {
        if (!cancelled) setCounts(res.counts);
      })
      .catch(() => {
        if (!cancelled) setCounts([]);
      });
    return () => {
      cancelled = true;
    };
  }, [appId, entity.id, groupByFieldId, simulateRoleId]);

  if (!counts) return <p className="ab-hint">Loading chart…</p>;
  if (counts.length === 0) return <p className="ab-hint">No chart data yet.</p>;

  const max = Math.max(...counts.map((c) => c.count), 1);
  const summary = counts.map((c) => `${c.label}: ${c.count}`).join(", ");

  return (
    <div className="ab-chart" role="img" aria-label={`${entity.name} by field — ${summary}`}>
      <ul className="ab-chart__bars" aria-hidden="true">
        {counts.map((entry) => (
          <li key={entry.value}>
            <span className="ab-chart__bar" style={{ width: `${(entry.count / max) * 100}%` }} />
            <label>{entry.label}</label>
          </li>
        ))}
      </ul>
      <table className="ab-visually-hidden">
        <caption>{entity.name} counts</caption>
        <thead>
          <tr>
            <th scope="col">Value</th>
            <th scope="col">Count</th>
          </tr>
        </thead>
        <tbody>
          {counts.map((entry) => (
            <tr key={entry.value}>
              <td>{entry.label}</td>
              <td>{entry.count}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
