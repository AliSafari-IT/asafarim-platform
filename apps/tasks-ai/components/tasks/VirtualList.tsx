"use client";

import { useEffect, useRef, useState, type MutableRefObject, type ReactNode } from "react";
import { computeWindow } from "../../lib/ui/window";

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
 * spacer divs preserve the scrollbar. Keyboard/AT users still reach every
 * row because focus moving to an off-window row scrolls it into view via
 * the browser's native anchor handling on the container, and because callers
 * can drive the window directly through `handleRef`.
 */
export function VirtualList<T>({
  items,
  rowHeight,
  height = 480,
  overscan = 8,
  renderRow,
  ariaLabel,
  handleRef,
}: {
  items: T[];
  rowHeight: number;
  height?: number;
  overscan?: number;
  renderRow: (item: T, index: number) => ReactNode;
  ariaLabel?: string;
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
        <div style={{ transform: `translateY(${w.padTop}px)` }}>
          {items.slice(w.start, w.end).map((item, i) => (
            <div role="listitem" style={{ height: rowHeight }} key={w.start + i}>
              {renderRow(item, w.start + i)}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
