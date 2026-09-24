import { describe, expect, it } from "vitest";
import {
  ALL_MODELS,
  PaginationLoopError,
  UNMODELED,
  centsDecimalToMicros,
  collectPages,
  dedupeProviderLines,
  enumerateDays,
  internalDailyLines,
  internalLineFromWire,
  internalLineToWire,
  isDaySettled,
  normalizeModelKey,
  parseAnthropicCostReportPage,
  parseOpenAiCostsPage,
  reconcile,
  reconciliationFingerprint,
  summarizeReconciliation,
  trailingWindow,
  type InternalDailyLine,
  type InternalReconcileRow,
  type Page,
  type ProviderCostLine,
  type ProviderFetchResult,
  type ReconcileInput,
} from "./index";

const n = (v: number | string) => BigInt(v);
const NOW = new Date("2026-09-24T12:00:00Z");
const WINDOW = { startDay: "2026-09-18", endDay: "2026-09-20" };

function pline(day: string, model: string, micros: number, lineKey = "input"): ProviderCostLine {
  return { provider: "anthropic", accountKey: "default", day, modelKey: model, lineKey, pricingTier: "standard", amountMicros: n(micros) };
}

function iline(day: string, model: string, micros: number, extra: Partial<InternalDailyLine> = {}): InternalDailyLine {
  return { app: "resumatch", provider: "anthropic", day, modelKey: model, eventCount: 1, unknownCount: 0, knownMicros: n(micros), ...extra };
}

function ok(lines: ProviderCostLine[]): ProviderFetchResult {
  return { status: "ok", lines, pagesFetched: 1, fetchedAt: NOW };
}

function run(overrides: Partial<ReconcileInput>) {
  return reconcile({
    provider: "anthropic",
    accountKey: "default",
    window: WINDOW,
    providerResult: ok([]),
    internal: [],
    internalComplete: true,
    now: NOW,
    ...overrides,
  });
}

const dayLine = (lines: ReturnType<typeof run>, day: string) =>
  lines.find((l) => l.day === day && l.modelKey === ALL_MODELS)!;

/** A fixture adapter serving pages from memory, like a provider report. */
function pagedFixture<T>(pages: Record<string, Page<T>>) {
  const calls: (string | null)[] = [];
  return {
    calls,
    fetchPage: async (cursor: string | null) => {
      calls.push(cursor);
      const page = pages[cursor ?? "first"];
      if (!page) throw new Error(`no fixture page for ${cursor}`);
      return page;
    },
  };
}

describe("days and model keys", () => {
  it("enumerates an inclusive UTC window and refuses reversed or huge ones", () => {
    expect(enumerateDays("2026-02-27", "2026-03-01")).toEqual(["2026-02-27", "2026-02-28", "2026-03-01"]);
    expect(() => enumerateDays("2026-03-02", "2026-03-01")).toThrow(RangeError);
    expect(() => enumerateDays("2026-01-01", "2026-12-31")).toThrow(RangeError);
  });

  it("builds a trailing window ending today", () => {
    expect(trailingWindow(NOW, 7)).toEqual({ startDay: "2026-09-18", endDay: "2026-09-24" });
  });

  it("settles a day only after its settle window", () => {
    expect(isDaySettled("2026-09-22", NOW, 48)).toBe(false);
    expect(isDaySettled("2026-09-21", NOW, 48)).toBe(true);
  });

  it("normalizes snapshot suffixes and empty models", () => {
    expect(normalizeModelKey("gpt-4o-mini-2024-07-18")).toBe("gpt-4o-mini");
    expect(normalizeModelKey("claude-3-5-sonnet-20241022")).toBe("claude-3-5-sonnet");
    expect(normalizeModelKey("Claude-Sonnet-5")).toBe("claude-sonnet-5");
    expect(normalizeModelKey(null)).toBe(UNMODELED);
  });
});

