"use client";

import { useEffect } from "react";

/**
 * Progressive-enhancement effects for the home page, attached by data-attribute
 * so the markup stays in the server component:
 *   [data-reveal]   → fade/slide in on scroll
 *   [data-count]    → count up to a number (with optional data-suffix)
 *   [data-tilt]     → subtle 3D tilt toward the cursor
 *   [data-parallax] → gentle vertical drift on scroll (factor from the attr)
 * All effects respect prefers-reduced-motion.
 */
export function HomeEffects() {
  useEffect(() => {
    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

    // ── Reveal on scroll ──────────────────────────────────────────
    const revealEls = Array.from(
      document.querySelectorAll<HTMLElement>("[data-reveal]")
    );
    let revealObserver: IntersectionObserver | undefined;
    if (reduce) {
      revealEls.forEach((el) => el.classList.add("in"));
    } else {
      revealObserver = new IntersectionObserver(
        (entries, obs) => {
          entries.forEach((e) => {
            if (e.isIntersecting) {
              e.target.classList.add("in");
              obs.unobserve(e.target);
            }
          });
        },
        { threshold: 0.12 }
      );
      revealEls.forEach((el, i) => {
        el.style.transitionDelay = `${(i % 4) * 60}ms`;
        revealObserver!.observe(el);
      });
    }

    // ── Count up ──────────────────────────────────────────────────
    const countEls = Array.from(
      document.querySelectorAll<HTMLElement>("[data-count]")
    );
    let countObserver: IntersectionObserver | undefined;
    const runCount = (el: HTMLElement) => {
      const target = parseInt(el.dataset.count ?? "0", 10);
      const suffix = el.dataset.suffix ?? "";
      if (reduce) {
        el.textContent = `${target}${suffix}`;
        return;
      }
      const dur = 1600;
      const start = performance.now();
      const tick = (now: number) => {
        const p = Math.min((now - start) / dur, 1);
        const eased = 1 - Math.pow(1 - p, 3);
        el.textContent = `${Math.floor(eased * target)}${suffix}`;
        if (p < 1) requestAnimationFrame(tick);
        else el.textContent = `${target}${suffix}`;
      };
      requestAnimationFrame(tick);
    };
    if (reduce) {
      countEls.forEach(runCount);
    } else {
      countObserver = new IntersectionObserver(
        (entries, obs) => {
          entries.forEach((e) => {
            if (!e.isIntersecting) return;
            runCount(e.target as HTMLElement);
            obs.unobserve(e.target);
          });
        },
        { threshold: 0.5 }
      );
      countEls.forEach((el) => countObserver!.observe(el));
    }

    // ── Tilt ──────────────────────────────────────────────────────
    const tiltCleanups: Array<() => void> = [];
    if (!reduce) {
      document.querySelectorAll<HTMLElement>("[data-tilt]").forEach((card) => {
        const move = (e: MouseEvent) => {
          const r = card.getBoundingClientRect();
          const px = (e.clientX - r.left) / r.width - 0.5;
          const py = (e.clientY - r.top) / r.height - 0.5;
          card.style.transform = `perspective(800px) rotateY(${px * 6}deg) rotateX(${-py * 6}deg)`;
        };
        const leave = () => {
          card.style.transform = "perspective(800px) rotateY(0) rotateX(0)";
        };
        card.addEventListener("mousemove", move);
        card.addEventListener("mouseleave", leave);
        tiltCleanups.push(() => {
          card.removeEventListener("mousemove", move);
          card.removeEventListener("mouseleave", leave);
        });
      });
    }

    // ── Parallax blobs ────────────────────────────────────────────
    const parallaxEls = Array.from(
      document.querySelectorAll<HTMLElement>("[data-parallax]")
    );
    const onScroll = () => {
      const y = window.scrollY;
      parallaxEls.forEach((el) => {
        const factor = parseFloat(el.dataset.parallax ?? "0");
        el.style.transform = `translateY(${y * factor}px)`;
      });
    };
    if (!reduce && parallaxEls.length > 0) {
      window.addEventListener("scroll", onScroll, { passive: true });
      onScroll();
    }

    return () => {
      revealObserver?.disconnect();
      countObserver?.disconnect();
      tiltCleanups.forEach((fn) => fn());
      window.removeEventListener("scroll", onScroll);
    };
  }, []);

  return null;
}
