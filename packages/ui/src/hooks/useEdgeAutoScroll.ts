"use client";

import { useCallback, useRef, type MouseEvent, type RefObject } from "react";

/** How close the pointer must be to an edge (px) before it starts scrolling. */
const EDGE_ZONE_PX = 48;
/** Fastest scroll speed, at the very edge (px per animation frame). */
const MAX_SPEED_PX = 14;

export interface EdgeAutoScrollHandlers<T extends HTMLElement> {
  ref: RefObject<T | null>;
  onMouseMove: (event: MouseEvent<T>) => void;
  onMouseLeave: () => void;
}

/**
 * Auto-scrolls a horizontally-scrollable element while the pointer hovers
 * near its left/right edge — for bars that scroll horizontally (nav lists,
 * chip rows) but hide their native scrollbar for a cleaner look, which
 * otherwise leaves no discoverable way to reach clipped content besides a
 * trackpad swipe. Speed ramps up the closer the pointer gets to the edge;
 * scrolling stops immediately on mouseleave or once there's nowhere further
 * to scroll.
 *
 * Spread the returned handlers onto the scrollable element itself:
 * `<ul ref={scroller.ref} onMouseMove={scroller.onMouseMove} onMouseLeave={scroller.onMouseLeave}>`.
 */
export function useEdgeAutoScroll<T extends HTMLElement>(): EdgeAutoScrollHandlers<T> {
  const ref = useRef<T | null>(null);
  const rafRef = useRef<number | null>(null);
  const velocityRef = useRef(0);

  const stop = useCallback(() => {
    if (rafRef.current !== null) {
      cancelAnimationFrame(rafRef.current);
      rafRef.current = null;
    }
    velocityRef.current = 0;
  }, []);

  const tick = useCallback(() => {
    const el = ref.current;
    if (!el || velocityRef.current === 0) {
      rafRef.current = null;
      return;
    }
    // Stop the loop itself once the scroll limit is reached, rather than
    // relying on the browser to silently clamp scrollLeft while frames
    // keep getting scheduled forever until mouseleave.
    const max = el.scrollWidth - el.clientWidth;
    const next = el.scrollLeft + velocityRef.current;
    el.scrollLeft = Math.max(0, Math.min(max, next));
    if (next <= 0 || next >= max) {
      velocityRef.current = 0;
      rafRef.current = null;
      return;
    }
    rafRef.current = requestAnimationFrame(tick);
  }, []);

  const onMouseMove = useCallback(
    (event: MouseEvent<T>) => {
      const el = ref.current;
      if (!el) return;

      // Nothing to scroll — never hijack the cursor over a bar that already fits.
      if (el.scrollWidth <= el.clientWidth + 1) {
        stop();
        return;
      }

      const rect = el.getBoundingClientRect();
      const x = event.clientX - rect.left;
      const distFromRight = rect.width - x;
      const distFromLeft = x;
      const atEnd = el.scrollLeft >= el.scrollWidth - el.clientWidth - 1;
      const atStart = el.scrollLeft <= 0;

      let velocity = 0;
      if (distFromRight < EDGE_ZONE_PX && !atEnd) {
        velocity = MAX_SPEED_PX * (1 - distFromRight / EDGE_ZONE_PX);
      } else if (distFromLeft < EDGE_ZONE_PX && !atStart) {
        velocity = -MAX_SPEED_PX * (1 - distFromLeft / EDGE_ZONE_PX);
      }

      velocityRef.current = velocity;
      if (velocity !== 0 && rafRef.current === null) {
        rafRef.current = requestAnimationFrame(tick);
      } else if (velocity === 0) {
        stop();
      }
    },
    [stop, tick],
  );

  return { ref, onMouseMove, onMouseLeave: stop };
}
