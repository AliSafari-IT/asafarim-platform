import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
vi.mock("@asafarim/db", () => ({
  prisma: { viontoAiCostEvent: { findMany: vi.fn() } },
  getSettingOverrides: vi.fn(),
}));

import type { InternalDailyLine, ProviderCostAdapter, ProviderCostLine } from "@asafarim/ai-cost-ledger";
import { createAnthropicAdapter, createOpenAiAdapter, createUnsupportedAdapter } from "./adapters";
import { createRemoteInternalSource, type InternalSource } from "./internal-sources";
import { lineKey, runReconciliation, type ReconciliationStore, type SourceState, type StoredLine } from "./run";

const n = (v: number) => BigInt(v);
const NOW = new Date("2026-09-24T12:00:00Z");
const WINDOW = { startDay: "2026-09-18", endDay: "2026-09-20" };
const SECRET_KEY = "sk-ant-admin01-SECRET-DO-NOT-LEAK";

function memoryStore() {
  const runs: { id: string; status: string; startedAt: Date; sources?: SourceState[]; summary?: unknown; error?: string | null }[] = [];
  const lines: (StoredLine & { runId: string; seq: number })[] = [];
  let seq = 0;
  const store: ReconciliationStore = {
    async findActiveRun(since) {
      const r = runs.find((x) => x.status === "running" && x.startedAt >= since);
      return r ? { id: r.id } : null;
    },
    async createRun() {
      const id = `run_${runs.length + 1}`;
      runs.push({ id, status: "running", startedAt: NOW });
      return { id };
    },
    async latestFingerprints() {
      const latest = new Map<string, string>();
      for (const l of [...lines].sort((a, b) => b.seq - a.seq)) if (!latest.has(lineKey(l))) latest.set(lineKey(l), l.fingerprint);
      return latest;
    },
    async insertLines(runId, batch) {
      for (const l of batch) lines.push({ ...l, runId, seq: seq++ });
      return batch.length;
    },
    async finishRun(runId, result) {
      Object.assign(runs.find((r) => r.id === runId)!, result);
    },
  };
  return { store, runs, lines };
}

function fixtureAdapter(lines: () => ProviderCostLine[]): ProviderCostAdapter {
  return {
    provider: "anthropic",
    accountKey: "default",
    fetchDailyCosts: async () => ({ status: "ok", lines: lines(), pagesFetched: 1, fetchedAt: NOW }),
  };
}

function fixtureSource(app: string, lines: () => InternalDailyLine[]): InternalSource {
  return { app, fetchDaily: async () => ({ app, status: "ok", lines: lines(), fetchedAt: NOW }) };
}

const pl = (day: string, micros: number, lineKey = "in"): ProviderCostLine => ({
  provider: "anthropic",
  accountKey: "default",
  day,
  modelKey: "claude-sonnet-5",
  lineKey,
  pricingTier: null,
  amountMicros: n(micros),
});
const il = (day: string, micros: number): InternalDailyLine => ({
  app: "tasks-ai",
  provider: "anthropic",
  day,
  modelKey: "claude-sonnet-5",
  eventCount: 2,
  unknownCount: 0,
  knownMicros: n(micros),
});

const input = { trigger: "scheduled" as const, triggeredBy: null, window: WINDOW };

