import { describe, expect, it } from "vitest";
import { groundJobFetchOutput, groundingTokens, supportedShare } from "./grounding";

const evidence = (pageText: string) => ({ title: null, employer: null, text: "", pageText });
const vdabShell = evidence("Vacature Senior Java Developer bij Stad Gent | VDAB\nVDAB\nBekijk deze vacature op VDAB\nLaden");

describe("job-fetch grounding (#521)", () => {
  it("normalizes case, accents and Benelux gender markers", () => {
    expect(groundingTokens("Développeur Java (m/v/x) – Liège")).toEqual(["developpeur", "java", "liege"]);
  });

  it("counts the share of a value's words found on the page", () => {
    const page = new Set(groundingTokens("senior java developer stad gent"));
    expect(supportedShare("Senior Java Developer", page)).toBe(1);
    expect(supportedShare("Java Architect", page)).toBe(0.5);
    expect(supportedShare("—", page)).toBe(1);
  });

  it("is unverifiable without evidence or with a near-empty page", () => {
    expect(groundJobFetchOutput({ title: "Anything", employer: "Anyone" }, null)).toEqual({ status: "unverifiable", mismatched: [] });
    expect(groundJobFetchOutput({ title: "Anything", employer: "Anyone" }, evidence("Loading"))).toEqual({
      status: "unverifiable",
      mismatched: [],
    });
  });

  it("accepts values the page states, reworded or accented differently", () => {
    expect(groundJobFetchOutput({ title: "Senior Java developer (m/v/x)", employer: "Stad Gent" }, vdabShell)).toEqual({
      status: "grounded",
      mismatched: [],
    });
  });

  it("flags each field the page does not support", () => {
    expect(groundJobFetchOutput({ title: "Senior Java Developer", employer: "Google" }, vdabShell)).toEqual({
      status: "mismatch",
      mismatched: ["employer"],
    });
  });

  it("does not flag a missing value", () => {
    expect(groundJobFetchOutput({ title: null, employer: null }, vdabShell).status).toBe("grounded");
  });
});
