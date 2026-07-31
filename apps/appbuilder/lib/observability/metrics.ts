import { and, desc, eq, gte, inArray, isNotNull, sql } from "drizzle-orm";
import type { Db } from "../db/client";
import {
  conversationAttachments,
  conversationMemories,
  conversationReferences,
  modificationJobs,
  modificationPlanSteps,
  modificationPlans,
  operationalEvents,
} from "../db/schema";
import { MODEL_COST_RATES, resolveCostRate } from "./costRates";

/**
 * M13 slice G — the measurement surface the milestone requires: "attachment
 * processing/cleanup, bytes, text/image model usage, included and truncated
 * context, resolver confidence, decisions, clarification rounds, capability
 * gaps, plan failures, corrections, provider errors, and vision readiness"
 * (docs/appbuilder-m13-multimodal-contextual-assistant.md, "Observability,
 * privacy, and quotas").
 *
 * Three design decisions worth stating, because each one is a place where
 * the easy implementation would have been wrong:
 *
 * 1. **Computed from persisted rows, never from counters.** Every figure
 *    below is a query over `conversation_attachments`,
 *    `modification_jobs.context_manifest`, `modification_plan_steps`,
 *    `conversation_references`, or `operational_events`. There is no
 *    in-process counter to drift, reset on deploy, or disagree with the data
 *    an operator can see. The cost is query time on a metrics read, which is
 *    an operator-facing path, not a request path.
 *
 * 2. **Nothing here reads user content.** Attachment metrics read status,
 *    byte counts, and MIME categories — never `extracted_text`. Context
 *    metrics read the safe manifest summary — never the prompt. Reference
 *    metrics read host and adapter — never `extracted_text` or URL paths.
 *    A metrics endpoint that could reconstruct a user's files would be a
 *    worse privacy problem than the one it was built to monitor.
 *
 * 3. **Absence is reported as absence.** Every rate is `null` when its
 *    denominator is zero rather than `0`, and every "latest" figure is
 *    `null` when nothing has happened. A dashboard showing 0% failures
 *    because nothing ran is the same misreport that
 *    lib/observability/status.ts's `ReadinessStatus` exists to prevent.
 *
 * Cost is an *estimate* and labelled as one — see costRates.ts.
 */

/** Default lookback for every windowed figure. */
export const DEFAULT_METRICS_WINDOW_DAYS = 30;

export interface MetricsWindow {
  since: Date;
  days: number;
}

export function metricsWindow(
  days: number = DEFAULT_METRICS_WINDOW_DAYS,
  now: Date = new Date()
): MetricsWindow {
  return { since: new Date(now.getTime() - days * 86_400_000), days };
}

function rate(numerator: number, denominator: number): number | null {
  return denominator === 0 ? null : numerator / denominator;
}

function toNumber(value: unknown): number {
  const parsed = typeof value === "number" ? value : Number(value ?? 0);
  return Number.isFinite(parsed) ? parsed : 0;
}

// ─── Attachments ──────────────────────────────────────────────────────────

export interface AttachmentMetrics {
  /** Rows created in the window, by terminal-ish status. */
  byStatus: Record<string, number>;
  totalBytes: number;
  /** Bytes currently held by `ready` attachments — what storage actually costs. */
  readyBytes: number;
  extractedTextChars: number;
  /** `ready` attachments with no extracted text: images and PDFs today (extraction is documented as deferred for those). */
  withoutExtraction: number;
  quarantined: number;
  /** Commits that landed while the scanner reported `not_configured` — the number that must be 0 in production. */
  unscannedCommits: number;
  /** Median and p95 seconds from row creation to `processed_at`. */
  processingSecondsP50: number | null;
  processingSecondsP95: number | null;
  /** Unclaimed uploads deleted by the 24h retention sweep. */
  sweptUnclaimed: number;
  /** Unclaimed uploads currently PAST 24h and still present — the cleanup-lag signal. */
  overdueUnclaimed: number;
}