describe("provider report parsing", () => {
  it("converts Anthropic cents strings to micros exactly", () => {
    expect(centsDecimalToMicros("123.45")).toBe(n(1_234_500));
    expect(centsDecimalToMicros("123.78912")).toBe(n(1_237_891));
    expect(centsDecimalToMicros("0.00005")).toBe(n(1));
    expect(centsDecimalToMicros("-1.5")).toBe(n(-15_000));
    expect(() => centsDecimalToMicros("1e3")).toThrow(TypeError);
  });

  it("parses an Anthropic cost_report page", () => {
    const page = parseAnthropicCostReportPage(
      {
        data: [
          {
            starting_at: "2026-09-18T00:00:00Z",
            ending_at: "2026-09-19T00:00:00Z",
            results: [
              { amount: "250", currency: "USD", cost_type: "tokens", model: "claude-sonnet-5", token_type: "output_tokens", service_tier: "standard", description: "x", workspace_id: null },
              { amount: "10", currency: "USD", cost_type: "web_search", model: null, token_type: null, service_tier: null, description: "Web Search", workspace_id: null },
            ],
          },
        ],
        has_more: true,
        next_page: "page_2",
      },
      "default",
    );
    expect(page.nextCursor).toBe("page_2");
    expect(page.items).toHaveLength(2);
    expect(page.items[0]).toMatchObject({ provider: "anthropic", day: "2026-09-18", modelKey: "claude-sonnet-5", amountMicros: n(2_500_000), pricingTier: "standard" });
    expect(page.items[1]).toMatchObject({ modelKey: UNMODELED, amountMicros: n(100_000) });
  });

  it("parses an OpenAI costs page and ends pagination when has_more is false", () => {
    const page = parseOpenAiCostsPage(
      {
        object: "page",
        data: [
          {
            object: "bucket",
            start_time: 1_789_689_600, // 2026-09-18T00:00:00Z
            end_time: 1_789_776_000,
            results: [{ object: "organization.costs.result", amount: { value: 0.0123456, currency: "usd" }, line_item: "gpt-4o-mini-2024-07-18, input", project_id: "proj_1" }],
          },
        ],
        has_more: false,
        next_page: "ignored",
      },
      "default",
    );
    expect(page.nextCursor).toBeNull();
    expect(page.items[0]).toMatchObject({ provider: "openai", day: "2026-09-18", modelKey: "gpt-4o-mini", amountMicros: n(12_346) });
  });

  it("rejects a page whose amount is missing instead of reading it as $0", () => {
    expect(() => parseAnthropicCostReportPage({ data: [{ starting_at: "2026-09-18T00:00:00Z", ending_at: "2026-09-19T00:00:00Z", results: [{ currency: "USD" }] }], has_more: false }, "default")).toThrow();
  });
});

describe("pagination", () => {
  it("follows cursors across pages", async () => {
    const fx = pagedFixture({
      first: { items: [pline("2026-09-18", "m", 1)], nextCursor: "p2" },
      p2: { items: [pline("2026-09-19", "m", 2)], nextCursor: "p3" },
      p3: { items: [pline("2026-09-20", "m", 3)], nextCursor: null },
    });
    const { items, pages } = await collectPages(fx.fetchPage);
    expect(pages).toBe(3);
    expect(fx.calls).toEqual([null, "p2", "p3"]);
    expect(items.map((i) => i.amountMicros)).toEqual([n(1), n(2), n(3)]);
  });

  it("refuses a cursor the provider already returned", async () => {
    const fx = pagedFixture({
      first: { items: [], nextCursor: "p2" },
      p2: { items: [], nextCursor: "p2" },
    });
    await expect(collectPages(fx.fetchPage)).rejects.toBeInstanceOf(PaginationLoopError);
  });

  it("caps the number of pages", async () => {
    let i = 0;
    await expect(collectPages(async () => ({ items: [], nextCursor: `c${i++}` }), { maxPages: 5 })).rejects.toThrow(RangeError);
  });
});

