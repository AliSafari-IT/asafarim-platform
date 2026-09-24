import "server-only";
import { ALL_MODELS, enumerateDays, type ReconciliationStatus } from "@asafarim/ai-cost-ledger";
import { prisma, Prisma } from "@asafarim/db";
import { lineKey, type ReconciliationStore, type SourceState, type StoredLine } from "./run";

/** Prisma implementation of the job's store — platform DB, admin-only tables. */
export const prismaReconciliationStore: ReconciliationStore = {
  async findActiveRun(since) {
    return prisma.aiCostReconciliationRun.findFirst({
      where: { status: "running", startedAt: { gte: since } },
      select: { id: true },
    });
  },

  async createRun(input) {
    return prisma.aiCostReconciliationRun.create({ data: input, select: { id: true } });
  },

  async latestFingerprints(window) {
    const rows = await prisma.aiCostReconciliationLine.findMany({
      where: { day: { in: enumerateDays(window.startDay, window.endDay) } },
      orderBy: { observedAt: "desc" },
      select: { provider: true, accountKey: true, day: true, modelKey: true, fingerprint: true },
    });
    const latest = new Map<string, string>();
    for (const row of rows) {
      const key = lineKey(row);
      if (!latest.has(key)) latest.set(key, row.fingerprint);
    }
    return latest;
  },

  async insertLines(runId, lines: StoredLine[]) {
    const { count } = await prisma.aiCostReconciliationLine.createMany({
      data: lines.map((l) => ({
        runId,
        provider: l.provider,
        accountKey: l.accountKey,
        day: l.day,
        modelKey: l.modelKey,
        fingerprint: l.fingerprint,
        status: l.status,
        finality: l.finality,
        providerMicros: l.providerMicros,
        internalKnownMicros: l.internalKnownMicros,
        internalEventCount: l.internalEventCount,
        internalUnknownCount: l.internalUnknownCount,
        deltaMicros: l.deltaMicros,
        unattributedMicros: l.unattributedMicros,
        coverageBps: l.coverageBps,
        driftBps: l.driftBps,
        apps: l.apps,
      })),
      skipDuplicates: true,
    });
    return count;
  },

  async finishRun(runId, result) {
    await prisma.aiCostReconciliationRun.update({
      where: { id: runId },
      data: {
        status: result.status,
        finishedAt: new Date(),
        sources: result.sources as unknown as Prisma.InputJsonValue,
        summary: result.summary === null ? Prisma.JsonNull : (result.summary as Prisma.InputJsonValue),
        error: result.error,
      },
    });
  },
};

// ─── Read model for the admin page ───────────────────────────────────────

export interface ReportLine {
  provider: string;
  accountKey: string;
  day: string;
  modelKey: string;
  status: ReconciliationStatus;
  finality: string;
  providerMicros: bigint | null;
  internalKnownMicros: bigint;
  internalEventCount: number;
  internalUnknownCount: number;
  deltaMicros: bigint | null;
  unattributedMicros: bigint | null;
  coverageBps: number | null;
  driftBps: number | null;
  apps: string[];
  observedAt: Date;
  /** Earlier observations of the same line (late-arriving data), newest first. */
  history: number;
}

export interface RunRow {
  id: string;
  trigger: string;
  status: string;
  startDay: string;
  endDay: string;
  startedAt: Date;
  finishedAt: Date | null;
  sources: SourceState[];
  summary: Record<string, unknown> | null;
  error: string | null;
}

/** Latest observation per (provider, account, day, model) for the given days. */
export async function loadReport(days: string[], filter: { provider?: string } = {}): Promise<ReportLine[]> {
  const rows = await prisma.aiCostReconciliationLine.findMany({
    where: { day: { in: days }, ...(filter.provider ? { provider: filter.provider } : {}) },
    orderBy: { observedAt: "desc" },
  });
  const latest = new Map<string, ReportLine>();
  for (const row of rows) {
    const key = lineKey(row);
    const existing = latest.get(key);
    if (existing) {
      existing.history += 1;
      continue;
    }
    latest.set(key, { ...row, status: row.status as ReconciliationStatus, history: 0 });
  }
  return [...latest.values()].sort(
    (a, b) =>
      b.day.localeCompare(a.day) ||
      a.provider.localeCompare(b.provider) ||
      (a.modelKey === ALL_MODELS ? -1 : b.modelKey === ALL_MODELS ? 1 : a.modelKey.localeCompare(b.modelKey)),
  );
}

export async function loadRecentRuns(limit = 10): Promise<RunRow[]> {
  const runs = await prisma.aiCostReconciliationRun.findMany({ orderBy: { startedAt: "desc" }, take: limit });
  return runs.map((r) => ({
    ...r,
    sources: (Array.isArray(r.sources) ? r.sources : []) as unknown as SourceState[],
    summary: (r.summary ?? null) as Record<string, unknown> | null,
  }));
}