export async function collectAttachmentMetrics(
  db: Db,
  appId: string,
  window: MetricsWindow,
  now: Date = new Date()
): Promise<AttachmentMetrics> {
  const rows = await db
    .select()
    .from(conversationAttachments)
    .where(
      and(
        eq(conversationAttachments.appId, appId),
        gte(conversationAttachments.createdAt, window.since)
      )
    );

  const byStatus: Record<string, number> = {};
  let totalBytes = 0;
  let readyBytes = 0;
  let extractedTextChars = 0;
  let withoutExtraction = 0;
  let quarantined = 0;
  const processingSeconds: number[] = [];

  for (const row of rows) {
    byStatus[row.status] = (byStatus[row.status] ?? 0) + 1;
    const bytes = row.actualSizeBytes ?? row.declaredSizeBytes;
    totalBytes += bytes;
    if (row.status === "ready") {
      readyBytes += bytes;
      // `extracted_text` is never read here — only its length, which is
      // already a persisted-safe measurement of how much text one file
      // contributed to a prompt budget.
      const chars = row.extractedText?.length ?? 0;
      extractedTextChars += chars;
      if (chars === 0) withoutExtraction += 1;
    }
    if (row.status === "quarantined") quarantined += 1;
    if (row.processedAt) {
      processingSeconds.push(
        (row.processedAt.getTime() - row.createdAt.getTime()) / 1000
      );
    }
  }

  const [unscanned] = await db
    .select({ count: sql<number>`count(*)` })
    .from(operationalEvents)
    .where(
      and(
        eq(operationalEvents.appId, appId),
        eq(operationalEvents.kind, "attachment.scan_not_configured"),
        gte(operationalEvents.createdAt, window.since)
      )
    );

  const [swept] = await db
    .select({ count: sql<number>`count(*)` })
    .from(operationalEvents)
    .where(
      and(
        eq(operationalEvents.appId, appId),
        eq(operationalEvents.kind, "attachment.swept_unclaimed"),
        gte(operationalEvents.createdAt, window.since)
      )
    );

  // Deliberately NOT windowed: an unclaimed upload that has been overdue
  // for six weeks is the most important one to see, and a 30-day window
  // would hide exactly that.
  const overdueCutoff = new Date(now.getTime() - 24 * 60 * 60 * 1000);
  const [overdue] = await db
    .select({ count: sql<number>`count(*)` })
    .from(conversationAttachments)
    .where(
      and(
        eq(conversationAttachments.appId, appId),
        inArray(conversationAttachments.status, [
          "pending",
          "uploaded",
          "processing",
        ]),
        sql`${conversationAttachments.createdAt} < ${overdueCutoff}`
      )
    );

  return {
    byStatus,
    totalBytes,
    readyBytes,
    extractedTextChars,
    withoutExtraction,
    quarantined,
    unscannedCommits: toNumber(unscanned?.count),
    sweptUnclaimed: toNumber(swept?.count),
    overdueUnclaimed: toNumber(overdue?.count),
    processingSecondsP50: percentile(processingSeconds, 0.5),
    processingSecondsP95: percentile(processingSeconds, 0.95),
  };
}

function percentile(values: number[], q: number): number | null {
  if (values.length === 0) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const index = Math.min(sorted.length - 1, Math.floor(q * sorted.length));
  return Math.round(sorted[index] * 1000) / 1000;
}

// ─── Context assembly, resolver, clarification, plans ─────────────────────

export interface ContextMetrics {
  jobsWithManifest: number;
  /** Mean estimated prompt tokens per grounded call. */
  meanEstimatedTokens: number | null;
  /** Jobs whose manifest recorded at least one truncated source. */
  jobsWithTruncation: number;
  /** Jobs whose manifest recorded at least one omitted source. */
  jobsWithOmission: number;
  /** How often each redaction flag fired — `vision_unavailable`, `untrusted_attachment_text`, `stale_reference_content`, … */
  redactionFlagCounts: Record<string, number>;
  meanHistoryTurns: number | null;
  meanMemoryFacts: number | null;
}