describe("duplicate pages", () => {
  it("never double counts a line served on two pages", () => {
    const repeated = pline("2026-09-18", "claude-sonnet-5", 4_000_000);
    const deduped = dedupeProviderLines([repeated, { ...repeated }, pline("2026-09-18", "claude-sonnet-5", 1_000_000, "output")]);
    expect(deduped).toHaveLength(2);

    const lines = run({
      window: { startDay: "2026-09-18", endDay: "2026-09-18" },
      providerResult: ok([repeated, { ...repeated }]),
      internal: [iline("2026-09-18", "claude-sonnet-5", 4_000_000)],
    });
    expect(dayLine(lines, "2026-09-18")).toMatchObject({ providerMicros: n(4_000_000), status: "matched" });
  });
});

describe("reconcile", () => {
  it("reports every day in the window, including empty ones", () => {
    const lines = run({});
    expect(lines.filter((l) => l.modelKey === ALL_MODELS).map((l) => [l.day, l.status])).toEqual([
      ["2026-09-18", "empty"],
      ["2026-09-19", "empty"],
      ["2026-09-20", "empty"],
    ]);
  });

  it("matches within tolerance and flags drift outside it", () => {
    const lines = run({
      providerResult: ok([pline("2026-09-18", "m", 10_000_000), pline("2026-09-19", "m", 10_000_000), pline("2026-09-20", "m", 10_000_000)]),
      internal: [iline("2026-09-18", "m", 9_700_000), iline("2026-09-19", "m", 8_000_000), iline("2026-09-20", "m", 12_000_000)],
    });
    expect(dayLine(lines, "2026-09-18")).toMatchObject({ status: "matched", deltaMicros: n(-300_000), coverageBps: 9700, driftBps: 300 });
    expect(dayLine(lines, "2026-09-19")).toMatchObject({ status: "under_recorded", unattributedMicros: n(2_000_000), coverageBps: 8000 });
    expect(dayLine(lines, "2026-09-20")).toMatchObject({ status: "over_recorded", unattributedMicros: n(0), driftBps: 2000 });
  });

  it("uses the absolute floor so tiny days never page anyone", () => {
    const lines = run({
      window: { startDay: "2026-09-18", endDay: "2026-09-18" },
      providerResult: ok([pline("2026-09-18", "m", 40_000)]),
      internal: [iline("2026-09-18", "m", 5_000)],
    });
    expect(dayLine(lines, "2026-09-18").status).toBe("matched");
  });

  it("keeps unattributed remainder at the provider/day level — never spread across apps or entities", () => {
    const lines = run({
      window: { startDay: "2026-09-18", endDay: "2026-09-18" },
      providerResult: ok([pline("2026-09-18", "m", 10_000_000)]),
      internal: [iline("2026-09-18", "m", 3_000_000), iline("2026-09-18", "m", 2_000_000, { app: "tasks-ai" })],
    });
    const day = dayLine(lines, "2026-09-18");
    expect(day.unattributedMicros).toBe(n(5_000_000));
    expect(day.internalKnownMicros).toBe(n(5_000_000));
    expect(day.apps).toEqual(["resumatch", "tasks-ai"]);
    // No line carries a per-app or per-subject share of the remainder.
    expect(Object.keys(day)).not.toContain("allocations");
  });

  it("distinguishes provider-only and internal-only days", () => {
    const lines = run({
      providerResult: ok([pline("2026-09-18", "m", 1_000_000)]),
      internal: [iline("2026-09-19", "m", 1_000_000)],
    });
    expect(dayLine(lines, "2026-09-18").status).toBe("provider_only");
    expect(dayLine(lines, "2026-09-19").status).toBe("internal_only");
  });

  it("drills down per model while the day roll-up sums every model", () => {
    const lines = run({
      window: { startDay: "2026-09-18", endDay: "2026-09-18" },
      providerResult: ok([pline("2026-09-18", "a", 1_000_000), pline("2026-09-18", "b", 2_000_000), pline("2026-09-18", UNMODELED, 500_000)]),
      internal: [iline("2026-09-18", "a", 1_000_000), iline("2026-09-18", "b", 2_000_000)],
    });
    expect(lines.map((l) => l.modelKey)).toEqual([ALL_MODELS, "a", "b", UNMODELED]);
    expect(dayLine(lines, "2026-09-18")).toMatchObject({ providerMicros: n(3_500_000), status: "under_recorded" });
    expect(lines.find((l) => l.modelKey === UNMODELED)).toMatchObject({ status: "provider_only", unattributedMicros: n(500_000) });
  });

  it("marks unsettled days pending instead of drifting", () => {
    const lines = run({
      window: { startDay: "2026-09-23", endDay: "2026-09-24" },
      providerResult: ok([pline("2026-09-23", "m", 10_000_000)]),
      internal: [iline("2026-09-23", "m", 1_000_000)],
    });
    expect(dayLine(lines, "2026-09-23")).toMatchObject({ status: "pending", finality: "provisional", unattributedMicros: n(9_000_000) });
  });

  it("reports an unsupported provider API as such, not as matched", () => {
    const lines = run({
      providerResult: { status: "unsupported", reason: "no admin key" },
      internal: [iline("2026-09-18", "m", 1_000_000)],
    });
    expect(dayLine(lines, "2026-09-18")).toMatchObject({ status: "no_provider_api", providerMicros: null, deltaMicros: null, coverageBps: null });
  });

  it("reports a provider outage without judging drift", () => {
    const lines = run({
      providerResult: { status: "unavailable", error: "HTTP 503" },
      internal: [iline("2026-09-18", "m", 1_000_000)],
    });
    expect(lines.every((l) => l.status === "provider_unavailable")).toBe(true);
    expect(dayLine(lines, "2026-09-18").internalKnownMicros).toBe(n(1_000_000));
  });

  it("refuses to judge drift when an app's internal totals are missing", () => {
    const lines = run({ providerResult: ok([pline("2026-09-18", "m", 1_000_000)]), internalComplete: false });
    expect(dayLine(lines, "2026-09-18").status).toBe("internal_unavailable");
  });

  it("ignores other providers, other accounts and days outside the window", () => {
    const lines = run({
      window: { startDay: "2026-09-18", endDay: "2026-09-18" },
      providerResult: ok([{ ...pline("2026-09-18", "m", 9), accountKey: "other" }, pline("2026-09-17", "m", 9)]),
      internal: [iline("2026-09-18", "m", 9, { provider: "openai" })],
    });
    expect(lines).toHaveLength(1);
    expect(lines[0]!.status).toBe("empty");
  });
});

