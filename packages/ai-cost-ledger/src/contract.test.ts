import { describe, expect, it } from "vitest";
import {
  MAX_MICROS,
  MicrosOverflowError,
  addRow,
  buildIdempotencyKey,
  coverageBasisPoints,
  coverageStatus,
  createPricingRegistry,
  decodeCursor,
  effectiveCost,
  emptyTotals,
  encodeCursor,
  estimateCost,
  formatMicros,
  groupTotals,
  legacyUsdFloatToMicros,
  mergeTotals,
  microsToDecimalString,
  multiplyRate,
  normalizeAnthropicUsage,
  normalizeOpenAiUsage,
  parseCostEventWrite,
  perMillionTokens,
  resolveRange,
  simpleTokenUsage,
  sumMicros,
  summarize,
  totalsToDTO,
  usdDecimalToMicros,
  type AggregatableRow,
  type CostEventWriteInput,
} from "./index";

const registry = createPricingRegistry("test-2026-09-24", [
  {
    provider: "openai",
    model: "gpt-4.1-mini*",
    rates: [
      perMillionTokens("input", "0.40"),
      perMillionTokens("cached_input", "0.10"),
      perMillionTokens("output", "1.60"),
      perMillionTokens("reasoning_output", "1.60"),
    ],
  },
  { provider: "openai", model: "gpt-4.1*", rates: [perMillionTokens("input", "2"), perMillionTokens("output", "8")] },
  {
    provider: "anthropic",
    model: "claude-sonnet-5",
    rates: [
      perMillionTokens("input", "2"),
      perMillionTokens("cached_input", "0.20"),
      perMillionTokens("cache_write_input", "2.50"),
      perMillionTokens("output", "10"),
    ],
  },
]);

function baseEvent(overrides: Partial<CostEventWriteInput> = {}): CostEventWriteInput {
  return {
    idempotencyKey: "resumatch:tailor:req_123",
    app: "resumatch",
    ownerType: "workspace",
    ownerId: "ws_1",
    operation: "tailor",
    subjectType: "target_job",
    subjectId: "job_1",
    provider: "openai",
    responseModel: "gpt-4.1-mini-2025-04-14",
    costSource: "registry_estimate",
    credentialSource: "platform",
    estimatedCostMicros: 1234n,
    pricingSnapshot: registry.lookup("openai", "gpt-4.1-mini-2025-04-14"),
    occurredAt: new Date("2026-09-24T10:00:00Z"),
    ...overrides,
  };
}

function row(overrides: Partial<AggregatableRow> = {}): AggregatableRow {
  return {
    entryType: "usage",
    estimatedCostMicros: null,
    actualCostMicros: null,
    adjustmentDeltaMicros: null,
    costSource: "unknown",
    credentialSource: "platform",
    fixture: false,
    ...overrides,
  };
}

describe("money", () => {
  it("parses decimal strings without float drift and rounds half-up at the 7th digit", () => {
    expect(usdDecimalToMicros("0.1")).toBe(100_000n);
    expect(usdDecimalToMicros("12.3456785")).toBe(12_345_679n);
    expect(usdDecimalToMicros("12.3456784")).toBe(12_345_678n);
    expect(usdDecimalToMicros("-0.000001")).toBe(-1n);
  });

  it("sums many small amounts exactly where float would drift", () => {
    const tenCents = Array.from({ length: 1000 }, () => 100_000n);
    expect(sumMicros(tenCents)).toBe(100_000_000n);
    let float = 0;
    for (let i = 0; i < 1000; i++) float += 0.1;
    expect(float).not.toBe(100);
  });

  it("refuses to overflow a Postgres BIGINT", () => {
    expect(() => sumMicros([MAX_MICROS, 1n])).toThrow(MicrosOverflowError);
    const t = emptyTotals();
    t.effectiveKnownMicros = MAX_MICROS;
    expect(() => addRow(t, row({ estimatedCostMicros: 1n, costSource: "registry_estimate" }))).toThrow(
      MicrosOverflowError,
    );
  });

  it("multiplies rates in integer space with half-up rounding", () => {
    // 1,234 tokens at $0.15 / 1M = $0.0001851 → 185.1 micros → 185
    expect(multiplyRate(1234n, 150_000n, 1_000_000n)).toBe(185n);
    // 1,237 tokens → 185.55 → 186
    expect(multiplyRate(1237n, 150_000n, 1_000_000n)).toBe(186n);
  });

  it("formats sub-cent amounts instead of collapsing them to $0.00", () => {
    expect(formatMicros(1234n)).toBe("$0.0012");
    expect(formatMicros(12_500_000n)).toBe("$12.50");
    expect(formatMicros(1_500_000n, { locale: "nl-NL" })).toMatch(/1,50/);
    expect(microsToDecimalString(-1_500_001n)).toBe("-1.500001");
  });

  it("bridges legacy float columns", () => {
    expect(legacyUsdFloatToMicros(0.000185)).toBe(185n);
    expect(legacyUsdFloatToMicros(0.1 + 0.2)).toBe(300_000n);
  });
});

