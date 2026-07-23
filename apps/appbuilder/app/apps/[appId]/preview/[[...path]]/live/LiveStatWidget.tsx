"use client";

import { useEffect, useState } from "react";
import type { EntityType } from "@asafarim/appbuilder-schema";
import { Metric } from "@asafarim/ui";
import { getDashboardCounts } from "./apiClient";

export interface LiveStatWidgetProps {
  appId: string;
  entity: EntityType;
  label?: string;
  filter?: string;
  simulateRoleId: string | undefined;
}

/** Live equivalent of M06's StatWidgetRenderer — a real, permission-scoped count instead of a deterministic demo number. */
export function LiveStatWidget({ appId, entity, label, filter, simulateRoleId }: LiveStatWidgetProps) {
  const [value, setValue] = useState<number | null>(null);

  useEffect(() => {
    let cancelled = false;
    getDashboardCounts(appId, [entity.id], simulateRoleId)
      .then((res) => {
        if (cancelled) return;
        setValue(res.counts.find((c) => c.entityId === entity.id)?.count ?? 0);
      })
      .catch(() => {
        if (!cancelled) setValue(null);
      });
    return () => {
      cancelled = true;
    };
  }, [appId, entity.id, simulateRoleId]);

  return <Metric label={label ?? `${entity.name} — count`} value={value ?? "…"} hint={filter ? `Filter: ${filter}` : "Live data"} />;
}
