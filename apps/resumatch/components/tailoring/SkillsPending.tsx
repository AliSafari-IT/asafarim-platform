"use client";

import { createContext, useContext, useMemo, useState, type ReactNode } from "react";
import { useTranslation } from "@asafarim/shared-i18n";

/**
 * While the CV preview changes its Skills section (the AI writing a
 * paragraph can take a while), three places react together:
 * - the Skills layout picker, which owns the request and the live status;
 * - the Skills section in the CV, which shows a "writing…" overlay;
 * - Download PDF / DOCX, which wait, so a file never holds the old layout
 *   while the screen is about to show the new one.
 *
 * "writing" is the AI paragraph; "saving" is a plain layout switch, which
 * is quick and only pauses the downloads. Outside the provider (the cover
 * letter preview) nothing is ever pending.
 */
export type SkillsPending = "writing" | "saving" | null;

const SkillsPendingContext = createContext<{
  pending: SkillsPending;
  setPending: (pending: SkillsPending) => void;
}>({ pending: null, setPending: () => {} });

export function SkillsPendingProvider({ children }: { children: ReactNode }) {
  const [pending, setPending] = useState<SkillsPending>(null);
  const value = useMemo(() => ({ pending, setPending }), [pending]);
  return <SkillsPendingContext.Provider value={value}>{children}</SkillsPendingContext.Provider>;
}

export function useSkillsPending() {
  return useContext(SkillsPendingContext);
}

/** Small spinning ring; still under prefers-reduced-motion. */
export function Spinner({ className }: { className?: string }) {
  return <span className={className ? `rm-spinner ${className}` : "rm-spinner"} aria-hidden="true" />;
}

/**
 * Drawn inside the CV's Skills section while a paragraph is being written:
 * the current skills fade under a shimmer with a "Writing…" badge, so it
 * is clear this section is about to be replaced. Visual only: the picker's
 * live region announces the same state, and the section sets aria-busy.
 * Screen-only; a print never shows it.
 */
export function SkillsPendingOverlay() {
  const { pending } = useSkillsPending();
  return pending === "writing" ? <WritingOverlay /> : null;
}

function WritingOverlay() {
  const { t } = useTranslation();
  return (
    <div className="rm-skills-pending rm-screen-only" aria-hidden="true" data-testid="cv-skills-pending">
      <span className="rm-skills-pending__badge">
        <Spinner />
        {t("resumatch.preview.skillsLayout.overlay")}
      </span>
    </div>
  );
}

/** The CV's Skills <section>, marked busy while it is being rewritten. */
export function SkillsSection({ children }: { children: ReactNode }) {
  const { pending } = useSkillsPending();
  return (
    <section
      className="rm-resume__section rm-resume__section--skills"
      aria-busy={pending === "writing" ? true : undefined}
      data-testid="cv-skills-section"
    >
      {children}
      <SkillsPendingOverlay />
    </section>
  );
}
