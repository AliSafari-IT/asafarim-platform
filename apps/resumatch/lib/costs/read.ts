import {
  addRow,
  decodeCursor,
  effectiveCost,
  emptyTotals,
  encodeCursor,
  legacyUsdFloatToMicros,
  totalsToDTO,
  type AggregatableRow,
  type CostGroupDTO,
  type CostStatusFilter,
  type CostTimelineResponse,
  type CostTotals,
  type ResolvedRange,
  type TimelineItemDTO,
  type UsageLine,
} from "@asafarim/ai-cost-ledger";
import { getJobmatchDb } from "../db/client";

/**
 * ResuMatch cost read model (issues #586/#587).
 *
 * **Scoping:** every query takes the workspace id as its first argument
 * and filters on it in SQL; callers derive it from the session
 * (`getCurrentWorkspace()`), never from request input. A job id supplied
 * by the client is only ever used *inside* that workspace filter, so a
 * foreign job id simply matches nothing.
 *
 * **Two sources, one timeline.** `AiCostEvent` rows (canonical, attributed)
 * plus pre-#586 `AiUsageLedger` rows, surfaced as `legacy` — counted in
 * totals as the float estimate they always were, flagged so coverage
 * reads "partial", and grouped as "unattributed" because they never
 * recorded which job they served. Nothing is invented for them.
 *
 * **Aggregation is over the whole filter, pagination only slices the
 * timeline**, so a page-size change never moves a total. Rows are loaded
 * with a narrow select over a date range already clamped to ≤ 366 days;
 * a single candidate's AI history is small enough that aggregating in
 * the server process is cheaper than two SQL paths, and `MAX_ROWS` fails
 * loudly rather than silently truncating if that ever stops being true.
 */

export const MAX_ROWS = 20_000;

export class CostRangeTooLargeError extends Error {
  constructor() {
    super("too many AI usage rows in this range — narrow the date range");
    this.name = "CostRangeTooLargeError";
  }
}

export interface CostFilter {
  range: ResolvedRange;
  targetJobId?: string | null;
  operations?: string[];
  provider?: string;
  model?: string;
  status?: CostStatusFilter[];
}

export interface CostRow extends AggregatableRow {
  id: string;
  occurredAt: Date;
  operation: string;
  outcome: string;
  provider: string;
  model: string;
  promptVersion: string | null;
  usage: UsageLine[];
  finality: string;
  latencyMs: number | null;
  subjectType: string;
  subjectId: string;
  targetJobId: string | null;
  workflowId: string | null;
  legacy: boolean;
}

function statusOf(row: CostRow): CostStatusFilter {
  if (row.legacy) return "legacy";
  const basis = effectiveCost(row).basis;
  return basis === "adjustment" ? "estimated" : (basis as CostStatusFilter);
}

