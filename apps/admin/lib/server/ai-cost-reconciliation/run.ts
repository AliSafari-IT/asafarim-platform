import {
  ALL_MODELS,
  DEFAULT_RECONCILIATION_POLICY,
  DRIFT_STATUSES,
  reconcile,
  reconciliationFingerprint,
  summarizeReconciliation,
  type InternalDailyLine,
  type ProviderCostAdapter,
  type ReconciliationLine,
  type ReconciliationPolicy,
} from "@asafarim/ai-cost-ledger";
import type { InternalSource } from "./internal-sources";

/**
 * The reconciliation job (#592): fetch provider daily reports and every
 * app's internal daily totals for a window, reconcile, and append report
 * lines whose numbers changed since the last observation.
 *
 * Guarantees:
 *  - Read-only against every app's cost events. Nothing here writes an
 *    adjustment row or touches a price snapshot; drift is reported, and
 *    the unattributed remainder stays at provider/day level.
 *  - Rerunnable: the same window over unchanged data inserts nothing;
 *    `(runId, provider, account, day, model)` is unique, so a retried
 *    insert inside one run is a no-op too.
 *  - One run at a time: a run still `running` and younger than
 *    `STALE_RUN_MS` blocks a new one (a crashed run stops blocking after that).
 *  - Operational output (log line, alert) carries counts and amounts only.
 */

export const STALE_RUN_MS = 15 * 60_000;

export type RunStatus = "running" | "succeeded" | "partial" | "failed";

export interface SourceState {
  kind: "provider" | "internal";
  key: string;
  status: "ok" | "unsupported" | "unavailable";
  fetchedAt?: string;
  pagesFetched?: number;
  /** Reason for unsupported/unavailable — never a credential or response body. */
  error?: string;
}

export interface StoredLine extends ReconciliationLine {
  fingerprint: string;
}

export interface ReconciliationStore {
  findActiveRun(since: Date): Promise<{ id: string } | null>;
  createRun(input: { trigger: "manual" | "scheduled"; triggeredBy: string | null; startDay: string; endDay: string }): Promise<{ id: string }>;
  /** Latest fingerprint per `provider|account|day|model` within the window. */
  latestFingerprints(window: { startDay: string; endDay: string }): Promise<Map<string, string>>;
  insertLines(runId: string, lines: StoredLine[]): Promise<number>;
  finishRun(
    runId: string,
    result: { status: Exclude<RunStatus, "running">; sources: SourceState[]; summary: Record<string, unknown> | null; error: string | null },
  ): Promise<void>;
}

export interface RunDeps {
  store: ReconciliationStore;
  adapters: ProviderCostAdapter[];
  internalSources: InternalSource[];
  policy?: ReconciliationPolicy;
  now?: () => Date;
  alert?: (message: string) => Promise<void>;
  log?: (record: Record<string, unknown>) => void;
}

export type RunOutcome =
  | { started: false; reason: "already_running"; activeRunId: string }
  | { started: true; runId: string; status: Exclude<RunStatus, "running">; inserted: number; newDriftDays: number };

export function lineKey(line: Pick<ReconciliationLine, "provider" | "accountKey" | "day" | "modelKey">): string {
  return [line.provider, line.accountKey, line.day, line.modelKey].join("|");
}

function micros(v: bigint): string {
  return v.toString();
}

function usd(v: bigint): string {
  const negative = v < BigInt("0");
  const abs = negative ? -v : v;
  const cents = (abs + BigInt("5000")) / BigInt("10000");
  return `${negative ? "-" : ""}$${cents / BigInt("100")}.${(cents % BigInt("100")).toString().padStart(2, "0")}`;
}

