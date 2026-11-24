import { describe, expect, it } from "vitest";
import { activityFunnelLine, buildActivitySeries, responseDates } from "./dailySeries";

const labels = { tailored: "Tailored CVs", coverLetters: "Cover letters", applied: "Applied", responses: "Responses" };
const now = new Date("2026-11-23T10:00:00Z");

describe("buildActivitySeries", () => {
  it("returns one zero-filled, contiguous count per day for every series", () => {
    const data = buildActivitySeries(
      {
        tailored: [new Date("2026-11-23T08:00:00Z"), new Date("2026-11-21T23:59:00Z")],
        coverLetters: [],
        applied: [new Date("2026-11-23T09:00:00Z")],
        responses: [],
      },
      labels,
      3,
      now,
    );
    expect(data.days).toEqual(["2026-11-21", "2026-11-22", "2026-11-23"]);
    expect(data.series.map((s) => s.key)).toEqual(["tailored", "coverLetters", "applied", "responses"]);
    expect(data.series[0]).toEqual({ key: "tailored", label: "Tailored CVs", total: 2, counts: [1, 0, 1] });
    expect(data.series[1]!.counts).toEqual([0, 0, 0]);
    expect(data.series[2]).toMatchObject({ total: 1, counts: [0, 0, 1] });
  });

  it("ignores dates outside the window, so totals match the drawn bars", () => {
    const data = buildActivitySeries(
      { tailored: [new Date("2026-11-01T00:00:00Z")], coverLetters: [], applied: [], responses: [] },
      labels,
      14,
      now,
    );
    expect(data.days).toHaveLength(14);
    expect(data.series[0]!.total).toBe(0);
    for (const s of data.series) expect(s.total).toBe(s.counts.reduce((a, b) => a + b, 0));
  });
});

describe("responseDates", () => {
  const at = (iso: string, metadata: unknown) => ({ createdAt: new Date(iso), metadata });
  const change = (fromStatus: string, toStatus: string) => ({ applicationId: "a1", fromStatus, toStatus });

  it("counts only moves to Interviewing, Offer or Rejected", () => {
    const dates = responseDates([
      at("2026-11-20T10:00:00Z", change("SAVED", "APPLIED")),
      at("2026-11-21T10:00:00Z", change("APPLIED", "INTERVIEWING")),
      at("2026-11-22T10:00:00Z", change("INTERVIEWING", "OFFER")),
      at("2026-11-23T10:00:00Z", change("APPLIED", "REJECTED")),
      at("2026-11-23T11:00:00Z", change("REJECTED", "SAVED")),
    ]);
    expect(dates.map((d) => d.toISOString().slice(0, 10))).toEqual(["2026-11-21", "2026-11-22", "2026-11-23"]);
  });

  it("skips malformed metadata", () => {
    expect(
      responseDates([
        at("2026-11-21T10:00:00Z", null),
        at("2026-11-21T10:00:00Z", { toStatus: "OFFER" }),
        at("2026-11-21T10:00:00Z", "OFFER"),
      ]),
    ).toEqual([]);
  });
});

describe("activityFunnelLine", () => {
  // A stand-in translator: the key's last segment plus its variables, so the
  // test checks which strings are picked and what they get, not the wording.
  const t = (key: string, vars: Record<string, string | number> = {}) => {
    if (key.endsWith("funnel.sentence")) return `${vars.parts}${vars.rate}.`;
    const tail = key.replace("resumatch.tailor.activity.funnel.", "");
    return `${tail}=${Object.values(vars).join("/")}`;
  };

  it("gives the response rate when something was applied", () => {
    expect(activityFunnelLine(t, { tailored: 17, applied: 6, responses: 1 }, 0)).toBe(
      "tailored.other=17, applied=6, responses.one=1 rate=17.",
    );
  });

  it("leaves the rate out when nothing was applied", () => {
    expect(activityFunnelLine(t, { tailored: 1, applied: 0, responses: 0 }, 0)).toBe(
      "tailored.one=1, applied=0, responses.other=0.",
    );
  });

  it("adds the degraded-run note only when there were any", () => {
    expect(activityFunnelLine(t, { tailored: 2, applied: 0, responses: 0 }, 2)).toBe(
      "tailored.other=2, applied=0, responses.other=0. degraded.other=2",
    );
  });
});
