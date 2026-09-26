"use client";

import { useEffect, useRef, type ReactNode } from "react";

/**
 * Shows `children` laid out at a fixed `renderWidth` (the width the real
 * renderer is designed for), scaled down to whatever width the card
 * actually has. The scale is measured, not guessed: gallery columns change
 * width with the viewport, and a fixed scale would either crop the
 * timeline or leave a gutter. Before hydration the CSS fallback scale
 * (--pv-scale default in globals.css) is used.
 */
export function PreviewViewport({ renderWidth, children }: { renderWidth: number; children: ReactNode }) {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const update = () => el.style.setProperty("--pv-scale", String(el.clientWidth / renderWidth));
    update();
    const observer = new ResizeObserver(update);
    observer.observe(el);
    return () => observer.disconnect();
  }, [renderWidth]);

  return (
    <div ref={ref} className="gl-preview">
      <div className="gl-preview__canvas" style={{ width: renderWidth }}>
        {children}
      </div>
    </div>
  );
}