export interface ResolverMetrics {
  resolved: number;
  ambiguous: number;
  unresolved: number;
  /** Share of grounded interpretations that produced exactly one confident target. */
  resolutionRate: number | null;
  meanConfidence: number | null;
  /** Which deterministic rule matched — `selection`, `exact_value`, `stable_id`, … */
  byStrategy: Record<string, number>;
}

export interface ClarificationMetrics {
  jobsThatAsked: number;
  totalRounds: number;
  answered: number;
  /** Asked, never answered, and past its TTL — a question the user walked away from. */
  abandoned: number;
  exhausted: number;
  /** Share of asked questions that got an answer. A low rate means the questions are not useful, not that users are lazy. */
  answerRate: number | null;
}

export interface PlanMetrics {
  created: number;
  completed: number;
  stopped: number;
  stepsApplied: number;
  stepsFailed: number;
  stepsSkipped: number;
  /** Share of created plans that ran every step. */
  completionRate: number | null;
  /** Plans that recorded at least one capability gap alongside their steps. */
  withCapabilityGaps: number;
}

export interface DecisionMetrics {
  totalJobs: number;
  byStatus: Record<string, number>;
  byFailureCode: Record<string, number>;
  /** Jobs that ended `unsupported_request` — the honest capability-gap outcome, not a failure to hide. */
  capabilityGapOutcomes: number;
  /** Provider-side errors, separated from user-request outcomes so one never masks the other. */
  providerErrors: number;
}