/** Load every matching row (events + legacy) for one workspace, newest first. */
export async function loadCostRows(workspaceId: string, filter: CostFilter): Promise<CostRow[]> {
  const db = getJobmatchDb();
  const time = { gte: filter.range.from, lt: filter.range.to };

  const events = await db.aiCostEvent.findMany({
    where: {
      workspaceId,
      occurredAt: time,
      ...(filter.targetJobId ? { targetJobId: filter.targetJobId } : {}),
      ...(filter.operations?.length ? { operation: { in: filter.operations } } : {}),
      ...(filter.provider ? { provider: filter.provider } : {}),
      ...(filter.model ? { responseModel: filter.model } : {}),
    },
    select: {
      id: true,
      entryType: true,
      occurredAt: true,
      operation: true,
      outcome: true,
      provider: true,
      responseModel: true,
      promptVersion: true,
      usage: true,
      inputTokens: true,
      outputTokens: true,
      estimatedCostMicros: true,
      actualCostMicros: true,
      adjustmentDeltaMicros: true,
      costSource: true,
      credentialSource: true,
      fixture: true,
      finality: true,
      latencyMs: true,
      subjectType: true,
      subjectId: true,
      targetJobId: true,
      workflowId: true,
    },
    orderBy: [{ occurredAt: "desc" }, { id: "desc" }],
    take: MAX_ROWS + 1,
  });

  // Legacy rows have no job link, so a job filter excludes them by design.
  const legacy = filter.targetJobId
    ? []
    : await db.aiUsageLedger.findMany({
        where: {
          workspaceId,
          createdAt: time,
          ...(filter.operations?.length ? { kind: { in: filter.operations } } : {}),
          ...(filter.provider ? { provider: filter.provider } : {}),
          ...(filter.model ? { model: filter.model } : {}),
        },
        orderBy: [{ createdAt: "desc" }, { id: "desc" }],
        take: MAX_ROWS + 1,
      });

  if (events.length + legacy.length > MAX_ROWS) throw new CostRangeTooLargeError();

  const rows: CostRow[] = [
    ...events.map(
      (e): CostRow => ({
        id: e.id,
        entryType: e.entryType as CostRow["entryType"],
        occurredAt: e.occurredAt,
        operation: e.operation,
        outcome: e.outcome,
        provider: e.provider,
        model: e.responseModel,
        promptVersion: e.promptVersion,
        usage: (e.usage as unknown as UsageLine[]) ?? [],
        inputTokens: e.inputTokens,
        outputTokens: e.outputTokens,
        estimatedCostMicros: e.estimatedCostMicros,
        actualCostMicros: e.actualCostMicros,
        adjustmentDeltaMicros: e.adjustmentDeltaMicros,
        costSource: e.costSource as CostRow["costSource"],
        credentialSource: e.credentialSource as CostRow["credentialSource"],
        fixture: e.fixture,
        finality: e.finality,
        latencyMs: e.latencyMs,
        subjectType: e.subjectType,
        subjectId: e.subjectId,
        targetJobId: e.targetJobId,
        workflowId: e.workflowId,
        legacy: false,
      }),
    ),
    ...legacy.map((l): CostRow => {
      const fixture = l.provider === "fixture";
      return {
        id: `legacy_${l.id}`,
        entryType: "usage",
        occurredAt: l.createdAt,
        operation: l.kind,
        outcome: "succeeded",
        provider: l.provider,
        model: l.model,
        promptVersion: l.promptVersion,
        usage: [
          ...(l.inputTokens > 0 ? [{ bucket: "input" as const, unit: "tokens" as const, quantity: l.inputTokens }] : []),
          ...(l.outputTokens > 0 ? [{ bucket: "output" as const, unit: "tokens" as const, quantity: l.outputTokens }] : []),
        ],
        inputTokens: l.inputTokens,
        outputTokens: l.outputTokens,
        // The float was the adapter's own estimate at the time — still an
        // estimate, now in micros, and flagged legacy.
        estimatedCostMicros: legacyUsdFloatToMicros(l.costUsd),
        actualCostMicros: null,
        adjustmentDeltaMicros: null,
        costSource: "registry_estimate",
        credentialSource: fixture ? "none" : "platform",
        fixture,
        finality: "provisional",
        latencyMs: null,
        subjectType: "unattributed",
        subjectId: l.id,
        targetJobId: null,
        workflowId: null,
        legacy: true,
      };
    }),
  ];

  const filtered = filter.status?.length ? rows.filter((r) => filter.status!.includes(statusOf(r))) : rows;
  return filtered.sort((a, b) => b.occurredAt.getTime() - a.occurredAt.getTime() || (a.id < b.id ? 1 : a.id > b.id ? -1 : 0));
}

/** Group key: one per row, so Σ group subtotals ≡ the grand total. */
export function groupKeyOf(row: CostRow): string {
  if (row.targetJobId) return `job:${row.targetJobId}`;
  if (row.legacy) return "legacy";
  return "profile";
}

export interface JobInfo {
  id: string;
  title: string | null;
  employer: string | null;
  application: { id: string; status: string } | null;
}

/** Labels for the jobs in a result set — workspace-scoped like everything else. */
export async function loadJobInfo(workspaceId: string, jobIds: string[]): Promise<Map<string, JobInfo>> {
  if (jobIds.length === 0) return new Map();
  const db = getJobmatchDb();
  const jobs = await db.targetJob.findMany({
    where: { workspaceId, id: { in: jobIds } },
    select: {
      id: true,
      title: true,
      employer: true,
      applications: { select: { id: true, status: true }, orderBy: { createdAt: "desc" }, take: 1 },
    },
  });
  return new Map(
    jobs.map((j) => [
      j.id,
      { id: j.id, title: j.title, employer: j.employer, application: j.applications[0] ?? null },
    ]),
  );
}

export interface JobCostSubtotal {
  targetJobId: string;
  totals: CostTotals;
}