describe("late-arriving data and partial-day reruns", () => {
  it("a late provider figure changes the fingerprint; the same figure again does not", () => {
    const first = dayLine(run({ providerResult: ok([pline("2026-09-18", "m", 1_000_000)]), internal: [iline("2026-09-18", "m", 1_000_000)] }), "2026-09-18");
    const same = dayLine(run({ providerResult: ok([pline("2026-09-18", "m", 1_000_000)]), internal: [iline("2026-09-18", "m", 1_000_000)] }), "2026-09-18");
    const late = dayLine(
      run({ providerResult: ok([pline("2026-09-18", "m", 1_000_000), pline("2026-09-18", "m", 900_000, "cache_read")]), internal: [iline("2026-09-18", "m", 1_000_000)] }),
      "2026-09-18",
    );
    expect(reconciliationFingerprint(same)).toBe(reconciliationFingerprint(first));
    expect(reconciliationFingerprint(late)).not.toBe(reconciliationFingerprint(first));
    expect(late).toMatchObject({ status: "under_recorded", unattributedMicros: n(900_000) });
  });

  it("a pending day becomes final on a later run without touching earlier observations", () => {
    const window = { startDay: "2026-09-22", endDay: "2026-09-22" };
    const input = { window, providerResult: ok([pline("2026-09-22", "m", 1_000_000)]), internal: [iline("2026-09-22", "m", 1_000_000)] };
    const early = dayLine(run({ ...input, now: NOW }), "2026-09-22");
    const later = dayLine(run({ ...input, now: new Date("2026-09-25T00:00:00Z") }), "2026-09-22");
    expect(early).toMatchObject({ status: "pending", finality: "provisional" });
    expect(later).toMatchObject({ status: "matched", finality: "final" });
    expect(reconciliationFingerprint(later)).not.toBe(reconciliationFingerprint(early));
  });

  it("a partial-window rerun only reports days inside its window", () => {
    const full = run({ providerResult: ok([pline("2026-09-18", "m", 1), pline("2026-09-20", "m", 1)]) });
    const partial = run({ window: { startDay: "2026-09-20", endDay: "2026-09-20" }, providerResult: ok([pline("2026-09-18", "m", 1), pline("2026-09-20", "m", 1)]) });
    expect(new Set(full.map((l) => l.day))).toEqual(new Set(["2026-09-18", "2026-09-19", "2026-09-20"]));
    expect(new Set(partial.map((l) => l.day))).toEqual(new Set(["2026-09-20"]));
    expect(dayLine(partial, "2026-09-20")).toEqual(dayLine(full, "2026-09-20"));
  });
});