export async function collectModificationMetrics(
  db: Db,
  appId: string,
  window: MetricsWindow,
  now: Date = new Date()
): Promise<{
  context: ContextMetrics;
  resolver: ResolverMetrics;
  clarification: ClarificationMetrics;
  decisions: DecisionMetrics;
  tokens: TokenMetrics;
}> {
  const jobs = await db
    .select()
    .from(modificationJobs)
    .where(
      and(
        eq(modificationJobs.appId, appId),
        gte(modificationJobs.createdAt, window.since)
      )
    );

  const context: ContextMetrics = {
    jobsWithManifest: 0,
    meanEstimatedTokens: null,
    jobsWithTruncation: 0,
    jobsWithOmission: 0,
    redactionFlagCounts: {},
    meanHistoryTurns: null,
    meanMemoryFacts: null,
  };
  const resolver: ResolverMetrics = {
    resolved: 0,
    ambiguous: 0,
    unresolved: 0,
    resolutionRate: null,
    meanConfidence: null,
    byStrategy: {},
  };
  const clarification: ClarificationMetrics = {
    jobsThatAsked: 0,
    totalRounds: 0,
    answered: 0,
    abandoned: 0,
    exhausted: 0,
    answerRate: null,
  };
  const decisions: DecisionMetrics = {
    totalJobs: jobs.length,
    byStatus: {},
    byFailureCode: {},
    capabilityGapOutcomes: 0,
    providerErrors: 0,
  };

  const tokenTotals = { prompt: 0, completion: 0, total: 0, calls: 0 };
  const byModel: Record<string, { prompt: number; completion: number; calls: number }> = {};

  let tokenSum = 0;
  let historySum = 0;
  let memorySum = 0;
  let confidenceSum = 0;
  let confidenceCount = 0;

  for (const job of jobs) {
    decisions.byStatus[job.status] = (decisions.byStatus[job.status] ?? 0) + 1;
    if (job.failureCode) {
      decisions.byFailureCode[job.failureCode] =
        (decisions.byFailureCode[job.failureCode] ?? 0) + 1;
      if (job.failureCode === "unsupported_request")
        decisions.capabilityGapOutcomes += 1;
      if (
        job.failureCode === "provider_unavailable" ||
        job.failureCode === "malformed_provider_response" ||
        job.failureCode === "worker_infrastructure_error"
      )
        decisions.providerErrors += 1;
    }

    const manifest = job.contextManifest as Record<string, unknown> | null;
    if (manifest) {
      context.jobsWithManifest += 1;
      const inner = manifest.manifest as Record<string, unknown> | undefined;
      tokenSum += toNumber(inner?.estimatedTokens);
      if (Array.isArray(inner?.truncated) && inner.truncated.length > 0)
        context.jobsWithTruncation += 1;
      if (Array.isArray(inner?.omitted) && inner.omitted.length > 0)
        context.jobsWithOmission += 1;
      for (const flag of (inner?.redactionFlags as string[] | undefined) ?? []) {
        context.redactionFlagCounts[flag] =
          (context.redactionFlagCounts[flag] ?? 0) + 1;
      }
      historySum += toNumber(manifest.historyTurnCount);
      memorySum += toNumber(manifest.memoryFactCount);

      const outcome = manifest.resolutionOutcome;
      if (outcome === "resolved") resolver.resolved += 1;
      else if (outcome === "ambiguous") resolver.ambiguous += 1;
      else if (outcome === "unresolved") resolver.unresolved += 1;

      const strategy = manifest.resolvedStrategy;
      if (typeof strategy === "string") {
        resolver.byStrategy[strategy] = (resolver.byStrategy[strategy] ?? 0) + 1;
      }
      const confidence = manifest.resolvedConfidence;
      if (typeof confidence === "number") {
        confidenceSum += confidence;
        confidenceCount += 1;
      }
    }

    const state = job.clarificationState as
      | { rounds?: Array<{ answer?: unknown; expiresAt?: string }> }
      | null;
    const rounds = state?.rounds ?? [];
    if (rounds.length > 0) {
      clarification.jobsThatAsked += 1;
      clarification.totalRounds += rounds.length;
      for (const round of rounds) {
        if (round.answer) clarification.answered += 1;
        else if (round.expiresAt && new Date(round.expiresAt) < now)
          clarification.abandoned += 1;
      }
    }

    const usage = job.usage as Record<string, unknown> | null;
    if (usage) {
      const prompt = toNumber(usage.promptTokens);
      const completion = toNumber(usage.completionTokens);
      tokenTotals.prompt += prompt;
      tokenTotals.completion += completion;
      tokenTotals.total += toNumber(usage.totalTokens) || prompt + completion;
      tokenTotals.calls += toNumber(usage.calls);
      const model = job.providerModel ?? "unknown";
      const entry = (byModel[model] ??= { prompt: 0, completion: 0, calls: 0 });
      entry.prompt += prompt;
      entry.completion += completion;
      entry.calls += toNumber(usage.calls);
    }
  }

  const [exhausted] = await db
    .select({ count: sql<number>`count(*)` })
    .from(operationalEvents)
    .where(
      and(
        eq(operationalEvents.appId, appId),
        eq(operationalEvents.kind, "clarification.exhausted"),
        gte(operationalEvents.createdAt, window.since)
      )
    );
  clarification.exhausted = toNumber(exhausted?.count);
  clarification.answerRate = rate(
    clarification.answered,
    clarification.totalRounds
  );

  context.meanEstimatedTokens = rate(tokenSum, context.jobsWithManifest);
  context.meanHistoryTurns = rate(historySum, context.jobsWithManifest);
  context.meanMemoryFacts = rate(memorySum, context.jobsWithManifest);
  resolver.meanConfidence = rate(confidenceSum, confidenceCount);
  resolver.resolutionRate = rate(
    resolver.resolved,
    resolver.resolved + resolver.ambiguous + resolver.unresolved
  );

  return {
    context,
    resolver,
    clarification,
    decisions,
    tokens: buildTokenMetrics(tokenTotals, byModel),
  };
}

