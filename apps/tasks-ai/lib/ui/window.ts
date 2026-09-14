/**
 * Fixed-row list windowing (docs: M11 performance budgets — "virtualize
 * large work lists"). Pure maths so it is unit-tested without the DOM. The
 * component (components/tasks/VirtualList.tsx) is a thin shell around this.
 */
export interface WindowInput {
  scrollTop: number;
  viewportHeight: number;
  rowHeight: number;
  count: number;
  /** rows rendered above/below the viewport to hide scroll seams */
  overscan?: number;
}

export interface WindowRange {
  start: number;
  end: number; // exclusive
  /** px spacer before the first rendered row */
  padTop: number;
  /** px spacer after the last rendered row */
  padBottom: number;
  totalHeight: number;
}

export function computeWindow(input: WindowInput): WindowRange {
  const overscan = input.overscan ?? 6;
  const rh = Math.max(1, input.rowHeight);
  const total = input.count * rh;
  if (input.count === 0) {
    return { start: 0, end: 0, padTop: 0, padBottom: 0, totalHeight: 0 };
  }
  const first = Math.floor(Math.max(0, input.scrollTop) / rh);
  const visible = Math.ceil(input.viewportHeight / rh);
  const start = Math.max(0, first - overscan);
  const end = Math.min(input.count, first + visible + overscan);
  return {
    start,
    end,
    padTop: start * rh,
    padBottom: (input.count - end) * rh,
    totalHeight: total,
  };
}

/**
 * The row indices a windowed list must render: the window itself plus the
 * caller's active row when the window has scrolled past it.
 *
 * Returned as one ascending list on purpose. The active row must be a single
 * keyed instance whether it is inside the window or outside it — rendering it
 * from a second JSX site with a different key makes React unmount and remount
 * it when it crosses the window boundary, which drops DOM focus (and with it
 * keyboard/screen-reader navigation) back to the document. Keeping the list
 * sorted also means a scroll only adds and removes indices at the ends, so
 * surviving rows — the focused one included — are never even moved in the DOM.
 */
export function rowIndices(
  window: Pick<WindowRange, "start" | "end">,
  count: number,
  activeIndex?: number,
): number[] {
  const out: number[] = [];
  const stray =
    activeIndex !== undefined &&
    Number.isInteger(activeIndex) &&
    activeIndex >= 0 &&
    activeIndex < count &&
    (activeIndex < window.start || activeIndex >= window.end)
      ? activeIndex
      : null;
  if (stray !== null && stray < window.start) out.push(stray);
  for (let i = window.start; i < window.end; i++) out.push(i);
  if (stray !== null && stray >= window.end) out.push(stray);
  return out;
}

/** Above this many rows the list switches to windowed rendering. */
export const VIRTUALIZE_THRESHOLD = 200;
