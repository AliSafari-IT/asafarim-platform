import { z } from "zod";
import { effectiveCost, type AggregatableRow } from "./aggregate";
import { assertMicrosInRange, toMicros } from "./money";

/**
 * Provider cost reconciliation (issue #592) — the pure half.
 *
 * Per-response token counts × generation-time prices make the product
 * timelines fast and attributable, but they are not the financial system
 * of record. Providers report their own daily figures (late adjustments,
 * cached/reasoning/tool units, tiered prices, costs that map to no single
 * request). This module compares the two **without mutating either**:
 *
 *   provider daily lines ─┐
 *                         ├─► reconcile() ─► report lines (per day, per model)
 *   internal daily lines ─┘
 *
 * Rules:
 *  - Only `credentialSource: "platform"`, non-fixture events are compared —
 *    BYOK spend is billed to the user's own provider account, never ours.
 *  - An unsupported provider API or a failed fetch is a reported state
 *    (`no_provider_api` / `provider_unavailable`), never a fake "matched".
 *  - A day is `pending` until the provider's settle window has passed; its
 *    numbers are shown but it is never flagged as drift.
 *  - The provider-minus-internal remainder is reported as **unattributed**
 *    at the provider/day(/model) level. It is never spread across users,
 *    projects or tasks, and it never becomes an adjustment on an event.
 *
 * No I/O here: adapters (HTTP, credentials) live server-side in the admin
 * console; apps expose their own internal totals via `internalDailyLines`.
 */

// ─── Days ────────────────────────────────────────────────────────────────

const DAY_MS = 86_400_000;
const DAY_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

export const UtcDaySchema = z.string().regex(DAY_PATTERN, "UTC day as YYYY-MM-DD");

/** The UTC calendar day an instant falls on, as `YYYY-MM-DD`. */
export function utcDay(at: Date): string {
  return at.toISOString().slice(0, 10);
}

export function dayStart(day: string): Date {
  if (!DAY_PATTERN.test(day)) throw new TypeError(`not a UTC day: "${day}"`);
  return new Date(`${day}T00:00:00.000Z`);
}

/** Inclusive list of UTC days from `startDay` to `endDay`. */
export function enumerateDays(startDay: string, endDay: string, maxDays = 93): string[] {
  const start = dayStart(startDay).getTime();
  const end = dayStart(endDay).getTime();
  if (end < start) throw new RangeError("endDay precedes startDay");
  const count = Math.round((end - start) / DAY_MS) + 1;
  if (count > maxDays) throw new RangeError(`window of ${count} days exceeds ${maxDays}`);
  return Array.from({ length: count }, (_, i) => utcDay(new Date(start + i * DAY_MS)));
}

/**
 * The trailing `days`-long window ending on the day of `now` (inclusive).
 * Re-running the same window is safe: report rows are keyed and
 * fingerprinted, so unchanged numbers write nothing new.
 */
export function trailingWindow(now: Date, days: number): { startDay: string; endDay: string } {
  const endDay = utcDay(now);
  return { startDay: utcDay(new Date(dayStart(endDay).getTime() - (days - 1) * DAY_MS)), endDay };
}

// ─── Model keys ──────────────────────────────────────────────────────────

/** Cost that belongs to no model (web search, code execution, …). */
export const UNMODELED = "unmodeled";
/** Model key of the day-level roll-up line. */
export const ALL_MODELS = "*";

/**
 * Normalize a model name so provider and internal spellings meet:
 * lowercase, and a trailing snapshot date (`-2024-07-18`, `-20241022`)
 * dropped — providers bill snapshots under their family name in some
 * reports and not in others. The day-level roll-up never depends on this.
 */
export function normalizeModelKey(model: string | null | undefined): string {
  const trimmed = (model ?? "").trim().toLowerCase();
  if (!trimmed) return UNMODELED;
  return trimmed.replace(/-(\d{4}-\d{2}-\d{2}|\d{8})$/, "");
}

// ─── Provider side ───────────────────────────────────────────────────────

/** One provider-reported cost line, already normalized to micros and a UTC day. */
export interface ProviderCostLine {
  provider: string;
  /** Which provider credential/org this came from, e.g. `default`. */
  accountKey: string;
  day: string;
  modelKey: string;
  /** Provider's own sub-dimension (token type, line item, cost type). */
  lineKey: string;
  pricingTier: string | null;
  amountMicros: bigint;
}