export async function collectPlanMetrics(
  db: Db,
  appId: string,
  window: MetricsWindow
): Promise<PlanMetrics> {
  const plans = await db
    .select()
    .from(modificationPlans)
    .where(
      and(
        eq(modificationPlans.appId, appId),
        gte(modificationPlans.createdAt, window.since)
      )
    );
  const steps = await db
    .select()
    .from(modificationPlanSteps)
    .where(
      and(
        eq(modificationPlanSteps.appId, appId),
        gte(modificationPlanSteps.createdAt, window.since)
      )
    );

  const completed = plans.filter((p) => p.status === "completed").length;
  const stopped = plans.filter(
    (p) => p.status === "failed" || p.status === "cancelled"
  ).length;
  const withCapabilityGaps = plans.filter((p) => {
    const assessment = p.capabilityAssessment as Record<string, unknown>;
    return (
      Array.isArray(assessment?.unsupported) && assessment.unsupported.length > 0
    );
  }).length;

  return {
    created: plans.length,
    completed,
    stopped,
    stepsApplied: steps.filter((s) => s.status === "applied").length,
    stepsFailed: steps.filter((s) => s.status === "failed").length,
    // A step the plan never reached because an earlier one stopped it. Kept
    // apart from `stepsFailed` because they mean different things to an
    // operator: one step broke, the rest were simply never attempted.
    stepsSkipped: steps.filter((s) => s.status === "skipped").length,
    completionRate: rate(completed, plans.length),
    withCapabilityGaps,
  };
}

// ─── Public references / GitHub import ────────────────────────────────────

export interface ReferenceImportMetrics {
  /** Rows currently held, by adapter — `generic_https`, `github_profile`, `github_repository`. */
  byAdapter: Record<string, number>;
  totalReferences: number;
  /** Fetches attempted in the window, from the usage ledger's own event stream. */
  imported: number;
  blocked: number;
  fetchFailed: number;
  rateLimited: number;
  /** Refreshes recorded across all rows — how much outbound traffic caching actually avoided. */
  totalRefreshes: number;
  storedTextChars: number;
  /** Rows whose most recent fetch attempt failed. */
  failing: number;
  lastFetchedAt: string | null;
}

export async function collectReferenceMetrics(
  db: Db,
  appId: string,
  window: MetricsWindow
): Promise<ReferenceImportMetrics> {
  const rows = await db
    .select()
    .from(conversationReferences)
    .where(
      and(
        eq(conversationReferences.appId, appId),
        inArray(conversationReferences.status, ["ready", "unavailable"])
      )
    );

  const byAdapter: Record<string, number> = {};
  let totalRefreshes = 0;
  let storedTextChars = 0;
  let failing = 0;
  let lastFetchedAt: Date | null = null;

  for (const row of rows) {
    byAdapter[row.adapter] = (byAdapter[row.adapter] ?? 0) + 1;
    totalRefreshes += row.refreshCount;
    storedTextChars += row.extractedText?.length ?? 0;
    if (row.failureCode) failing += 1;
    if (row.fetchedAt && (!lastFetchedAt || row.fetchedAt > lastFetchedAt))
      lastFetchedAt = row.fetchedAt;
  }

  const counts = await countEventKinds(db, appId, window, [
    "reference.imported",
    "reference.blocked",
    "reference.fetch_failed",
    "reference.rate_limited",
  ]);

  return {
    byAdapter,
    totalReferences: rows.length,
    imported: counts["reference.imported"] ?? 0,
    blocked: counts["reference.blocked"] ?? 0,
    fetchFailed: counts["reference.fetch_failed"] ?? 0,
    rateLimited: counts["reference.rate_limited"] ?? 0,
    totalRefreshes,
    storedTextChars,
    failing,
    lastFetchedAt: lastFetchedAt ? lastFetchedAt.toISOString() : null,
  };
}