describe("usage normalization", () => {
  it("splits OpenAI's inclusive prompt/completion counts into exclusive buckets", () => {
    const usage = normalizeOpenAiUsage({
      prompt_tokens: 1000,
      completion_tokens: 500,
      prompt_tokens_details: { cached_tokens: 600 },
      completion_tokens_details: { reasoning_tokens: 300 },
    });
    expect(usage).toEqual([
      { bucket: "input", unit: "tokens", quantity: 400 },
      { bucket: "cached_input", unit: "tokens", quantity: 600 },
      { bucket: "output", unit: "tokens", quantity: 200 },
      { bucket: "reasoning_output", unit: "tokens", quantity: 300 },
    ]);
    const sum = usage.reduce((n, l) => n + l.quantity, 0);
    expect(sum).toBe(1500); // no token counted twice
  });

  it("rejects a sub-count larger than its inclusive total", () => {
    expect(() => normalizeOpenAiUsage({ prompt_tokens: 10, prompt_tokens_details: { cached_tokens: 11 } })).toThrow();
  });

  it("keeps Anthropic's already-exclusive cache counts as separate buckets", () => {
    expect(
      normalizeAnthropicUsage({
        input_tokens: 50,
        output_tokens: 20,
        cache_read_input_tokens: 1000,
        cache_creation_input_tokens: 200,
      }),
    ).toEqual([
      { bucket: "input", unit: "tokens", quantity: 50 },
      { bucket: "cached_input", unit: "tokens", quantity: 1000 },
      { bucket: "cache_write_input", unit: "tokens", quantity: 200 },
      { bucket: "output", unit: "tokens", quantity: 20 },
    ]);
  });

  it("rejects duplicated buckets on write", () => {
    expect(() =>
      parseCostEventWrite(
        baseEvent({
          usage: [
            { bucket: "input", unit: "tokens", quantity: 1 },
            { bucket: "input", unit: "tokens", quantity: 2 },
          ],
        }),
      ),
    ).toThrow(/exclusive/);
  });
});

describe("pricing", () => {
  it("prefers the longest matching prefix and snapshots the table version", () => {
    const snap = registry.lookup("openai", "gpt-4.1-mini-2025-04-14");
    expect(snap?.model).toBe("gpt-4.1-mini*");
    expect(snap?.pricingVersion).toBe("test-2026-09-24");
    expect(registry.lookup("openai", "gpt-4.1-2025")?.model).toBe("gpt-4.1*");
    expect(registry.lookup("openai", "o9-unknown")).toBeNull();
  });

  it("prices cached and reasoning tokens at their own rates", () => {
    const usage = normalizeOpenAiUsage({
      prompt_tokens: 1_000_000,
      completion_tokens: 1_000_000,
      prompt_tokens_details: { cached_tokens: 500_000 },
      completion_tokens_details: { reasoning_tokens: 250_000 },
    });
    const est = estimateCost(usage, registry.lookup("openai", "gpt-4.1-mini")!);
    // 0.5M×0.40 + 0.5M×0.10 + 0.75M×1.60 + 0.25M×1.60 = 0.20+0.05+1.20+0.40 = $1.85
    expect(est.costMicros).toBe(1_850_000n);
  });

  it("returns unknown — not a partial sum — when a used bucket has no rate", () => {
    const est = estimateCost(
      normalizeOpenAiUsage({ prompt_tokens: 100, prompt_tokens_details: { cached_tokens: 50 } }),
      registry.lookup("openai", "gpt-4.1")!,
    );
    expect(est.costMicros).toBeNull();
    expect(est.unpricedBuckets).toEqual(["cached_input:tokens"]);
  });

  it("prices Anthropic cache writes separately", () => {
    const est = estimateCost(
      normalizeAnthropicUsage({ input_tokens: 1_000_000, cache_creation_input_tokens: 1_000_000, output_tokens: 100_000 }),
      registry.lookup("anthropic", "claude-sonnet-5")!,
    );
    expect(est.costMicros).toBe(2_000_000n + 2_500_000n + 1_000_000n);
  });
});