export type ProviderFetchResult =
  | { status: "ok"; lines: ProviderCostLine[]; pagesFetched: number; fetchedAt: Date }
  /** The provider has no usage/cost admin API, or it is not configured. */
  | { status: "unsupported"; reason: string }
  /** The API exists and is configured but the fetch failed. */
  | { status: "unavailable"; error: string };

export interface ProviderCostAdapter {
  provider: string;
  accountKey: string;
  fetchDailyCosts(window: { startDay: string; endDay: string }): Promise<ProviderFetchResult>;
}

export interface Page<T> {
  items: T[];
  nextCursor: string | null;
}

export class PaginationLoopError extends Error {
  constructor(cursor: string) {
    super(`provider returned cursor "${cursor}" twice — refusing to loop`);
    this.name = "PaginationLoopError";
  }
}

/**
 * Walk a cursor-paginated provider report. Guards against a provider (or a
 * proxy cache) handing back a cursor it already gave — which would
 * otherwise loop forever or double count — and caps the page count.
 */
export async function collectPages<T>(
  fetchPage: (cursor: string | null) => Promise<Page<T>>,
  opts: { maxPages?: number } = {},
): Promise<{ items: T[]; pages: number }> {
  const maxPages = opts.maxPages ?? 100;
  const seen = new Set<string>();
  const items: T[] = [];
  let cursor: string | null = null;
  let pages = 0;
  do {
    if (pages >= maxPages) throw new RangeError(`provider report exceeded ${maxPages} pages`);
    const page: Page<T> = await fetchPage(cursor);
    pages += 1;
    items.push(...page.items);
    cursor = page.nextCursor;
    if (cursor !== null) {
      if (seen.has(cursor)) throw new PaginationLoopError(cursor);
      seen.add(cursor);
    }
  } while (cursor !== null);
  return { items, pages };
}

/**
 * Collapse lines that share (account, day, model, lineKey, tier). Pages
 * can overlap — a provider re-serving the previous page, or a bucket split
 * across a page boundary and repeated — and summing both copies would
 * invent spend. The provider emits exactly one line per key per bucket, so
 * a repeat is a duplicate and the last copy wins.
 */
export function dedupeProviderLines(lines: readonly ProviderCostLine[]): ProviderCostLine[] {
  const byKey = new Map<string, ProviderCostLine>();
  for (const line of lines) {
    byKey.set([line.accountKey, line.day, line.modelKey, line.lineKey, line.pricingTier ?? ""].join("\u0000"), line);
  }
  return [...byKey.values()];
}

// ─── Internal side ───────────────────────────────────────────────────────

/** Σ of one app's platform-credential events for one provider/day/model. */
export interface InternalDailyLine {
  app: string;
  provider: string;
  day: string;
  modelKey: string;
  eventCount: number;
  unknownCount: number;
  /** Σ known effective amounts, adjustment deltas included. */
  knownMicros: bigint;
}

export interface InternalReconcileRow extends AggregatableRow {
  provider: string;
  responseModel: string;
  occurredAt: Date;
}

/**
 * Roll an app's cost events up into the daily lines reconciliation
 * compares. Skips BYOK and `none` (fixture) credentials — not billed to
 * the platform's provider account.
 */
export function internalDailyLines(app: string, rows: Iterable<InternalReconcileRow>): InternalDailyLine[] {
  const map = new Map<string, InternalDailyLine>();
  for (const row of rows) {
    if (row.credentialSource !== "platform" || row.fixture) continue;
    const day = utcDay(row.occurredAt);
    const modelKey = normalizeModelKey(row.responseModel);
    const key = `${row.provider}\u0000${day}\u0000${modelKey}`;
    const line = map.get(key) ?? { app, provider: row.provider, day, modelKey, eventCount: 0, unknownCount: 0, knownMicros: BigInt("0") };
    const { amountMicros, basis } = effectiveCost(row);
    if (basis !== "adjustment") line.eventCount += 1;
    if (amountMicros === null) line.unknownCount += 1;
    else line.knownMicros = assertMicrosInRange(line.knownMicros + amountMicros);
    map.set(key, line);
  }
  return [...map.values()];
}