/** Per-job subtotals for one workspace (the #586 job/application query). */
export async function jobCostSubtotals(workspaceId: string, range: ResolvedRange): Promise<JobCostSubtotal[]> {
  const rows = await loadCostRows(workspaceId, { range });
  const map = new Map<string, CostTotals>();
  for (const row of rows) {
    if (!row.targetJobId) continue;
    const t = map.get(row.targetJobId) ?? emptyTotals();
    addRow(t, row);
    map.set(row.targetJobId, t);
  }
  return [...map.entries()].map(([targetJobId, totals]) => ({ targetJobId, totals }));
}

function toItem(row: CostRow): TimelineItemDTO {
  const { amountMicros, basis } = effectiveCost(row);
  return {
    id: row.id,
    occurredAt: row.occurredAt.toISOString(),
    operation: row.operation,
    outcome: row.outcome,
    provider: row.provider,
    model: row.model,
    promptVersion: row.promptVersion,
    usage: row.usage,
    amountMicros: amountMicros === null ? null : amountMicros.toString(),
    basis,
    costSource: row.costSource,
    credentialSource: row.credentialSource,
    finality: row.finality,
    latencyMs: row.latencyMs,
    legacy: row.legacy,
    subjectType: row.subjectType,
    subjectId: row.subjectId,
    workflowId: row.workflowId,
  };
}

export type ResumatchCostGroup = CostGroupDTO & { application: JobInfo["application"]; deleted: boolean };
export type ResumatchCostTimeline = Omit<CostTimelineResponse, "groups"> & { groups: ResumatchCostGroup[] };

/**
 * The full timeline response: summary + job/profile/legacy groups + one
 * page of line items. `cursor` is the opaque `(occurredAt, id)` of the
 * last item of the previous page.
 */
export async function buildCostTimeline(
  workspaceId: string,
  filter: CostFilter,
  page: { cursor?: string | null; limit: number },
  now: Date = new Date(),
): Promise<ResumatchCostTimeline> {
  const rows = await loadCostRows(workspaceId, filter);

  const summary = emptyTotals();
  const groupTotals = new Map<string, CostTotals>();
  const groupLatest = new Map<string, number>();
  for (const row of rows) {
    addRow(summary, row);
    const key = groupKeyOf(row);
    const t = groupTotals.get(key) ?? emptyTotals();
    addRow(t, row);
    groupTotals.set(key, t);
    groupLatest.set(key, Math.max(groupLatest.get(key) ?? 0, row.occurredAt.getTime()));
  }

  const jobIds = [...groupTotals.keys()].filter((k) => k.startsWith("job:")).map((k) => k.slice(4));
  const jobs = await loadJobInfo(workspaceId, jobIds);

  const groups = [...groupTotals.entries()]
    .sort((a, b) => (groupLatest.get(b[0]) ?? 0) - (groupLatest.get(a[0]) ?? 0))
    .map(([key, totals]) => {
      if (key.startsWith("job:")) {
        const job = jobs.get(key.slice(4));
        return {
          key,
          kind: "job",
          label: job?.title ?? (job ? "Untitled job" : "Deleted job"),
          detail: job?.employer ?? null,
          totals: totalsToDTO(totals),
          application: job?.application ?? null,
          deleted: !job,
        };
      }
      return {
        key,
        kind: key,
        label: key === "legacy" ? "Earlier usage (not linked to a job)" : "CV & profile",
        detail: null,
        totals: totalsToDTO(totals),
        application: null,
        deleted: false,
      };
    });

  const cursor = decodeCursor(page.cursor);
  const start = cursor
    ? rows.findIndex(
        (r) =>
          r.occurredAt.getTime() < cursor.occurredAt.getTime() ||
          (r.occurredAt.getTime() === cursor.occurredAt.getTime() && r.id < cursor.id),
      )
    : 0;
  const pageRows = start < 0 ? [] : rows.slice(start, start + page.limit);
  const last = pageRows.at(-1);
  const hasMore = start >= 0 && start + page.limit < rows.length;

  return {
    range: { from: filter.range.from.toISOString(), to: filter.range.to.toISOString(), preset: filter.range.preset },
    summary: totalsToDTO(summary),
    groups,
    items: pageRows.map(toItem),
    nextCursor: hasMore && last ? encodeCursor({ occurredAt: last.occurredAt, id: last.id }) : null,
    generatedAt: now.toISOString(),
  };
}
