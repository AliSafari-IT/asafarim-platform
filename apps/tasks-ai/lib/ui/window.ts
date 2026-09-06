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

/** Above this many rows the list switches to windowed rendering. */
export const VIRTUALIZE_THRESHOLD = 200;
