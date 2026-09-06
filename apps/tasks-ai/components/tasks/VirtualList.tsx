"use client";

import { useRef, useState, type ReactNode } from "react";
import { computeWindow } from "../../lib/ui/window";

/**
 * Fixed-row windowed list. Only the rows near the viewport are in the DOM;
 * spacer divs preserve the scrollbar. Keyboard/AT users still reach every
 * row because focus moving to an off-window row scrolls it into view via
 * the browser's native anchor handling on the container.
 */
export function VirtualList<T>({
  items,
  rowHeight,
  height = 480,
  overscan = 8,
  renderRow,
  ariaLabel,
}: {
  items: T[];
  rowHeight: number;
  height?: number;
  overscan?: number;
  renderRow: (item: T, index: number) => ReactNode;
  ariaLabel?: string;
}) {
  const [scrollTop, setScrollTop] = useState(0);
  const raf = useRef<number | null>(null);

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
