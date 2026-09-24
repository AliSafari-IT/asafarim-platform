import {
  addRow,
  decodeCursor,
  effectiveCost,
  emptyTotals,
  encodeCursor,
  totalsToDTO,
  type AggregatableRow,
  type CostStatusFilter,
  type CostTotals,
  type CostTotalsDTO,
  type ResolvedRange,
  type TimelineItemDTO,
  type UsageLine,
} from "@asafarim/ai-cost-ledger";
import { prisma } from "@asafarim/db";

/**
 * Vionto AI cost read model (issues #588/#589).
 *
 * **Scope — personal by design.** Every query filters on the viewer's own
 * `userId`. A shared project shows only the viewer's own calls on it; a
 * collaborator's spend (possibly on *their* BYOK key) is never revealed
 * through sharing. That is the explicit permission decision #589 asks for.
 *
 * **Counting rules (the "never double-count" guarantee):**
 *  - the grand total and every project subtotal count each event once;
 *  - an export subtotal counts the events frozen into its
 *    ViontoExportCostEvent snapshot — one event (a story, a clip) can
 *    appear under two exports of the same version, so export subtotals are
 *    *views*, not a partition, and are never summed into a total;
 *  - "project work not attached to a final export" is the partition's
 *    other half: project subtotal = unattached + Σ distinct linked events.
 */

export const MAX_ROWS = 20_000;

export class CostRangeTooLargeError extends Error {
  constructor() {
    super("too many AI usage rows in this range — narrow the date range");
    this.name = "CostRangeTooLargeError";
  }
}

export interface ViontoCostFilter {
  range: ResolvedRange;
  projectId?: string | null;
  exportId?: string | null;
  /** `unattached` narrows a project to events linked to no export. */
  unattachedOnly?: boolean;
  operations?: string[];
  provider?: string;
  model?: string;
  status?: CostStatusFilter[];
  credential?: "platform" | "user_byok" | "none";
}

export interface ViontoCostRow extends AggregatableRow {
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
  projectId: string | null;
  workflowId: string | null;
  exportIds: string[];
  backfilled: boolean;
  legacy: boolean;
}

function statusOf(row: ViontoCostRow): CostStatusFilter {
  const basis = effectiveCost(row).basis;
  return basis === "adjustment" ? "estimated" : (basis as CostStatusFilter);
}

export async function loadViontoCostRows(userId: string, filter: ViontoCostFilter): Promise<ViontoCostRow[]> {
  const events = await prisma.viontoAiCostEvent.findMany({
    where: {
      userId,
      occurredAt: { gte: filter.range.from, lt: filter.range.to },
      ...(filter.projectId ? { projectId: filter.projectId } : {}),
      ...(filter.exportId ? { exports: { some: { exportId: filter.exportId } } } : {}),
      ...(filter.unattachedOnly ? { exports: { none: {} } } : {}),
      ...(filter.operations?.length ? { operation: { in: filter.operations } } : {}),
      ...(filter.provider ? { provider: filter.provider } : {}),
      ...(filter.model ? { responseModel: filter.model } : {}),
      ...(filter.credential ? { credentialSource: filter.credential } : {}),
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
      projectId: true,
      workflowId: true,
      metadata: true,
      exports: { select: { exportId: true } },
    },
    orderBy: [{ occurredAt: "desc" }, { id: "desc" }],
    take: MAX_ROWS + 1,
  });
  if (events.length > MAX_ROWS) throw new CostRangeTooLargeError();

  const rows = events.map((e): ViontoCostRow => {
    const backfilled = Boolean((e.metadata as Record<string, unknown> | null)?.backfilled);
    return {
      id: e.id,
      entryType: e.entryType as ViontoCostRow["entryType"],
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
      costSource: e.costSource as ViontoCostRow["costSource"],
      credentialSource: e.credentialSource as ViontoCostRow["credentialSource"],
      fixture: e.fixture,
      finality: e.finality,
      latencyMs: e.latencyMs,
      subjectType: e.subjectType,
      subjectId: e.subjectId,
      projectId: e.projectId,
      workflowId: e.workflowId,
      exportIds: e.exports.map((x) => x.exportId),
      backfilled,
      // Backfilled rows are history recorded before this ledger: counted, but
      // flagged so coverage reads "partial" rather than claiming completeness.
      legacy: backfilled,
    };
  });

  return filter.status?.length ? rows.filter((r) => filter.status!.includes(r.legacy ? "legacy" : statusOf(r))) : rows;
}