/** Wire shape of `InternalDailyLine` (micros as strings) for app → admin transport. */
export const InternalDailyLineWireSchema = z.object({
  app: z.string().min(1).max(80),
  provider: z.string().min(1).max(80),
  day: UtcDaySchema,
  modelKey: z.string().min(1).max(160),
  eventCount: z.number().int().nonnegative(),
  unknownCount: z.number().int().nonnegative(),
  knownMicros: z.string().regex(/^-?\d+$/),
});
export type InternalDailyLineWire = z.infer<typeof InternalDailyLineWireSchema>;

export const InternalDailyResponseSchema = z.object({
  app: z.string(),
  startDay: UtcDaySchema,
  endDay: UtcDaySchema,
  lines: z.array(InternalDailyLineWireSchema),
});
export type InternalDailyResponse = z.infer<typeof InternalDailyResponseSchema>;

export const MAX_RECONCILE_WINDOW_DAYS = 93;

/**
 * Parse `?startDay=&endDay=` for an app's internal daily-totals endpoint.
 * Returns the half-open UTC instant range the query should select.
 */
export function parseReconcileWindow(
  params: URLSearchParams,
): { ok: true; startDay: string; endDay: string; from: Date; to: Date } | { ok: false; error: string } {
  const startDay = params.get("startDay") ?? "";
  const endDay = params.get("endDay") ?? "";
  if (!DAY_PATTERN.test(startDay) || !DAY_PATTERN.test(endDay)) {
    return { ok: false, error: "startDay and endDay are required as YYYY-MM-DD" };
  }
  try {
    enumerateDays(startDay, endDay, MAX_RECONCILE_WINDOW_DAYS);
  } catch (err) {
    return { ok: false, error: (err as Error).message };
  }
  return { ok: true, startDay, endDay, from: dayStart(startDay), to: new Date(dayStart(endDay).getTime() + DAY_MS) };
}

export function internalLineToWire(line: InternalDailyLine): InternalDailyLineWire {
  return { ...line, knownMicros: line.knownMicros.toString() };
}

export function internalLineFromWire(line: InternalDailyLineWire): InternalDailyLine {
  return { ...line, knownMicros: toMicros(line.knownMicros) };
}

// ─── Reconciliation ──────────────────────────────────────────────────────

export const RECONCILIATION_STATUSES = [
  /** |internal − provider| is within tolerance. */
  "matched",
  /** Provider billed more than we recorded; the remainder is unattributed. */
  "under_recorded",
  /** We recorded more than the provider billed (estimate too high, or a leak in our filter). */
  "over_recorded",
  /** Provider billed spend we have no event for at all. */
  "provider_only",
  /** We recorded platform spend the provider reports nothing for. */
  "internal_only",
  /** Nothing on either side. */
  "empty",
  /** Day not settled yet — numbers shown, drift not judged. */
  "pending",
  /** No usage/cost admin API for this provider, or not configured. */
  "no_provider_api",
  /** Provider API configured but the fetch failed. */
  "provider_unavailable",
  /** At least one app's internal totals could not be read. */
  "internal_unavailable",
] as const;
export type ReconciliationStatus = (typeof RECONCILIATION_STATUSES)[number];

/** Statuses that should raise an operator alert. */
export const DRIFT_STATUSES: ReadonlySet<ReconciliationStatus> = new Set([
  "under_recorded",
  "over_recorded",
  "provider_only",
  "internal_only",
]);

export interface ReconciliationPolicy {
  /** Relative tolerance in basis points of the provider amount (500 = 5 %). */
  driftBps: number;
  /** Absolute tolerance floor, so a 3-cent day doesn't page anyone. */
  minAbsMicros: bigint;
  /** Hours after a UTC day ends before the provider's figure counts as final. */
  settleHours: number;
}

export const DEFAULT_RECONCILIATION_POLICY: ReconciliationPolicy = {
  driftBps: 500,
  minAbsMicros: BigInt("50000"),
  settleHours: 48,
};

export interface ReconciliationLine {
  provider: string;
  accountKey: string;
  day: string;
  /** `*` for the day-level roll-up, else a normalized model key. */
  modelKey: string;
  status: ReconciliationStatus;
  /** Whether the provider figure for this day is past its settle window. */
  finality: "provisional" | "final";
  /** null when the provider figure is not available. */
  providerMicros: bigint | null;
  internalKnownMicros: bigint;
  internalEventCount: number;
  internalUnknownCount: number;
  /** internal − provider; null without a provider figure. */
  deltaMicros: bigint | null;
  /** max(provider − internal, 0): billed spend no event accounts for. */
  unattributedMicros: bigint | null;
  /** internal / provider in basis points; null when provider is 0 or absent. */
  coverageBps: number | null;
  /** |delta| / provider in basis points; null when provider is 0 or absent. */
  driftBps: number | null;
  /** Apps contributing internal events. */
  apps: string[];
}

