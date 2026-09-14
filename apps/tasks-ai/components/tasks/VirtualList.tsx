"use client";

import { useEffect, useRef, useState, type MutableRefObject, type ReactNode } from "react";
import { computeWindow, rowIndices } from "../../lib/ui/window";

/**
 * What a caller driving the list from the outside — keyboard navigation, for
 * instance — can ask it to do. A windowed list cannot be scrolled by finding
 * the row and calling `scrollIntoView`: the row is not in the DOM until the
 * window moves, so moving the window has to come first.
 */
export interface VirtualListHandle {
  /** Bring row `index` inside the visible window, scrolling the least. */
  scrollToIndex: (index: number) => void;
}

/**
 * Fixed-row windowed list. Only the rows near the viewport are in the DOM;
 * spacer divs preserve the scrollbar.
 *
 * Accessibility, honestly stated (PR #375 review, M11 AT objective).
 * Windowing and assistive technology are in genuine tension: a screen reader
 * browsing the document can only reach what is mounted, so rows outside the
 * window are *not* reachable by sequential browse or Tab. What this list
 * guarantees instead is that the row a caller is navigating to is always
 * mounted — `activeIndex` is rendered even when the window has moved past it
 * — so the caller can put real DOM focus on it and a screen reader announces
 * it through ordinary focus semantics. Callers drive that with `handleRef`
 * (move the window) plus focusing the row they registered.
 *
 * Remaining limitation: free browse-mode exploration of an off-window row is
 * still not possible. Closing that properly needs either a paginated
 * non-windowed mode or a virtualizer with a full ARIA grid/listbox
 * navigation model; both are larger than this component and are tracked as
 * follow-up work rather than pretended away here.
 */
export function VirtualList<T>({
  items,
  rowHeight,
  height = 480,
  overscan = 8,
  renderRow,
  ariaLabel,
  handleRef,
  activeIndex,
}: {
  items: T[];
  rowHeight: number;
  height?: number;
  overscan?: number;
  renderRow: (item: T, index: number) => ReactNode;
  ariaLabel?: string;
  /**
   * The row the caller's keyboard cursor is on. Kept mounted regardless of
   * the window, so focusing it is always possible.
   */
  activeIndex?: number;
  /**
   * Filled with this list's imperative handle while it is mounted. A plain
   * ref object rather than `forwardRef` so the component stays generic in
   * `T` — `forwardRef` erases the type parameter.
   */
  handleRef?: MutableRefObject<VirtualListHandle | null>;
}) {
  const [scrollTop, setScrollTop] = useState(0);
  const raf = useRef<number | null>(null);
  const box = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!handleRef) return;
    handleRef.current = {
      scrollToIndex(index: number) {
        const el = box.current;
        if (!el) return;
        const top = index * rowHeight;
        const bottom = top + rowHeight;
        // Scroll only as far as it takes: an already-visible row must not
        // jump under the cursor keys.
        const next =
          top < el.scrollTop
            ? top
            : bottom > el.scrollTop + height
              ? bottom - height
              : el.scrollTop;
        if (next !== el.scrollTop) el.scrollTop = next;
        // The scroll handler is rAF-throttled; set the window straight away
        // so the row is in the DOM for the caller's follow-up focus/scroll.
        setScrollTop(next);
      },
    };
    return () => {
      handleRef.current = null;
    };
  }, [handleRef, height, rowHeight]);

  const w = computeWindow({
    scrollTop,
    viewportHeight: height,
    rowHeight,
    count: items.length,
    overscan,
  });

  // The cursor's row stays in the DOM even if the window has scrolled past
  // it, so focus (and therefore the screen reader) can always land on it. It
  // comes through the same ordered, index-keyed list as every other row —
  // rendering it from a second site with its own key would unmount the
  // focused node on the window/stray transition and lose the focus.
  const rows = rowIndices(w, items.length, activeIndex);

  return (
    <div
      className="ta-vlist"
      role="list"
      aria-label={ariaLabel}
      ref={box}
      style={{ height, overflowY: "auto" }}
      onScroll={(e) => {
        const top = (e.target as HTMLDivElement).scrollTop;
        if (raf.current) cancelAnimationFrame(raf.current);
        raf.current = requestAnimationFrame(() => setScrollTop(top));
      }}
    >
      <div style={{ height: w.totalHeight, position: "relative" }}>
        {rows.map((index) => (
          <div
            role="listitem"
            key={index}
            style={{
              position: "absolute",
              top: index * rowHeight,
              left: 0,
              right: 0,
              height: rowHeight,
            }}
          >
            {renderRow(items[index]!, index)}
          </div>
        ))}
      </div>
    </div>
  );
}