export interface ExportCostGroup {
  exportId: string;
  label: string;
  createdAt: string;
  /** false = created before cost tracking; its AI inputs are unknown. */
  tracked: boolean;
  totals: CostTotalsDTO;
}

export interface ProjectCostGroup {
  projectId: string | null;
  label: string;
  deleted: boolean;
  totals: CostTotalsDTO;
  exports: ExportCostGroup[];
  unattached: CostTotalsDTO;
}

export interface ViontoCostTimeline {
  range: { from: string; to: string; preset: string };
  summary: CostTotalsDTO;
  /** Σ usage events by payer, for the "BYOK is not platform spend" split. */
  projects: ProjectCostGroup[];
  items: (TimelineItemDTO & { projectId: string | null; exportIds: string[] })[];
  nextCursor: string | null;
  generatedAt: string;
}

function toItem(row: ViontoCostRow): ViontoCostTimeline["items"][number] {
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
    projectId: row.projectId,
    exportIds: row.exportIds,
  };
}

/** Project/export subtotals + the paged timeline for one user. */
export async function buildViontoCostTimeline(
  userId: string,
  filter: ViontoCostFilter,
  page: { cursor?: string | null; limit: number },
  now: Date = new Date(),
): Promise<ViontoCostTimeline> {
  const rows = await loadViontoCostRows(userId, filter);

  const summary = emptyTotals();
  const byProject = new Map<string, { total: CostTotals; unattached: CostTotals; byExport: Map<string, CostTotals>; latest: number }>();
  for (const row of rows) {
    addRow(summary, row);
    const key = row.projectId ?? "";
    const p = byProject.get(key) ?? { total: emptyTotals(), unattached: emptyTotals(), byExport: new Map(), latest: 0 };
    addRow(p.total, row);
    if (row.exportIds.length === 0) addRow(p.unattached, row);
    for (const exportId of row.exportIds) {
      const t = p.byExport.get(exportId) ?? emptyTotals();
      addRow(t, row);
      p.byExport.set(exportId, t);
    }
    p.latest = Math.max(p.latest, row.occurredAt.getTime());
    byProject.set(key, p);
  }

  const projectIds = [...byProject.keys()].filter(Boolean);
  const [projects, exports] = await Promise.all([
    prisma.viontoProject.findMany({ where: { id: { in: projectIds } }, select: { id: true, title: true } }),
    // Every export of these projects that this user owns — including ones
    // created before tracking, so they can be shown as "not tracked".
    prisma.viontoExport.findMany({
      where: {
        userId,
        projectId: { in: projectIds },
        ...(filter.exportId ? { id: filter.exportId } : {}),
        createdAt: { gte: filter.range.from, lt: filter.range.to },
      },
      select: { id: true, projectId: true, filename: true, previewTitle: true, createdAt: true, costSnapshotAt: true },
      orderBy: { createdAt: "desc" },
    }),
  ]);
  const projectTitle = new Map(projects.map((p) => [p.id, p.title]));

  const groups: ProjectCostGroup[] = [...byProject.entries()]
    .sort((a, b) => b[1].latest - a[1].latest)
    .map(([key, p]) => {
      const projectId = key || null;
      const exportGroups: ExportCostGroup[] = exports
        .filter((x) => x.projectId === projectId)
        .map((x) => ({
          exportId: x.id,
          label: x.previewTitle || x.filename || "Final video",
          createdAt: x.createdAt.toISOString(),
          tracked: x.costSnapshotAt !== null,
          totals: totalsToDTO(p.byExport.get(x.id) ?? emptyTotals()),
        }));
      // A linked export outside the date range still shows its in-range events.
      for (const [exportId, totals] of p.byExport) {
        if (!exportGroups.some((g) => g.exportId === exportId)) {
          exportGroups.push({ exportId, label: "Final video", createdAt: "", tracked: true, totals: totalsToDTO(totals) });
        }
      }
      return {
        projectId,
        label: projectId ? (projectTitle.get(projectId) ?? "Deleted project") : "Not tied to a project",
        deleted: Boolean(projectId) && !projectTitle.has(projectId!),
        totals: totalsToDTO(p.total),
        exports: exportGroups,
        unattached: totalsToDTO(p.unattached),
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

  return {
    range: { from: filter.range.from.toISOString(), to: filter.range.to.toISOString(), preset: filter.range.preset },
    summary: totalsToDTO(summary),
    projects: groups,
    items: pageRows.map(toItem),
    nextCursor: start >= 0 && start + page.limit < rows.length && last ? encodeCursor({ occurredAt: last.occurredAt, id: last.id }) : null,
    generatedAt: now.toISOString(),
  };
}
