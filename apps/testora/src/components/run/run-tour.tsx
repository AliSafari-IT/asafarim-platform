"use client";

import { useCallback, useEffect, useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import { Compass } from "lucide-react";
import { cn } from "@/lib/utils";

/** A small "Take a tour" button that replays the Run-page tour on demand. */
export function TourTrigger({ className }: { className?: string }) {
  const router = useRouter();
  const pathname = usePathname();

  const startTour = useCallback(() => {
    if (pathname === "/run") {
      window.dispatchEvent(new Event(RUN_TOUR_EVENT));
    } else {
      router.push("/run");
      setTimeout(() => {
        window.dispatchEvent(new Event(RUN_TOUR_EVENT));
      }, 200);
    }
  }, [pathname, router]);

  return (
    <button
      type="button"
      onClick={startTour}
      className={cn(
        "inline-flex items-center gap-1.5 rounded-md border border-border px-2.5 py-1.5 text-sm text-muted-foreground transition-colors hover:border-primary hover:text-primary",
        className,
      )}
    >
      <Compass className="h-4 w-4" />
      Take a tour
    </button>
  );
}

// A lightweight spotlight tour for the Run page. Auto-shows at most once a week
// (and "Don't show for a week" / finishing both arm that 7-day window); it can
// also be replayed on demand via the RUN_TOUR_EVENT.
const STORAGE_KEY = "e2e_run_tour_last_seen";
const WEEK_MS = 7 * 24 * 60 * 60 * 1000;
export const RUN_TOUR_EVENT = "e2e:run-tour";

interface Step {
  selector: string;
  title: string;
  body: string;
}

const STEPS: Step[] = [
  {
    selector: '[data-tour="app"]',
    title: "Pick your app",
    body: "Choose which application's test catalog to run. Each app has its own requirements and its own default target.",
  },
  {
    selector: '[data-tour="target"]',
    title: "Point it at a deployment",
    body: "Run the very same tests against local or production — just switch here. No test edits, no copy-paste.",
  },
  {
    selector: '[data-tour="select"]',
    title: "Choose what to run",
    body: "A single fixture, a whole suite, a functional requirement — or every requirement of the app at once.",
  },
  {
    selector: '[data-tour="run"]',
    title: "Run it 🚀",
    body: "Hit Run and watch logs + results stream in live. A screenshot is auto-captured on any failure.",
  },
];

const TIP_W = 350;

export function RunTour() {
  const [open, setOpen] = useState(false);
  const [step, setStep] = useState(0);
  const [rect, setRect] = useState<DOMRect | null>(null);

  const remember = useCallback(() => {
    try {
      localStorage.setItem(STORAGE_KEY, String(Date.now()));
    } catch {
      /* ignore */
    }
  }, []);

  const close = useCallback(() => {
    remember();
    setOpen(false);
    setStep(0);
  }, [remember]);

  // Auto-open weekly (and record it immediately, so it stays once-per-week even
  // if the user navigates away without closing).
  useEffect(() => {
    let last = 0;
    try {
      last = Number(localStorage.getItem(STORAGE_KEY) || 0);
    } catch {
      /* ignore */
    }
    if (!last || Date.now() - last > WEEK_MS) {
      const t = setTimeout(() => {
        setStep(0);
        setOpen(true);
        remember();
      }, 700);
      return () => clearTimeout(t);
    }
  }, [remember]);

  // Replay on demand (e.g. the "Take a tour" button).
  useEffect(() => {
    const onOpen = () => {
      setStep(0);
      setOpen(true);
    };
    window.addEventListener(RUN_TOUR_EVENT, onOpen);
    return () => window.removeEventListener(RUN_TOUR_EVENT, onOpen);
  }, []);

  // Track the current target's position (scroll it into view, re-measure on
  // scroll/resize and shortly after to catch the smooth-scroll settle).
  useEffect(() => {
    if (!open) return;
    const def = STEPS[step];
    if (!def) return;
    const target = () =>
      document.querySelector(def.selector) as HTMLElement | null;
    const sync = () => setRect(target()?.getBoundingClientRect() ?? null);
    target()?.scrollIntoView({ behavior: "smooth", block: "center" });
    sync();
    const settle = setTimeout(sync, 380);
    window.addEventListener("resize", sync);
    window.addEventListener("scroll", sync, true);
    return () => {
      clearTimeout(settle);
      window.removeEventListener("resize", sync);
      window.removeEventListener("scroll", sync, true);
    };
  }, [open, step]);

  // Keyboard: Esc closes, arrows navigate.
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") close();
      else if (e.key === "ArrowRight")
        setStep((s) => Math.min(STEPS.length - 1, s + 1));
      else if (e.key === "ArrowLeft") setStep((s) => Math.max(0, s - 1));
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, close]);

  const s = STEPS[step];
  if (!open || !s) return null;

  const isLast = step === STEPS.length - 1;

  // Place the tooltip below the target if there's room, otherwise above; centre
  // it when the target can't be found.
  let tipStyle: React.CSSProperties;
  if (rect) {
    const below = rect.bottom + 190 < window.innerHeight;
    const top = below ? rect.bottom + 14 : Math.max(14, rect.top - 190);
    const left = Math.min(
      Math.max(12, rect.left),
      Math.max(12, window.innerWidth - TIP_W - 12),
    );
    tipStyle = { position: "fixed", top, left, width: TIP_W };
  } else {
    tipStyle = {
      position: "fixed",
      top: "50%",
      left: "50%",
      transform: "translate(-50%, -50%)",
      width: TIP_W,
    };
  }

  return (
    <>
      {/* Spotlight: a transparent cutout that dims the rest of the page (via the
          big box-shadow) and pulses a ring. pointer-events:none keeps the page
          itself usable underneath. */}
      {rect ? (
        <div
          className="tour-spotlight"
          style={{
            position: "fixed",
            top: rect.top - 8,
            left: rect.left - 8,
            width: rect.width + 16,
            height: rect.height + 16,
            borderRadius: 14,
            pointerEvents: "none",
            zIndex: 60,
          }}
        />
      ) : (
        <div className="fixed inset-0 z-[60] bg-black/60" />
      )}

      <div
        style={tipStyle}
        className="z-[61] rounded-xl border border-border bg-card p-4 shadow-2xl"
      >
        <div className="mb-1 flex items-center justify-between">
          <span className="text-xs font-medium uppercase tracking-wide text-primary">
            Step {step + 1} of {STEPS.length}
          </span>
          <button
            type="button"
            onClick={close}
            aria-label="Close tour"
            className="rounded p-1 text-muted-foreground hover:bg-muted hover:text-foreground"
          >
            ✕
          </button>
        </div>

        <h3 className="text-base font-semibold text-foreground">{s.title}</h3>
        <p className="mt-1 text-sm text-muted-foreground">{s.body}</p>

        <div className="mt-4 flex items-center justify-between gap-3">
          <div className="flex items-center gap-1.5">
            {STEPS.map((_, i) => (
              <span
                key={i}
                className={
                  i === step
                    ? "h-1.5 w-4 rounded-full bg-primary transition-all"
                    : "h-1.5 w-1.5 rounded-full bg-border transition-all"
                }
              />
            ))}
          </div>
          <div className="flex items-center gap-2">
            {step > 0 && (
              <button
                type="button"
                onClick={() => setStep((p) => Math.max(0, p - 1))}
                className="rounded-md px-2.5 py-1.5 text-sm text-muted-foreground hover:bg-muted hover:text-foreground"
              >
                Back
              </button>
            )}
            <button
              type="button"
              onClick={() => (isLast ? close() : setStep((p) => p + 1))}
              className="rounded-md bg-primary px-3 py-1.5 text-sm font-medium text-primary-foreground hover:opacity-90"
            >
              {isLast ? "Got it!" : "Next"}
            </button>
          </div>
        </div>

        <button
          type="button"
          onClick={close}
          className="mt-2 text-xs text-muted-foreground/70 underline-offset-2 hover:text-muted-foreground hover:underline"
        >
          Don&apos;t show this for a week
        </button>
      </div>
    </>
  );
}