describe("event write validation", () => {
  it("accepts a registry estimate and fills defaults", () => {
    const e = parseCostEventWrite(baseEvent({ usage: simpleTokenUsage(100, 50) }));
    expect(e.schemaVersion).toBe(1);
    expect(e.entryType).toBe("usage");
    expect(e.finality).toBe("provisional");
    expect(e.estimatedCostMicros).toBe(1234n);
  });

  it("keeps unknown cost distinct from genuine zero", () => {
    expect(() => parseCostEventWrite(baseEvent({ costSource: "unknown", estimatedCostMicros: 0n }))).toThrow(
      /never a placeholder 0/,
    );
    const unknown = parseCostEventWrite(baseEvent({ costSource: "unknown", estimatedCostMicros: null, pricingSnapshot: null }));
    expect(effectiveCost({ ...unknown, fixture: false }).basis).toBe("unknown");
    expect(effectiveCost({ ...unknown }).amountMicros).toBeNull();
  });

  it("records fixture calls as a known $0 with no credential", () => {
    const fixture = parseCostEventWrite(
      baseEvent({ fixture: true, credentialSource: "none", estimatedCostMicros: 0n, pricingSnapshot: null, provider: "fixture" }),
    );
    expect(effectiveCost(fixture)).toEqual({ amountMicros: 0n, basis: "fixture" });
    expect(() => parseCostEventWrite(baseEvent({ fixture: true, credentialSource: "platform", estimatedCostMicros: 0n }))).toThrow();
  });

  it("requires a pricing snapshot for estimates and an amount for provider-reported cost", () => {
    expect(() => parseCostEventWrite(baseEvent({ pricingSnapshot: null }))).toThrow(/snapshot/);
    expect(() =>
      parseCostEventWrite(baseEvent({ costSource: "provider_reported", actualCostMicros: null })),
    ).toThrow(/actualCostMicros/);
    const actual = parseCostEventWrite(baseEvent({ costSource: "provider_reported", actualCostMicros: "2000" }));
    expect(effectiveCost(actual)).toEqual({ amountMicros: 2000n, basis: "actual" });
  });

  it("validates adjustment rows", () => {
    expect(() =>
      parseCostEventWrite(baseEvent({ entryType: "adjustment", costSource: "reconciled_adjustment", adjustmentDeltaMicros: -10n })),
    ).toThrow(/supersedesEventId/);
    const adj = parseCostEventWrite(
      baseEvent({
        entryType: "adjustment",
        costSource: "reconciled_adjustment",
        estimatedCostMicros: null,
        pricingSnapshot: null,
        adjustmentDeltaMicros: -10n,
        supersedesEventId: "evt_1",
        finality: "final",
      }),
    );
    expect(effectiveCost(adj)).toEqual({ amountMicros: -10n, basis: "adjustment" });
  });

  it("rejects metadata that looks like user content or secrets", () => {
    expect(() => parseCostEventWrite(baseEvent({ metadata: { prompt: "hello" } }))).toThrow(/not allowed/);
    expect(() => parseCostEventWrite(baseEvent({ metadata: { openaiApiKey: "sk-" } }))).toThrow(/not allowed/);
    expect(() => parseCostEventWrite(baseEvent({ metadata: { nested: { a: 1 } as never } }))).toThrow();
    expect(parseCostEventWrite(baseEvent({ metadata: { attempt: 2, cacheHit: false } })).metadata).toEqual({
      attempt: 2,
      cacheHit: false,
    });
  });

  it("rejects fractional micros (dollars passed as micros)", () => {
    expect(() => parseCostEventWrite(baseEvent({ estimatedCostMicros: 0.25 as unknown as bigint }))).toThrow();
  });

  it("builds deterministic idempotency keys", () => {
    expect(buildIdempotencyKey("resumatch", "tailor", "req_1")).toBe("resumatch:tailor:req_1");
    expect(() => buildIdempotencyKey("a", "b", "x".repeat(300))).toThrow();
  });
});