export async function runReconciliation(
  input: { trigger: "manual" | "scheduled"; triggeredBy: string | null; window: { startDay: string; endDay: string } },
  deps: RunDeps,
): Promise<RunOutcome> {
  const now = deps.now ?? (() => new Date());
  const log = deps.log ?? ((record) => console.info(JSON.stringify(record)));
  const { store, window } = { store: deps.store, window: input.window };

  const active = await store.findActiveRun(new Date(now().getTime() - STALE_RUN_MS));
  if (active) return { started: false, reason: "already_running", activeRunId: active.id };

  const { id: runId } = await store.createRun({ trigger: input.trigger, triggeredBy: input.triggeredBy, ...window });
  const sources: SourceState[] = [];

  try {
    const [internalResults, providerResults] = await Promise.all([
      Promise.all(deps.internalSources.map((s) => s.fetchDaily(window))),
      Promise.all(deps.adapters.map(async (a) => ({ adapter: a, result: await a.fetchDailyCosts(window) }))),
    ]);

    const internal: InternalDailyLine[] = [];
    let internalComplete = true;
    for (const r of internalResults) {
      if (r.status === "ok") {
        internal.push(...r.lines);
        sources.push({ kind: "internal", key: r.app, status: "ok", fetchedAt: r.fetchedAt.toISOString() });
      } else {
        internalComplete = false;
        sources.push({ kind: "internal", key: r.app, status: "unavailable", error: r.error });
      }
    }

    const lines: ReconciliationLine[] = [];
    for (const { adapter, result } of providerResults) {
      const key = `${adapter.provider}:${adapter.accountKey}`;
      if (result.status === "ok") {
        sources.push({ kind: "provider", key, status: "ok", fetchedAt: result.fetchedAt.toISOString(), pagesFetched: result.pagesFetched });
      } else if (result.status === "unsupported") {
        sources.push({ kind: "provider", key, status: "unsupported", error: result.reason });
      } else {
        sources.push({ kind: "provider", key, status: "unavailable", error: result.error });
      }
      lines.push(
        ...reconcile({
          provider: adapter.provider,
          accountKey: adapter.accountKey,
          window,
          providerResult: result,
          internal,
          internalComplete,
          policy: deps.policy ?? DEFAULT_RECONCILIATION_POLICY,
          now: now(),
        }),
      );
    }

    const latest = await store.latestFingerprints(window);
    const changed: StoredLine[] = lines
      .map((line) => ({ ...line, fingerprint: reconciliationFingerprint(line) }))
      .filter((line) => latest.get(lineKey(line)) !== line.fingerprint);
    const inserted = changed.length > 0 ? await store.insertLines(runId, changed) : 0;

    const summary = summarizeReconciliation(lines);
    const newDrift = changed.filter((l) => l.modelKey === ALL_MODELS && DRIFT_STATUSES.has(l.status));
    const degraded = sources.some((s) => s.status === "unavailable");
    const status = degraded ? "partial" : "succeeded";
    const summaryJson = {
      dayCount: summary.dayCount,
      lineCount: summary.lineCount,
      byStatus: summary.byStatus,
      driftDays: summary.driftDays,
      newDriftDays: newDrift.length,
      insertedLines: inserted,
      providerMicros: micros(summary.providerMicros),
      internalKnownMicros: micros(summary.internalKnownMicros),
      unattributedMicros: micros(summary.unattributedMicros),
    };
    await store.finishRun(runId, { status, sources, summary: summaryJson, error: null });

    log({
      event: "ai_cost_reconciliation",
      runId,
      status,
      window,
      ...summaryJson,
      sources: sources.map((s) => ({ key: `${s.kind}:${s.key}`, status: s.status })),
    });

    if (deps.alert && (newDrift.length > 0 || degraded)) {
      const parts = [`**AI cost reconciliation** ${window.startDay} → ${window.endDay}: ${status}`];
      for (const d of newDrift) {
        parts.push(
          `• ${d.provider} ${d.day}: ${d.status.replaceAll("_", " ")} — provider ${d.providerMicros === null ? "n/a" : usd(d.providerMicros)}, internal ${usd(d.internalKnownMicros)}`,
        );
      }
      for (const s of sources.filter((x) => x.status === "unavailable")) parts.push(`• ${s.kind} ${s.key} unavailable (${s.error})`);
      await deps.alert(parts.join("\n"));
    }

    return { started: true, runId, status, inserted, newDriftDays: newDrift.length };
  } catch (error) {
    const message = error instanceof RangeError ? error.message : "reconciliation failed";
    await store.finishRun(runId, { status: "failed", sources, summary: null, error: message });
    log({ event: "ai_cost_reconciliation", runId, status: "failed", window, error: message });
    if (deps.alert) await deps.alert(`**AI cost reconciliation** ${window.startDay} → ${window.endDay}: failed (${message})`);
    return { started: true, runId, status: "failed", inserted: 0, newDriftDays: 0 };
  }
}