export interface ReconcileInput {
  provider: string;
  accountKey: string;
  window: { startDay: string; endDay: string };
  providerResult: ProviderFetchResult;
  /** Internal lines from every app, any provider (filtered here). */
  internal: readonly InternalDailyLine[];
  /** False when any app's internal read failed. */
  internalComplete: boolean;
  policy?: ReconciliationPolicy;
  now: Date;
}

interface Side {
  providerMicros: bigint;
  hasProvider: boolean;
  internalKnownMicros: bigint;
  internalEventCount: number;
  internalUnknownCount: number;
  apps: Set<string>;
}

function emptySide(): Side {
  return {
    providerMicros: BigInt("0"),
    hasProvider: false,
    internalKnownMicros: BigInt("0"),
    internalEventCount: 0,
    internalUnknownCount: 0,
    apps: new Set(),
  };
}

function bps(numerator: bigint, denominator: bigint): number | null {
  if (denominator <= BigInt("0")) return null;
  return Number((numerator * BigInt("10000")) / denominator);
}

function abs(v: bigint): bigint {
  return v < BigInt("0") ? -v : v;
}

export function isDaySettled(day: string, now: Date, settleHours: number): boolean {
  return now.getTime() >= dayStart(day).getTime() + DAY_MS + settleHours * 3_600_000;
}

function classify(
  side: Side,
  providerState: ProviderFetchResult["status"],
  internalComplete: boolean,
  settled: boolean,
  policy: ReconciliationPolicy,
): ReconciliationStatus {
  if (providerState === "unsupported") return "no_provider_api";
  if (providerState === "unavailable") return "provider_unavailable";
  if (!internalComplete) return "internal_unavailable";
  const zero = BigInt("0");
  const provider = side.providerMicros;
  const internal = side.internalKnownMicros;
  const hasInternal = side.internalEventCount > 0 || internal !== zero;
  if (provider === zero && !hasInternal) return "empty";
  if (!settled) return "pending";
  if (provider > zero && side.internalEventCount === 0) return "provider_only";
  if (provider === zero && internal > zero) return "internal_only";
  const delta = internal - provider;
  const relative = (provider * BigInt(policy.driftBps)) / BigInt("10000");
  const tolerance = relative > policy.minAbsMicros ? relative : policy.minAbsMicros;
  if (abs(delta) <= tolerance) return "matched";
  return delta < zero ? "under_recorded" : "over_recorded";
}

function toLine(
  input: ReconcileInput,
  day: string,
  modelKey: string,
  side: Side,
  settled: boolean,
  policy: ReconciliationPolicy,
): ReconciliationLine {
  const providerOk = input.providerResult.status === "ok";
  const providerMicros = providerOk ? side.providerMicros : null;
  const delta = providerMicros === null ? null : side.internalKnownMicros - providerMicros;
  return {
    provider: input.provider,
    accountKey: input.accountKey,
    day,
    modelKey,
    status: classify(side, input.providerResult.status, input.internalComplete, settled, policy),
    finality: settled ? "final" : "provisional",
    providerMicros,
    internalKnownMicros: side.internalKnownMicros,
    internalEventCount: side.internalEventCount,
    internalUnknownCount: side.internalUnknownCount,
    deltaMicros: delta,
    unattributedMicros: delta === null ? null : delta < BigInt("0") ? -delta : BigInt("0"),
    coverageBps: providerMicros === null ? null : bps(side.internalKnownMicros, providerMicros),
    driftBps: providerMicros === null || delta === null ? null : bps(abs(delta), providerMicros),
    apps: [...side.apps].sort(),
  };
}

/**
 * Compare one provider account's daily figures with the internal ledger
 * over a window. Emits a day-level roll-up (`modelKey: "*"`) for **every**
 * day in the window — an empty day is a reported fact, not a gap — plus a
 * per-model line for each model seen on either side that day.
 *
 * Internal events cannot be split by provider account (the ledger records
 * `credentialSource: "platform"`, not which org key), so this assumes one
 * platform account per provider — the platform's configuration today.
 */