describe("aggregation", () => {
  const rows: (AggregatableRow & { job: string })[] = [
    { ...row({ actualCostMicros: 1000n, costSource: "provider_reported" }), job: "a" },
    { ...row({ estimatedCostMicros: 500n, costSource: "registry_estimate", credentialSource: "user_byok" }), job: "a" },
    { ...row({ fixture: true, estimatedCostMicros: 0n, costSource: "registry_estimate", credentialSource: "none" }), job: "b" },
    { ...row({}), job: "b" },
    { ...row({ entryType: "adjustment", adjustmentDeltaMicros: -100n, costSource: "reconciled_adjustment" }), job: "a" },
    { ...row({ estimatedCostMicros: 250n, costSource: "registry_estimate", legacy: true }), job: "unattributed" },
  ];

  it("keeps unknowns out of the amount and reports coverage", () => {
    const t = summarize(rows);
    expect(t.eventCount).toBe(5);
    expect(t.unknownCount).toBe(1);
    expect(t.knownCount).toBe(4);
    expect(t.effectiveKnownMicros).toBe(1000n + 500n + 0n - 100n + 250n);
    expect(t.actualMicros).toBe(1000n);
    expect(t.estimatedMicros).toBe(750n);
    expect(t.byokMicros).toBe(500n);
    expect(t.fixtureCount).toBe(1);
    expect(t.adjustmentCount).toBe(1);
    expect(coverageBasisPoints(t)).toBe(8000);
    expect(coverageStatus(t)).toBe("partial");
  });

  it("group subtotals add up to the grand total", () => {
    const { groups, total } = groupTotals(rows, (r) => r.job);
    const merged = groups.map((g) => g.totals).reduce(mergeTotals, emptyTotals());
    expect(merged).toEqual(total);
    expect(groups.find((g) => g.key === "a")?.totals.effectiveKnownMicros).toBe(1400n);
  });

  it("distinguishes an empty period from full coverage", () => {
    const t = emptyTotals();
    expect(coverageBasisPoints(t)).toBeNull();
    expect(coverageStatus(t)).toBe("empty");
    expect(coverageStatus(summarize([row({})]))).toBe("unknown");
    expect(totalsToDTO(summarize([row({ actualCostMicros: 1n, costSource: "provider_reported" })])).coverage).toBe("complete");
  });
});

describe("timeline read model", () => {
  it("round-trips an opaque cursor and rejects garbage", () => {
    const c = { occurredAt: new Date("2026-09-01T00:00:00Z"), id: "evt_9" };
    expect(decodeCursor(encodeCursor(c))).toEqual(c);
    expect(decodeCursor("not-a-cursor")).toBeNull();
    expect(decodeCursor(undefined)).toBeNull();
  });

  it("resolves presets to UTC boundaries and clamps custom ranges", () => {
    const now = new Date("2026-09-24T15:30:00Z");
    expect(resolveRange({ preset: "month" }, now)).toMatchObject({
      from: new Date("2026-09-01T00:00:00Z"),
      to: new Date("2026-09-25T00:00:00Z"),
    });
    expect(resolveRange({ preset: "prev_month" }, now)).toMatchObject({
      from: new Date("2026-08-01T00:00:00Z"),
      to: new Date("2026-09-01T00:00:00Z"),
    });
    const wide = resolveRange({ preset: "custom", from: "2000-01-01T00:00:00Z", to: "2026-09-24T00:00:00Z" }, now, 30);
    expect((wide.to.getTime() - wide.from.getTime()) / 86_400_000).toBe(30);
  });
});

describe("portability", () => {
  it("uses no bigint literals in shipped source (consumers compile below ES2020)", async () => {
    const { readdirSync, readFileSync } = await import("node:fs");
    const { join } = await import("node:path");
    const dir = join(__dirname);
    for (const file of readdirSync(dir).filter((f) => f.endsWith(".ts") && !f.endsWith(".test.ts"))) {
      const code = readFileSync(join(dir, file), "utf8").replace(/\/\*[\s\S]*?\*\/|\/\/.*$/gm, "");
      expect(code, file).not.toMatch(/(?<![\w."'])\d[\d_]*n\b/);
    }
  });
});