async function countEventKinds(
  db: Db,
  appId: string,
  window: MetricsWindow,
  kinds: string[]
): Promise<Record<string, number>> {
  const rows = await db
    .select({
      kind: operationalEvents.kind,
      count: sql<number>`count(*)`,
    })
    .from(operationalEvents)
    .where(
      and(
        eq(operationalEvents.appId, appId),
        inArray(operationalEvents.kind, kinds),
        gte(operationalEvents.createdAt, window.since)
      )
    )
    .groupBy(operationalEvents.kind);

  const out: Record<string, number> = {};
  for (const row of rows) out[row.kind] = toNumber(row.count);
  return out;
}

// ─── Tokens, storage, cost ────────────────────────────────────────────────

export interface TokenMetrics {
  promptTokens: number;
  completionTokens: number;
  totalTokens: number;
  providerCalls: number;
  byModel: Record<
    string,
    { promptTokens: number; completionTokens: number; calls: number }
  >;
}

function buildTokenMetrics(
  totals: { prompt: number; completion: number; total: number; calls: number },
  byModel: Record<string, { prompt: number; completion: number; calls: number }>
): TokenMetrics {
  return {
    promptTokens: totals.prompt,
    completionTokens: totals.completion,
    totalTokens: totals.total,
    providerCalls: totals.calls,
    byModel: Object.fromEntries(
      Object.entries(byModel).map(([model, v]) => [
        model,
        {
          promptTokens: v.prompt,
          completionTokens: v.completion,
          calls: v.calls,
        },
      ])
    ),
  };
}

export interface StorageMetrics {
  attachmentBytes: number;
  referenceTextChars: number;
  memoryRows: number;
  /** Rows whose bytes are held but which no message ever claimed. */
  unclaimedAttachmentBytes: number;
}

export async function collectStorageMetrics(
  db: Db,
  appId: string
): Promise<StorageMetrics> {
  const rows = await db
    .select({
      status: conversationAttachments.status,
      messageId: conversationAttachments.messageId,
      bytes: sql<number>`coalesce(${conversationAttachments.actualSizeBytes}, ${conversationAttachments.declaredSizeBytes})`,
    })
    .from(conversationAttachments)
    .where(
      and(
        eq(conversationAttachments.appId, appId),
        inArray(conversationAttachments.status, [
          "pending",
          "uploaded",
          "processing",
          "ready",
          "quarantined",
        ])
      )
    );

  let attachmentBytes = 0;
  let unclaimedAttachmentBytes = 0;
  for (const row of rows) {
    const bytes = toNumber(row.bytes);
    attachmentBytes += bytes;
    if (!row.messageId) unclaimedAttachmentBytes += bytes;
  }

  const [refs] = await db
    .select({
      chars: sql<number>`coalesce(sum(length(${conversationReferences.extractedText})), 0)`,
    })
    .from(conversationReferences)
    .where(
      and(
        eq(conversationReferences.appId, appId),
        isNotNull(conversationReferences.extractedText)
      )
    );

  const [memories] = await db
    .select({ count: sql<number>`count(*)` })
    .from(conversationMemories)
    .where(eq(conversationMemories.appId, appId));

  return {
    attachmentBytes,
    referenceTextChars: toNumber(refs?.chars),
    memoryRows: toNumber(memories?.count),
    unclaimedAttachmentBytes,
  };
}

export interface CostMetrics {
  /** Always true. Named on the field so no caller can mistake this for billing. */
  estimated: true;
  currency: "USD";
  totalUsd: number;
  byModel: Record<string, { usd: number; rateKnown: boolean }>;
  /** Models seen with no configured rate — their tokens are counted, their cost is not. */
  unratedModels: string[];
}

/**
 * Turns token counts into an estimate. Deliberately separate from the token
 * metrics that feed it: tokens are measured, cost is inferred from a rate
 * table that can be stale or missing, and conflating the two would let a
 * missing rate look like zero spend. A model with no configured rate
 * contributes 0 USD and is named in `unratedModels` so the gap is visible
 * rather than absorbed.
 */