describe("internal daily lines", () => {
  const base: Omit<InternalReconcileRow, "occurredAt"> = {
    entryType: "usage",
    estimatedCostMicros: n(1_000),
    actualCostMicros: null,
    adjustmentDeltaMicros: null,
    costSource: "registry_estimate",
    credentialSource: "platform",
    fixture: false,
    provider: "openai",
    responseModel: "gpt-4o-mini-2024-07-18",
  };

  it("sums platform events per provider/day/model, counts unknown, and never mutates the rows", () => {
    const rows: InternalReconcileRow[] = [
      { ...base, occurredAt: new Date("2026-09-18T01:00:00Z") },
      { ...base, occurredAt: new Date("2026-09-18T23:59:59Z"), actualCostMicros: n(2_000) },
      { ...base, occurredAt: new Date("2026-09-18T05:00:00Z"), estimatedCostMicros: null, costSource: "unknown" },
      { ...base, occurredAt: new Date("2026-09-18T06:00:00Z"), entryType: "adjustment", estimatedCostMicros: null, adjustmentDeltaMicros: n(-500), costSource: "reconciled_adjustment" },
      { ...base, occurredAt: new Date("2026-09-18T07:00:00Z"), credentialSource: "user_byok" },
      { ...base, occurredAt: new Date("2026-09-18T08:00:00Z"), fixture: true, credentialSource: "none", estimatedCostMicros: n(0) },
      { ...base, occurredAt: new Date("2026-09-19T00:00:00Z") },
    ];
    const snapshot = structuredClone(rows);
    const lines = internalDailyLines("resumatch", rows);
    expect(rows).toEqual(snapshot);
    expect(lines).toEqual([
      { app: "resumatch", provider: "openai", day: "2026-09-18", modelKey: "gpt-4o-mini", eventCount: 3, unknownCount: 1, knownMicros: n(2_500) },
      { app: "resumatch", provider: "openai", day: "2026-09-19", modelKey: "gpt-4o-mini", eventCount: 1, unknownCount: 0, knownMicros: n(1_000) },
    ]);
  });

  it("round-trips through the wire shape", () => {
    const line = iline("2026-09-18", "m", 123_456_789);
    expect(internalLineFromWire(internalLineToWire(line))).toEqual(line);
    expect(internalLineToWire(line).knownMicros).toBe("123456789");
  });
});

describe("summary", () => {
  it("counts day-level statuses and totals only", () => {
    const lines = run({
      providerResult: ok([pline("2026-09-18", "a", 10_000_000), pline("2026-09-19", "a", 1_000_000)]),
      internal: [iline("2026-09-18", "a", 5_000_000), iline("2026-09-19", "a", 1_000_000)],
    });
    const s = summarizeReconciliation(lines);
    expect(s).toMatchObject({ dayCount: 3, driftDays: 1, providerMicros: n(11_000_000), internalKnownMicros: n(6_000_000), unattributedMicros: n(5_000_000) });
    expect(s.byStatus).toEqual({ under_recorded: 1, matched: 1, empty: 1 });
  });
});
