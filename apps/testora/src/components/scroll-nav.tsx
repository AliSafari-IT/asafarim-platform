"use client";

import { useCallback, useEffect, useState } from "react";
import { ChevronUp, ChevronDown } from "lucide-react";
import { cn } from "@/lib/utils";

// In this app the scroller is the <main> element (it has overflow-y-auto), with
// a fallback to the document for safety.
function getScroller(): HTMLElement {
  const main = document.querySelector("main");
  if (main && main.scrollHeight > main.clientHeight + 4) return main as HTMLElement;
  return (document.scrollingElement as HTMLElement | null) ?? document.documentElement;
}

const EDGE = 8; // px tolerance for "at top / at bottom"

/**
 * A floating glass pill on the right edge with up/down chevrons: jump to the
 * top or bottom of the scrollable area. The chevron for a direction you can't
 * travel dims out, and the whole control fades away when the page doesn't
 * scroll.
 */
export function ScrollNav() {
  const [scrollable, setScrollable] = useState(false);
  const [atTop, setAtTop] = useState(true);
  const [atBottom, setAtBottom] = useState(false);
  const [progress, setProgress] = useState(0); // 0..1, how far down we are

  const recompute = useCallback(() => {
    const el = getScroller();
    const max = el.scrollHeight - el.clientHeight;
    setScrollable(max > 24);
    setAtTop(el.scrollTop <= EDGE);
    setAtBottom(el.scrollTop >= max - EDGE);
    setProgress(max > 0 ? Math.min(1, Math.max(0, el.scrollTop / max)) : 0);
  }, []);

  useEffect(() => {
    recompute();
    // Capture-phase scroll listening catches the <main> scroll too (scroll
    // events don't bubble, but they're visible in the capture phase).
    window.addEventListener("scroll", recompute, true);
    window.addEventListener("resize", recompute);
    const main = document.querySelector("main");
    const observer = main ? new ResizeObserver(recompute) : null;
    if (main) observer?.observe(main);
    return () => {
      window.removeEventListener("scroll", recompute, true);
      window.removeEventListener("resize", recompute);
      observer?.disconnect();
    };
  }, [recompute]);

  const scrollTo = (where: "top" | "bottom") => {
    const el = getScroller();
    el.scrollTo({ top: where === "top" ? 0 : el.scrollHeight, behavior: "smooth" });
  };

  return (
    <div
      aria-hidden={!scrollable}
      className={cn(
        "fixed bottom-4 right-3 z-30 transition-all duration-300 sm:bottom-6 sm:right-5",
        scrollable ? "translate-x-0 opacity-100" : "pointer-events-none translate-x-6 opacity-0",
      )}
    >
      <div className="relative flex flex-col items-center gap-1 rounded-full border border-white/10 bg-card/80 p-1.5 shadow-xl shadow-primary/20 ring-1 ring-black/5 backdrop-blur-md">
        {/* progress fill behind the buttons */}
        <span
          aria-hidden
          className="pointer-events-none absolute inset-x-1 bottom-1 top-1 -z-10 rounded-full bg-gradient-to-b from-primary/15 to-accent/15"
          style={{ clipPath: `inset(${(1 - progress) * 100}% 0 0 0 round 9999px)` }}
        />
        <ChevronButton
          direction="up"
          disabled={atTop}
          onClick={() => scrollTo("top")}
          label="Scroll to top"
        />
        <span className="h-px w-5 bg-border/70" />
        <ChevronButton
          direction="down"
          disabled={atBottom}
          onClick={() => scrollTo("bottom")}
          label="Scroll to bottom"
        />
      </div>
    </div>
  );
}

function ChevronButton({
  direction,
  disabled,
  onClick,
  label,
}: {
  direction: "up" | "down";
  disabled: boolean;
  onClick: () => void;
  label: string;
}) {
  const Icon = direction === "up" ? ChevronUp : ChevronDown;
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      aria-label={label}
      title={label}
      className={cn(
        "group flex h-9 w-9 items-center justify-center rounded-full text-muted-foreground transition-all duration-200",
        "hover:bg-primary/15 hover:text-primary active:scale-90",
        "disabled:pointer-events-none disabled:opacity-30",
      )}
    >
      <Icon
        className={cn(
          "h-5 w-5 transition-transform duration-200",
          direction === "up" ? "group-hover:-translate-y-0.5" : "group-hover:translate-y-0.5",
        )}
      />
    </button>
  );
}