export function estimateCost(tokens: TokenMetrics): CostMetrics {
  const byModel: Record<string, { usd: number; rateKnown: boolean }> = {};
  const unratedModels: string[] = [];
  let totalUsd = 0;

  for (const [model, usage] of Object.entries(tokens.byModel)) {
    const rateEntry = resolveCostRate(model);
    if (!rateEntry) {
      byModel[model] = { usd: 0, rateKnown: false };
      unratedModels.push(model);
      continue;
    }
    const usd =
      (usage.promptTokens / 1_000_000) * rateEntry.inputUsdPerMillion +
      (usage.completionTokens / 1_000_000) * rateEntry.outputUsdPerMillion;
    byModel[model] = { usd: Math.round(usd * 1e6) / 1e6, rateKnown: true };
    totalUsd += usd;
  }

  return {
    estimated: true,
    currency: "USD",
    totalUsd: Math.round(totalUsd * 1e6) / 1e6,
    byModel,
    unratedModels,
  };
}

// ─── The whole picture ────────────────────────────────────────────────────

export interface M13MetricsSnapshot {
  appId: string;
  generatedAt: string;
  windowDays: number;
  attachments: AttachmentMetrics;
  context: ContextMetrics;
  resolver: ResolverMetrics;
  clarification: ClarificationMetrics;
  decisions: DecisionMetrics;
  plans: PlanMetrics;
  references: ReferenceImportMetrics;
  tokens: TokenMetrics;
  storage: StorageMetrics;
  cost: CostMetrics;
}

/**
 * Assembles every M13 metric for one app. Callers are operator-facing
 * (readiness, the workspace operations panel) and MUST have already checked
 * `app.viewOperations` — this function is a pure aggregation and does no
 * authorization of its own, exactly like the section builders inside
 * lib/observability/readiness.ts.
 */
export async function collectM13Metrics(
  db: Db,
  appId: string,
  options: { windowDays?: number; now?: Date } = {}
): Promise<M13MetricsSnapshot> {
  const now = options.now ?? new Date();
  const window = metricsWindow(
    options.windowDays ?? DEFAULT_METRICS_WINDOW_DAYS,
    now
  );

  const [attachments, modification, plans, references, storage] =
    await Promise.all([
      collectAttachmentMetrics(db, appId, window, now),
      collectModificationMetrics(db, appId, window, now),
      collectPlanMetrics(db, appId, window),
      collectReferenceMetrics(db, appId, window),
      collectStorageMetrics(db, appId),
    ]);

  return {
    appId,
    generatedAt: now.toISOString(),
    windowDays: window.days,
    attachments,
    context: modification.context,
    resolver: modification.resolver,
    clarification: modification.clarification,
    decisions: modification.decisions,
    plans,
    references,
    tokens: modification.tokens,
    storage,
    cost: estimateCost(modification.tokens),
  };
}

/**
 * M12 left a dangling reference to this function from
 * lib/observability/events.ts#withQuotaRejectionLogging ("see
 * lib/observability/metrics.ts#countQuotaRejections") — the module never
 * existed. Slice G makes the claim true rather than deleting it, because
 * the underlying point stands: a quota rejection is only a real
 * observability signal if something can count it.
 */
export async function countQuotaRejections(
  db: Db,
  appId: string,
  window: MetricsWindow = metricsWindow()
): Promise<{ total: number; byMetric: Record<string, number> }> {
  const rows = await db
    .select({ detail: operationalEvents.detail })
    .from(operationalEvents)
    .where(
      and(
        eq(operationalEvents.appId, appId),
        eq(operationalEvents.kind, "quota.rejected"),
        gte(operationalEvents.createdAt, window.since)
      )
    )
    .orderBy(desc(operationalEvents.createdAt));

  const byMetric: Record<string, number> = {};
  for (const row of rows) {
    const metric = (row.detail as Record<string, unknown>)?.metric;
    if (typeof metric === "string")
      byMetric[metric] = (byMetric[metric] ?? 0) + 1;
  }
  return { total: rows.length, byMetric };
}

export { MODEL_COST_RATES };
