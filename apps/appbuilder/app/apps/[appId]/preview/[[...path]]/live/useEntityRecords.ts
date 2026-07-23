"use client";

import { useCallback, useEffect, useState } from "react";
import { listRecords, type ListRecordsParams } from "./apiClient";
import { LiveApiError, type GeneratedRecord } from "./types";

export interface UseEntityRecordsState {
  records: GeneratedRecord[];
  total: number;
  loading: boolean;
  error: string | null;
  refetch: () => void;
}

/**
 * Shared fetch/refetch state for every live component that lists an
 * entity's records (table, Kanban, calendar). Re-fetches whenever `appId`,
 * `entityId`, `simulateRoleId`, or the query params object identity
 * changes — callers own their own params state and bump it to trigger a
 * refresh (e.g. after a mutation, or on sort/page/search change).
 */
export function useEntityRecords(appId: string, entityId: string, params: ListRecordsParams, simulateRoleId: string | undefined, refreshToken: number): UseEntityRecordsState {
  const [records, setRecords] = useState<GeneratedRecord[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [tick, setTick] = useState(0);

  const paramsKey = JSON.stringify(params);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);
    listRecords(appId, entityId, JSON.parse(paramsKey), simulateRoleId)
      .then((res) => {
        if (cancelled) return;
        setRecords(res.records);
        setTotal(res.total);
      })
      .catch((err) => {
        if (cancelled) return;
        setError(err instanceof LiveApiError ? err.message : "Failed to load records.");
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [appId, entityId, paramsKey, simulateRoleId, refreshToken, tick]);

  const refetch = useCallback(() => setTick((t) => t + 1), []);

  return { records, total, loading, error, refetch };
}
