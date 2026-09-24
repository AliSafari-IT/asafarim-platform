import { describe, expect, it } from "vitest";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import type { TimelineItemDTO } from "@asafarim/ai-cost-ledger";
import { amountDisplay, basisBadge, coveragePercent, operationLabel, payerLabel, usageSummary } from "./format";
import { parseCostQuery } from "./query";
import { CostItem } from "../../app/ai-usage/CostItem";

describe("amountDisplay — the honesty rules (issue #587)", () => {
  it("never renders unknown cost as $0.00", () => {
    const unknown = amountDisplay(null, "unknown");
    expect(unknown.text).toBe("Not tracked");
    expect(unknown.text).not.toMatch(/\$0/);
    expect(unknown.tone).toBe("unknown");
  });

  it("shows a genuine fixture zero as $0.00 with its reason", () => {
    const free = amountDisplay("0", "fixture");
    expect(free.text).toBe("$0.00");
    expect(free.label).toMatch(/no AI provider was called/);
    expect(free.tone).toBe("free");
  });

  it("keeps sub-cent precision and says whether an amount is estimated or actual", () => {
    // $0.00045 shown at 4 decimals — a sub-cent call never collapses to $0.00.
    expect(amountDisplay("450", "estimated").text).toBe("$0.0005");
    expect(amountDisplay("450", "estimated").label).toMatch(/estimated/);
    expect(amountDisplay("1250000", "actual").label).toMatch(/provider-reported/);
  });

  it("formats per locale", () => {
    expect(amountDisplay("1500000", "estimated", "de-DE").text).toMatch(/1,50/);
  });
});

describe("labels", () => {
  it("names every ResuMatch step and distinguishes cost states in text, not only colour", () => {
    expect(operationLabel("cover_letter")).toBe("Cover letter");
    expect(operationLabel("something_new")).toBe("something new");
    expect(basisBadge("estimated", false).text).toBe("Estimated");
    expect(basisBadge("actual", false).text).toBe("Actual");
    expect(basisBadge("unknown", false).text).toBe("Not tracked");
    expect(basisBadge("fixture", false).text).toBe("Free (fixture)");
    expect(basisBadge("estimated", true).text).toBe("Legacy");
    expect(payerLabel("user_byok")).toBe("Your API key");
    expect(payerLabel("platform")).toBe("ResuMatch's key");
  });

  it("summarizes exclusive usage buckets without double counting", () => {
    expect(
      usageSummary([
        { bucket: "input", unit: "tokens", quantity: 400 },
        { bucket: "cached_input", unit: "tokens", quantity: 600 },
        { bucket: "output", unit: "tokens", quantity: 200 },
        { bucket: "reasoning_output", unit: "tokens", quantity: 300 },
        { bucket: "tool_call", unit: "calls", quantity: 2 },
      ]),
    ).toBe("1,000 in (600 cached) · 500 out (300 reasoning) · 2 web searches");
    expect(usageSummary([])).toBe("No usage reported");
  });

  it("reports 'no data' coverage as null, never 100%", () => {
    expect(coveragePercent(null)).toBeNull();
    expect(coveragePercent(9999)).toBe(99);
  });
});

describe("parseCostQuery", () => {
  const now = new Date("2026-09-24T12:00:00Z");

  it("defaults to the last 30 days and ignores unknown operations", () => {
    const q = parseCostQuery({ operation: "tailor,drop_tables" }, now);
    expect(q.filter.range.preset).toBe("30d");
    expect(q.filter.operations).toEqual(["tailor"]);
  });

  it("accepts only well-formed job/group ids", () => {
    expect(parseCostQuery({ job: "ck123_abc-9" }, now).filter.targetJobId).toBe("ck123_abc-9");
    expect(parseCostQuery({ job: "../../etc" }, now).filter.targetJobId).toBeNull();
    expect(parseCostQuery({ group: "job:abc" }, now).filter.group).toBe("job:abc");
    expect(parseCostQuery({ group: "everything" }, now).filter.group).toBeNull();
  });

  it("maps custom date inputs to inclusive UTC days", () => {
    const q = parseCostQuery({ preset: "custom", from: "2026-09-01", to: "2026-09-10" }, now);
    expect(q.filter.range.from.toISOString()).toBe("2026-09-01T00:00:00.000Z");
    expect(q.filter.range.to.toISOString()).toBe("2026-09-11T00:00:00.000Z");
    expect(q.values.to).toBe("2026-09-10");
  });

  it("falls back to defaults on a malformed query rather than failing the page", () => {
    const q = parseCostQuery({ preset: "forever", limit: "9999" }, now);
    expect(q.filter.range.preset).toBe("30d");
    expect(q.limit).toBe(25);
  });

  it("reads the same filter from URLSearchParams (API) and a record (page)", () => {
    const a = parseCostQuery(new URLSearchParams("preset=7d&status=unknown,fixture&provider=openai"), now);
    const b = parseCostQuery({ preset: "7d", status: "unknown,fixture", provider: "openai" }, now);
    expect(a.filter).toEqual(b.filter);
    expect(a.filter.status).toEqual(["unknown", "fixture"]);
  });
});

describe("CostItem (server render)", () => {
  const base: TimelineItemDTO = {
    id: "evt_1",
    occurredAt: "2026-09-24T10:15:00.000Z",
    operation: "tailor",
    outcome: "succeeded",
    provider: "openai",
    model: "gpt-4o-mini",
    promptVersion: "tailor_resume@3",
    usage: [{ bucket: "input", unit: "tokens", quantity: 1000 }],
    amountMicros: "150",
    basis: "estimated",
    costSource: "registry_estimate",
    credentialSource: "platform",
    finality: "provisional",
    latencyMs: 1200,
    legacy: false,
    subjectType: "target_job",
    subjectId: "job_1",
    workflowId: null,
  };

  it("renders an unknown row as Not tracked with an accessible label", () => {
    const html = renderToStaticMarkup(createElement(CostItem, { item: { ...base, amountMicros: null, basis: "unknown", costSource: "unknown" } }));
    expect(html).toContain("Not tracked");
    expect(html).not.toContain("$0.00");
    expect(html).toContain('aria-label="Cost not tracked for this call"');
  });

  it("renders a stable UTC timestamp on the server, and BYOK payer text", () => {
    const html = renderToStaticMarkup(createElement(CostItem, { item: { ...base, credentialSource: "user_byok" } }));
    expect(html).toContain('dateTime="2026-09-24T10:15:00.000Z"');
    expect(html).toContain("2026-09-24 10:15 UTC");
    expect(html).toContain("Your API key");
    expect(html).toContain("Resume tailoring");
  });

  it("flags a billed-but-failed call", () => {
    const html = renderToStaticMarkup(createElement(CostItem, { item: { ...base, outcome: "failed" } }));
    expect(html).toContain("failed (still billed)");
  });
});