export function reconcile(input: ReconcileInput): ReconciliationLine[] {
  const policy = input.policy ?? DEFAULT_RECONCILIATION_POLICY;
  const days = enumerateDays(input.window.startDay, input.window.endDay);
  const inWindow = new Set(days);
  const byDay = new Map<string, Map<string, Side>>();
  const sideFor = (day: string, modelKey: string): Side => {
    let models = byDay.get(day);
    if (!models) byDay.set(day, (models = new Map()));
    let side = models.get(modelKey);
    if (!side) models.set(modelKey, (side = emptySide()));
    return side;
  };

  if (input.providerResult.status === "ok") {
    for (const line of dedupeProviderLines(input.providerResult.lines)) {
      if (line.provider !== input.provider || line.accountKey !== input.accountKey || !inWindow.has(line.day)) continue;
      const side = sideFor(line.day, line.modelKey);
      side.providerMicros = assertMicrosInRange(side.providerMicros + line.amountMicros);
      side.hasProvider = true;
    }
  }
  for (const line of input.internal) {
    if (line.provider !== input.provider || !inWindow.has(line.day)) continue;
    const side = sideFor(line.day, line.modelKey);
    side.internalKnownMicros = assertMicrosInRange(side.internalKnownMicros + line.knownMicros);
    side.internalEventCount += line.eventCount;
    side.internalUnknownCount += line.unknownCount;
    side.apps.add(line.app);
  }

  const out: ReconciliationLine[] = [];
  for (const day of days) {
    const settled = isDaySettled(day, input.now, policy.settleHours);
    const models = byDay.get(day) ?? new Map<string, Side>();
    const total = emptySide();
    for (const side of models.values()) {
      total.providerMicros = assertMicrosInRange(total.providerMicros + side.providerMicros);
      total.hasProvider ||= side.hasProvider;
      total.internalKnownMicros = assertMicrosInRange(total.internalKnownMicros + side.internalKnownMicros);
      total.internalEventCount += side.internalEventCount;
      total.internalUnknownCount += side.internalUnknownCount;
      for (const app of side.apps) total.apps.add(app);
    }
    out.push(toLine(input, day, ALL_MODELS, total, settled, policy));
    for (const modelKey of [...models.keys()].sort()) {
      out.push(toLine(input, day, modelKey, models.get(modelKey)!, settled, policy));
    }
  }
  return out;
}

/**
 * Stable content fingerprint of a report line. Report rows are stored
 * append-only keyed by (provider, account, day, model, fingerprint): a
 * rerun that sees the same numbers inserts nothing, late-arriving provider
 * data inserts a new observation and keeps the earlier one as history.
 */
export function reconciliationFingerprint(line: ReconciliationLine): string {
  return [
    line.status,
    line.finality,
    line.providerMicros ?? "null",
    line.internalKnownMicros,
    line.internalEventCount,
    line.internalUnknownCount,
  ].join("|");
}

export interface ReconciliationSummary {
  lineCount: number;
  dayCount: number;
  byStatus: Partial<Record<ReconciliationStatus, number>>;
  driftDays: number;
  providerMicros: bigint;
  internalKnownMicros: bigint;
  unattributedMicros: bigint;
}

/** Day-level operational metrics for a run — numbers only, never content. */
export function summarizeReconciliation(lines: readonly ReconciliationLine[]): ReconciliationSummary {
  const summary: ReconciliationSummary = {
    lineCount: lines.length,
    dayCount: 0,
    byStatus: {},
    driftDays: 0,
    providerMicros: BigInt("0"),
    internalKnownMicros: BigInt("0"),
    unattributedMicros: BigInt("0"),
  };
  for (const line of lines) {
    if (line.modelKey !== ALL_MODELS) continue;
    summary.dayCount += 1;
    summary.byStatus[line.status] = (summary.byStatus[line.status] ?? 0) + 1;
    if (DRIFT_STATUSES.has(line.status)) summary.driftDays += 1;
    summary.providerMicros = assertMicrosInRange(summary.providerMicros + (line.providerMicros ?? BigInt("0")));
    summary.internalKnownMicros = assertMicrosInRange(summary.internalKnownMicros + line.internalKnownMicros);
    summary.unattributedMicros = assertMicrosInRange(summary.unattributedMicros + (line.unattributedMicros ?? BigInt("0")));
  }
  return summary;
}
