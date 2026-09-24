import { describe, expect, it } from "vitest";
import { aiUsageDictionaries } from "@/lib/locales/ai-usage";
import { costStatusBadges, itemAmountLabel } from "@/app/usage/ai/cost-view";
import { VIONTO_COST_OPERATIONS, parseViontoCostQuery } from "@/lib/server/ai/cost-query";

const t = (key: string) => (aiUsageDictionaries.en as Record<string, string>)[key] ?? key;

describe("AI cost display rules (issue #589)", () => {
  it("keeps every cost state distinct in text, not colour", () => {
    const label = (b: ReturnType<typeof costStatusBadges>) => b.map((x) => t(x.labelKey));
    expect(label(costStatusBadges({ basis: "actual", legacy: false, credentialSource: "platform" }))).toEqual(["Actual"]);
    expect(label(costStatusBadges({ basis: "estimated", legacy: false, credentialSource: "user_byok" }))).toEqual(["Estimated", "BYOK"]);
    expect(label(costStatusBadges({ basis: "unknown", legacy: true, credentialSource: "platform" }))).toEqual(["Partially tracked", "Not tracked"]);
    expect(label(costStatusBadges({ basis: "fixture", legacy: false, credentialSource: "none" }))).toEqual(["Free/fixture"]);
  });

  it("never renders unknown cost as $0.00, and keeps sub-cent precision", () => {
    const unknown = itemAmountLabel({ amountMicros: null, basis: "unknown" }, "en-US", t);
    expect(unknown.text).toBe("Not tracked");
    expect(unknown.unknown).toBe(true);
    expect(itemAmountLabel({ amountMicros: "0", basis: "fixture" }, "en-US", t).text).toBe("$0.00");
    expect(itemAmountLabel({ amountMicros: "20000", basis: "estimated", }, "en-US", t).text).toBe("$0.02");
    expect(itemAmountLabel({ amountMicros: "450", basis: "estimated" }, "en-US", t).text).toBe("$0.0005");
    expect(itemAmountLabel({ amountMicros: "1500000", basis: "actual" }, "de-DE", t).text).toMatch(/1,50/);
  });
});

describe("AI cost translations", () => {
  const langs = Object.keys(aiUsageDictionaries) as (keyof typeof aiUsageDictionaries)[];
  const enKeys = Object.keys(aiUsageDictionaries.en).sort();

  it("ships the same keys in every supported language", () => {
    expect(langs.sort()).toEqual(["de", "en", "fr", "lb", "nl"]);
    for (const lang of langs) expect(Object.keys(aiUsageDictionaries[lang]).sort(), lang).toEqual(enKeys);
  });

  it("labels every instrumented category", () => {
    for (const op of VIONTO_COST_OPERATIONS) expect(enKeys).toContain(`vionto.aiUsage.op.${op}`);
  });

  it("never calls provider cost an invoice or a charge in the headline copy", () => {
    expect(aiUsageDictionaries.en["vionto.aiUsage.cardEffective"]).toBe("AI provider cost");
    expect(aiUsageDictionaries.en["vionto.aiUsage.notInvoice"]).toMatch(/not a bill or an invoice/);
  });
});

describe("parseViontoCostQuery", () => {
  const now = new Date("2026-09-24T12:00:00Z");
  it("maps URL filters and rejects malformed ids", () => {
    const q = parseViontoCostQuery(new URLSearchParams("projectId=p_1&exportId=../x&category=tts,bogus&payer=user_byok&unattached=1"), now);
    expect(q.filter.projectId).toBe("p_1");
    expect(q.filter.exportId).toBeNull();
    expect(q.filter.operations).toEqual(["tts"]);
    expect(q.filter.credential).toBe("user_byok");
    expect(q.filter.unattachedOnly).toBe(true);
  });
  it("uses inclusive UTC days for a custom range", () => {
    const q = parseViontoCostQuery(new URLSearchParams("preset=custom&from=2026-09-01&to=2026-09-01"), now);
    expect(q.filter.range.from.toISOString()).toBe("2026-09-01T00:00:00.000Z");
    expect(q.filter.range.to.toISOString()).toBe("2026-09-02T00:00:00.000Z");
  });
});