describe("runReconciliation", () => {
  let providerLines: ProviderCostLine[];
  let internalLines: InternalDailyLine[];
  let alerts: string[];
  let logs: Record<string, unknown>[];

  beforeEach(() => {
    providerLines = [pl("2026-09-18", 10_000_000), pl("2026-09-19", 10_000_000)];
    internalLines = [il("2026-09-18", 10_000_000), il("2026-09-19", 6_000_000)];
    alerts = [];
    logs = [];
  });

  const deps = (store: ReconciliationStore, extra: Partial<Parameters<typeof runReconciliation>[1]> = {}) => ({
    store,
    adapters: [fixtureAdapter(() => providerLines)],
    internalSources: [fixtureSource("tasks-ai", () => internalLines)],
    now: () => NOW,
    alert: async (m: string) => void alerts.push(m),
    log: (r: Record<string, unknown>) => void logs.push(r),
    ...extra,
  });

  it("reconciles a window, stores lines and alerts on drift with numbers only", async () => {
    const { store, runs, lines } = memoryStore();
    const out = await runReconciliation(input, deps(store));
    expect(out).toMatchObject({ started: true, status: "succeeded", newDriftDays: 1 });
    expect(runs[0]!.status).toBe("succeeded");
    const day19 = lines.find((l) => l.day === "2026-09-19" && l.modelKey === "*")!;
    expect(day19).toMatchObject({ status: "under_recorded", unattributedMicros: n(4_000_000) });
    expect(alerts).toHaveLength(1);
    expect(alerts[0]).toContain("anthropic 2026-09-19: under recorded — provider $10.00, internal $6.00");
    expect(logs[0]).toMatchObject({ event: "ai_cost_reconciliation", status: "succeeded", driftDays: 1 });
  });

  it("is idempotent: rerunning over unchanged data inserts nothing and does not re-alert", async () => {
    const { store, lines } = memoryStore();
    await runReconciliation(input, deps(store));
    const before = lines.length;
    alerts = [];
    const again = await runReconciliation(input, deps(store));
    expect(again).toMatchObject({ started: true, inserted: 0, newDriftDays: 0 });
    expect(lines).toHaveLength(before);
    expect(alerts).toHaveLength(0);
  });

  it("appends a new observation for late-arriving provider data and keeps the old one", async () => {
    const { store, lines } = memoryStore();
    await runReconciliation(input, deps(store));
    providerLines = [...providerLines, pl("2026-09-18", 2_000_000, "cache_read")];
    const late = await runReconciliation(input, deps(store));
    expect(late).toMatchObject({ started: true });
    const day18 = lines.filter((l) => l.day === "2026-09-18" && l.modelKey === "*");
    expect(day18.map((l) => l.status)).toEqual(["matched", "under_recorded"]);
    expect(day18[0]!.providerMicros).toBe(n(10_000_000));
  });

  it("records a provider outage as partial and never as matched", async () => {
    const { store, runs, lines } = memoryStore();
    const down: ProviderCostAdapter = { provider: "anthropic", accountKey: "default", fetchDailyCosts: async () => ({ status: "unavailable", error: "HTTP 503" }) };
    const out = await runReconciliation(input, deps(store, { adapters: [down] }));
    expect(out).toMatchObject({ status: "partial" });
    expect(runs[0]!.sources).toContainEqual({ kind: "provider", key: "anthropic:default", status: "unavailable", error: "HTTP 503" });
    expect(lines.every((l) => l.status === "provider_unavailable")).toBe(true);
    expect(alerts[0]).toContain("provider anthropic:default unavailable (HTTP 503)");
  });

  it("reports an unsupported provider without failing the run", async () => {
    const { store, lines } = memoryStore();
    const out = await runReconciliation(input, deps(store, { adapters: [createUnsupportedAdapter("fal", "no API")] }));
    expect(out).toMatchObject({ status: "succeeded" });
    expect(new Set(lines.map((l) => l.status))).toEqual(new Set(["no_provider_api"]));
  });

  it("refuses to judge drift when an app is unreachable", async () => {
    const { store, lines } = memoryStore();
    const down: InternalSource = { app: "resumatch", fetchDaily: async () => ({ app: "resumatch", status: "unavailable", error: "HTTP 500" }) };
    const out = await runReconciliation(input, deps(store, { internalSources: [fixtureSource("tasks-ai", () => internalLines), down] }));
    expect(out).toMatchObject({ status: "partial" });
    expect(lines.filter((l) => l.modelKey === "*").every((l) => l.status === "internal_unavailable")).toBe(true);
  });

  it("does not start while another run is in progress", async () => {
    const { store, runs } = memoryStore();
    runs.push({ id: "busy", status: "running", startedAt: NOW });
    expect(await runReconciliation(input, deps(store))).toEqual({ started: false, reason: "already_running", activeRunId: "busy" });
  });

  it("a partial-window rerun leaves days outside the window untouched", async () => {
    const { store, lines } = memoryStore();
    await runReconciliation(input, deps(store));
    const snapshot = lines.filter((l) => l.day !== "2026-09-20").map((l) => ({ ...l }));
    providerLines = [pl("2026-09-20", 1_000_000)];
    internalLines = [];
    await runReconciliation({ ...input, window: { startDay: "2026-09-20", endDay: "2026-09-20" } }, deps(store));
    expect(lines.filter((l) => l.day !== "2026-09-20")).toEqual(snapshot);
  });

  it("marks the run failed on an unexpected error", async () => {
    const { store, runs } = memoryStore();
    const boom: ProviderCostAdapter = { provider: "x", accountKey: "default", fetchDailyCosts: async () => { throw new Error("secret in message"); } };
    const out = await runReconciliation(input, deps(store, { adapters: [boom] }));
    expect(out).toMatchObject({ status: "failed" });
    expect(runs[0]).toMatchObject({ status: "failed", error: "reconciliation failed" });
  });
});

