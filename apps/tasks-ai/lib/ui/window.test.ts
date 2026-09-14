import { describe, expect, it } from "vitest";
import { computeWindow, rowIndices } from "./window";

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

describe("rowIndices", () => {
  it("without an active row: exactly the window", () => {
    expect(rowIndices({ start: 10, end: 14 }, 100)).toEqual([10, 11, 12, 13]);
  });

  it("active row inside the window is not duplicated", () => {
    expect(rowIndices({ start: 10, end: 14 }, 100, 12)).toEqual([10, 11, 12, 13]);
  });

  it("active row above the window is prepended, keeping the list ascending", () => {
    expect(rowIndices({ start: 10, end: 13 }, 100, 3)).toEqual([3, 10, 11, 12]);
  });

  it("active row below the window is appended, keeping the list ascending", () => {
    expect(rowIndices({ start: 10, end: 13 }, 100, 40)).toEqual([10, 11, 12, 40]);
  });

  it("out-of-range or absent active index adds nothing", () => {
    expect(rowIndices({ start: 0, end: 2 }, 3, 99)).toEqual([0, 1]);
    expect(rowIndices({ start: 0, end: 2 }, 3, -1)).toEqual([0, 1]);
    expect(rowIndices({ start: 0, end: 2 }, 3, undefined)).toEqual([0, 1]);
  });

  it("empty window with an active row still renders that row", () => {
    expect(rowIndices({ start: 0, end: 0 }, 5, 2)).toEqual([2]);
  });

  // The regression this guards (PR #376 review): the active row used to be
  // rendered from a second JSX site keyed `active-${i}` once it fell outside
  // the window, so crossing the boundary unmounted the focused node and sent
  // focus back to the document. One ascending list means the row keeps the
  // same key — and, because the list only gains and loses indices at its
  // ends, the same DOM position — across the transition.
  it("the active row keeps one identity and position as the window scrolls past it", () => {
    const active = 20;
    const inside = rowIndices({ start: 16, end: 26 }, 100, active);
    const leaving = rowIndices({ start: 21, end: 31 }, 100, active);
    const farBelow = rowIndices({ start: 60, end: 70 }, 100, active);

    for (const list of [inside, leaving, farBelow]) {
      expect(list.filter((i) => i === active)).toHaveLength(1);
      expect([...list]).toEqual([...list].sort((a, b) => a - b));
    }
    // The active row is the first entry both while the window still holds it
    // and after the window has moved below it: no sibling reordering around
    // the focused node.
    expect(inside.indexOf(active)).toBe(4);
    expect(leaving.indexOf(active)).toBe(0);
    expect(farBelow.indexOf(active)).toBe(0);
  });
});
