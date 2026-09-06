import { describe, expect, it } from "vitest";
import { computeWindow } from "./window";

describe("computeWindow", () => {
  const base = { viewportHeight: 400, rowHeight: 40, count: 1000, overscan: 5 };

  it("at the top: starts at 0, pads the rest below", () => {
    const w = computeWindow({ ...base, scrollTop: 0 });
    expect(w.start).toBe(0);
    expect(w.end).toBe(15); // 10 visible + 5 overscan
    expect(w.padTop).toBe(0);
    expect(w.padBottom).toBe((1000 - 15) * 40);
    expect(w.totalHeight).toBe(40_000);
  });

  it("scrolled mid-list: window follows scrollTop with overscan both sides", () => {
    const w = computeWindow({ ...base, scrollTop: 4000 }); // row 100
    expect(w.start).toBe(95);
    expect(w.end).toBe(115);
    expect(w.padTop).toBe(95 * 40);
    expect(w.padTop + (w.end - w.start) * 40 + w.padBottom).toBe(w.totalHeight);
  });

  it("near the bottom: end clamps to count", () => {
    const w = computeWindow({ ...base, scrollTop: 40_000 });
    expect(w.end).toBe(1000);
    expect(w.padBottom).toBe(0);
  });

  it("empty list: everything zero", () => {
    expect(computeWindow({ ...base, count: 0, scrollTop: 0 })).toEqual({
      start: 0,
      end: 0,
      padTop: 0,
      padBottom: 0,
      totalHeight: 0,
    });
  });

  it("negative scrollTop is treated as 0", () => {
    expect(computeWindow({ ...base, scrollTop: -50 }).start).toBe(0);
  });
});
