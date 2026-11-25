"use client";

import {
  createContext,
  useContext,
  useMemo,
  useRef,
  useState,
  type Dispatch,
  type MutableRefObject,
  type ReactNode,
  type SetStateAction,
} from "react";
import { useTranslation } from "@asafarim/shared-i18n";
import { SkillsParagraphEditor } from "./SkillsParagraphEditor";

/**
 * While the CV preview changes its Skills section (the AI writing a
 * paragraph can take a while), three places react together:
 * - the Skills layout picker, which owns the request and the live status;
 * - the Skills section in the CV, which shows a "writing…" overlay;
 * - Download PDF / DOCX, which wait, so a file never holds the old layout
 *   while the screen is about to show the new one.
 *
 * "writing" is the AI paragraph; "saving" is a plain layout switch, which
 * is quick and only pauses the downloads; "editing" is the candidate
 * editing the paragraph by hand, in place in the CV (SkillsParagraphEditor),
 * so a download never holds text they are still changing. Outside the
 * provider (the cover letter preview) nothing is ever pending.
 */
export type SkillsPending = "writing" | "saving" | "editing" | null;

/** A hand edit of the skills paragraph in progress. The picker owns the
 *  request; the editor in the CV's Skills section shows and changes this. */
export interface SkillsEdit {
  draft: string;
  saving: boolean;
  /** Why the last save failed: "empty" | "too_long" | "save". */
  error: string | null;
}

export interface SkillsEditActions {
  save: () => void;
  cancel: () => void;
}

interface SkillsPendingValue {
  pending: SkillsPending;
  setPending: (pending: SkillsPending) => void;
  edit: SkillsEdit | null;
  setEdit: Dispatch<SetStateAction<SkillsEdit | null>>;
  /** Set by the picker; the editor's Save and Cancel call through it. */
  editActions: MutableRefObject<SkillsEditActions | null>;
}

const SkillsPendingContext = createContext<SkillsPendingValue>({
  pending: null,
  setPending: () => {},
  edit: null,
  setEdit: () => {},
  editActions: { current: null },
});

export function SkillsPendingProvider({ children }: { children: ReactNode }) {
  const [pending, setPending] = useState<SkillsPending>(null);
  const [edit, setEdit] = useState<SkillsEdit | null>(null);
  const editActions = useRef<SkillsEditActions | null>(null);
  const value = useMemo(
    () => ({ pending: pending ?? (edit ? "editing" : null), setPending, edit, setEdit, editActions }),
    [pending, edit],
  );
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

/** The CV's Skills <section>, marked busy while it is being rewritten.
 *  While the candidate edits the paragraph by hand, the editor takes the
 *  paragraph's place, under the same heading. */
export function SkillsSection({ heading, children }: { heading: ReactNode; children: ReactNode }) {
  const { pending, edit } = useSkillsPending();
  return (
    <section
      className="rm-resume__section rm-resume__section--skills"
      aria-busy={pending === "writing" ? true : undefined}
      data-testid="cv-skills-section"
    >
      {heading}
      {edit ? <SkillsParagraphEditor /> : children}
      <SkillsPendingOverlay />
    </section>
  );
}