describe("provider adapters", () => {
  const anthropicPage = (next: string | null) => ({
    data: [
      {
        starting_at: "2026-09-18T00:00:00Z",
        ending_at: "2026-09-19T00:00:00Z",
        results: [{ amount: "100", currency: "USD", model: "claude-sonnet-5", cost_type: "tokens", token_type: "output_tokens", service_tier: "standard", description: next ?? "last" }],
      },
    ],
    has_more: next !== null,
    next_page: next,
  });

  it("is unsupported without an admin key and never calls the API", async () => {
    const fetchImpl = vi.fn();
    const res = await createAnthropicAdapter(null, fetchImpl).fetchDailyCosts(WINDOW);
    expect(res).toEqual({ status: "unsupported", reason: "no Anthropic admin key configured" });
    expect(fetchImpl).not.toHaveBeenCalled();
    expect((await createOpenAiAdapter(null, fetchImpl).fetchDailyCosts(WINDOW)).status).toBe("unsupported");
  });

  it("paginates the Anthropic cost report with the admin key and day bounds", async () => {
    const fetchImpl = vi.fn(async (url: URL) => {
      const page = url.searchParams.get("page");
      return new Response(JSON.stringify(anthropicPage(page ? null : "page_2")));
    });
    const res = await createAnthropicAdapter(SECRET_KEY, fetchImpl).fetchDailyCosts(WINDOW);
    expect(res).toMatchObject({ status: "ok", pagesFetched: 2 });
    if (res.status === "ok") expect(res.lines.map((l) => l.amountMicros)).toEqual([n(1_000_000), n(1_000_000)]);
    const [firstUrl, init] = fetchImpl.mock.calls[0] as unknown as [URL, RequestInit];
    expect(firstUrl.searchParams.get("starting_at")).toBe("2026-09-18T00:00:00.000Z");
    expect(firstUrl.searchParams.get("ending_at")).toBe("2026-09-21T00:00:00.000Z");
    expect((init.headers as Record<string, string>)["x-api-key"]).toBe(SECRET_KEY);
  });

  it("reports HTTP failures and bad shapes without leaking the key or body", async () => {
    const failing = vi.fn(async () => new Response(`bad key ${SECRET_KEY}`, { status: 401 }));
    const res = await createAnthropicAdapter(SECRET_KEY, failing).fetchDailyCosts(WINDOW);
    expect(res).toEqual({ status: "unavailable", error: "HTTP 401" });

    const garbled = vi.fn(async () => new Response(JSON.stringify({ data: "nope", echo: SECRET_KEY })));
    const res2 = await createOpenAiAdapter(SECRET_KEY, garbled).fetchDailyCosts(WINDOW);
    expect(res2).toEqual({ status: "unavailable", error: "unexpected response shape" });
    expect(JSON.stringify([res, res2])).not.toContain("SECRET");
  });

  it("stops on a repeated cursor instead of double counting", async () => {
    const looping = vi.fn(async () => new Response(JSON.stringify(anthropicPage("same"))));
    const res = await createAnthropicAdapter(SECRET_KEY, looping).fetchDailyCosts(WINDOW);
    expect(res).toEqual({ status: "unavailable", error: "pagination loop" });
  });
});

describe("remote internal source", () => {
  beforeEach(() => {
    process.env.INTERNAL_API_SECRET = "internal-secret";
  });

  it("reads an app's daily totals through its bearer-gated route", async () => {
    const fetchImpl = vi.fn(async (url: URL) =>
      new Response(
        JSON.stringify({
          app: "resumatch",
          startDay: url.searchParams.get("startDay"),
          endDay: url.searchParams.get("endDay"),
          lines: [{ app: "resumatch", provider: "openai", day: "2026-09-18", modelKey: "gpt-4o-mini", eventCount: 3, unknownCount: 1, knownMicros: "4200" }],
        }),
      ),
    );
    const res = await createRemoteInternalSource("resumatch", () => "http://resumatch.test", fetchImpl).fetchDaily(WINDOW);
    expect(res).toMatchObject({ status: "ok", lines: [{ knownMicros: n(4200), unknownCount: 1 }] });
    const [url, init] = fetchImpl.mock.calls[0] as unknown as [URL, RequestInit];
    expect(url.pathname).toBe("/api/internal/ai-cost-daily");
    expect((init.headers as Record<string, string>).authorization).toBe("Bearer internal-secret");
  });

  it("is unavailable when the secret is missing or the app errors", async () => {
    const fetchImpl = vi.fn(async () => new Response("no", { status: 500 }));
    expect(await createRemoteInternalSource("x", () => "http://x.test", fetchImpl).fetchDaily(WINDOW)).toEqual({ app: "x", status: "unavailable", error: "HTTP 500" });
    delete process.env.INTERNAL_API_SECRET;
    expect(await createRemoteInternalSource("x", () => "http://x.test", fetchImpl).fetchDaily(WINDOW)).toMatchObject({ status: "unavailable" });
  });
});
