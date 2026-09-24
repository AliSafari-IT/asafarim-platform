import { describe, expect, it } from "vitest";
import { amountText, attributionLabel, kindLabel, statusBadges, usageText } from "./format";
import { parseCostQuery } from "./query";

describe("AI cost display rules (issue #591)", () => {
  it("never shows unknown cost as $0.00; keeps sub-cent precision; labels fixture zero", () => {
    expect(amountText(null, "unknown")).toMatchObject({ text: "Not tracked", unknown: true });
    expect(amountText("0", "fixture").text).toBe("$0.00");
    expect(amountText("0", "fixture").aria).toMatch(/no provider called/);
    expect(amountText("450", "estimated").text).toBe("$0.0005");
  });

  it("keeps actual / estimated / not tracked / BYOK / fixture / legacy distinct in text", () => {
    expect(statusBadges({ basis: "actual", legacy: false, credentialSource: "platform", outcome: "succeeded" })).toEqual(["Actual"]);
    expect(statusBadges({ basis: "estimated", legacy: false, credentialSource: "user_byok", outcome: "succeeded" })).toEqual(["Estimated", "BYOK"]);
    expect(statusBadges({ basis: "unknown", legacy: false, credentialSource: "platform", outcome: "cancelled" })).toEqual(["Not tracked", "Cancelled"]);
    expect(statusBadges({ basis: "fixture", legacy: false, credentialSource: "none", outcome: "degraded" })).toEqual(["Free (fixture)", "Fallback"]);
    expect(statusBadges({ basis: "estimated", legacy: true, credentialSource: "platform", outcome: "failed" })).toEqual(["Legacy", "Estimated", "Failed (still billed)"]);
  });

  it("labels shared runs as shared, never as a task's own", () => {
    expect(attributionLabel("project")).toBe("Shared project run");
    expect(attributionLabel("task")).toBe("Direct task run");
    expect(kindLabel("extract_plan")).toBe("Plan from notes");
    expect(usageText([{ bucket: "input", unit: "tokens", quantity: 1200 }, { bucket: "cached_input", unit: "tokens", quantity: 800 }, { bucket: "output", unit: "tokens", quantity: 90 }])).toBe("2,000 in (800 cached) · 90 out");
  });
});

describe("parseCostQuery", () => {
  const now = new Date("2026-09-24T12:00:00Z");
  it("parses shareable filters and drops malformed ids and kinds", () => {
    const q = parseCostQuery(new URLSearchParams("project=p_1&task=../x&operation=decompose,rm_rf&mine=1&status=unknown"), now);
    expect(q.filter).toMatchObject({ projectId: "p_1", taskId: null, operations: ["decompose"], mine: true, status: ["unknown"] });
  });
  it("the page (record) and the API (URLSearchParams) agree", () => {
    const a = parseCostQuery(new URLSearchParams("preset=7d&project=p1"), now);
    const b = parseCostQuery({ preset: "7d", project: "p1" }, now);
    expect(a.filter).toEqual(b.filter);
  });
});
