import { describe, expect, it } from "vitest";
import { jobKey } from "./journey";
import { lastNDays } from "../app/components/app/Charts";
import { profileChecks } from "../app/profile/ProfileInsights";
import { emptyProfile } from "./profile/contract";

describe("jobKey", () => {
  it("treats the same posting fetched twice as one job", () => {
    const a = jobKey({ id: "a", title: "Implementation Analyst | AI-SaaS", employer: "Kingfisher IT" });
    const b = jobKey({ id: "b", title: "  implementation analyst |  AI-SaaS ", employer: "KINGFISHER IT" });
    expect(a).toBe(b);
  });

  it("keeps different employers apart", () => {
    expect(jobKey({ id: "a", title: "Analyst", employer: "Solix" })).not.toBe(
      jobKey({ id: "b", title: "Analyst", employer: "Unique Pelt" }),
    );
  });

  it("falls back to the row id when a job has no title or employer", () => {
    expect(jobKey({ id: "x1", title: null, employer: null })).toBe("id:x1");
    expect(jobKey({ id: "x1", title: null, employer: null })).not.toBe(jobKey({ id: "x2", title: null, employer: null }));
  });
});

describe("lastNDays", () => {
  const now = new Date("2026-09-26T10:00:00Z");

  it("returns a contiguous, zero-filled series ending today (UTC)", () => {
    const series = lastNDays([new Date("2026-09-25T23:59:00Z"), new Date("2026-09-25T01:00:00Z")], 3, now);
    expect(series).toEqual([
      { day: "2026-09-24", count: 0 },
      { day: "2026-09-25", count: 2 },
      { day: "2026-09-26", count: 0 },
    ]);
  });

  it("ignores timestamps outside the window", () => {
    const series = lastNDays([new Date("2026-08-01T00:00:00Z")], 14, now);
    expect(series.reduce((sum, d) => sum + d.count, 0)).toBe(0);
    expect(series).toHaveLength(14);
  });
});

describe("profileChecks", () => {
  it("flags every check on an empty profile", () => {
    expect(profileChecks(emptyProfile()).every((c) => !c.ok)).toBe(true);
  });

  it("passes each check once its section is filled", () => {
    const p = {
      ...emptyProfile(),
      fullName: "Ada Lovelace",
      email: "ada@example.com",
      headline: "Analyst",
      summary: "A long enough summary to count as a real one for tailoring.",
      skills: [{ name: "A" }, { name: "B" }, { name: "C" }],
      experience: [{ title: "Analyst" }],
      education: [{ institution: "X" }],
      languages: [{ code: "en" }],
    } as unknown as ReturnType<typeof emptyProfile>;
    const checks = profileChecks(p);
    expect(checks.filter((c) => c.ok)).toHaveLength(checks.length);
    expect(checks.find((c) => c.key === "experience")?.count).toBe(1);
  });
});
