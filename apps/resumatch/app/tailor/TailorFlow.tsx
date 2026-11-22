"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useTranslation } from "@asafarim/shared-i18n";
import { Alert, Button, Card, Input } from "@asafarim/ui";
import { ManualJobForm, type ManualJobFormValues } from "./ManualJobForm";
import { computeCoverLetterQuality } from "../../lib/tailoring/coverLetterQuality";
import { CoverLetterQualityChecklist } from "../../components/tailoring/CoverLetterQualityChecklist";
import { TailoringLoader } from "../../components/tailoring/TailoringLoader";
import { JobFitPanel } from "../../components/tailoring/JobFitPanel";
import { ReviewBulletsEditor, ReviewSkillsEditor } from "../../components/tailoring/ReviewEditors";
import { MAX_PROPOSED_SKILLS, NO_CANDIDATE_EDITS, ownBulletsByRole } from "../../lib/tailoring/candidateEdits";
import {
  approvedBullets,
  approvedOwnBullets,
  buildReviewBullets,
  orderProfileSkills,
  seedSkillEdits,
  type ReviewBullet,
} from "../../lib/tailoring/reviewEdits";
import type { RegenerateSeed } from "../../lib/tailoring/regenerate";
import { ownSummaryOf, type SavedReviewSeed } from "../../lib/tailoring/editSaved";
import type { JobFit } from "../../lib/tailoring/jobFit";
import {
  LANGUAGE_LABELS,
  OUTPUT_LANGUAGES,
  isOutputLanguage,
  outputLanguageFromLocale,
  type OutputLanguage,
} from "../../lib/tailoring/language";

const MIN_PASTE_CHARS = 120;

/**
 * The tailoring flow: point at a job (URL, pasted text, a pasted email, an
 * uploaded file, or typed-in-by-hand details), review the AI's
 * suggestions, confirm what gets saved.
 *
 * Proposal-review, not one-shot (issue #429): `generate-preview` runs the
 * provider call and returns suggestions for review only — nothing is
 * persisted until the candidate explicitly accepts, edits, or declines
 * each piece and presses Confirm, which calls `generate-confirm`. Getting
 * the job's text into a `TargetJob` row still costs nothing regardless of
 * intake path; the AI tailoring call itself is what has the explicit
 * review step, the same "nothing is used until you confirm it" posture as
 * the rest of this app, extended one step further than a single up-front
 * button press.
 *
 * Five intake modes, each posting to its own route but landing in the same
 * `{ kind: "fetched", targetJobId, ... }` state afterward (see #458 and its
 * sub-issues #459–#461 for why each one exists):
 * - "url" → /api/tailor/fetch-job (#426)
 * - "paste" → /api/tailor/paste-job (#426)
 * - "email" → /api/tailor/paste-email (#459)
 * - "upload" → /api/tailor/upload-job (#460)
 * - "manual" → /api/tailor/manual-job (#461)
 */
export interface TailorFlowProps {
  /** The workspace's currently confirmed profile version — tailoring
   *  always reads from it, there is nothing else to pick between (only one
   *  version can be confirmed at a time). */
  confirmedVersionId: string;
  /** Set when the flow was reopened from a saved CV or letter ("Edit and
   *  regenerate", lib/tailoring/regenerate.ts): the flow starts on that
   *  job's options card with the saved choices filled in. */
  seed?: RegenerateSeed | null;
  /** Set when the flow was opened with "Edit" on a saved CV
   *  (lib/tailoring/editSaved.ts): it starts on that CV's review, filled in
   *  exactly as it was saved, and saving updates that CV in place. */
  editSeed?: SavedReviewSeed | null;
}

interface ReviewExperienceItem {
  title: string;
  employer: string | null;
  startedOn: string | null;
  endedOn: string | null;
  isCurrent: boolean;
  originalSummary: string | null;
  /** The AI's bullets and the candidate's own, in CV order. */
  bullets: ReviewBullet[];
}

interface ReviewCoverLetter {
  greeting: string;
  paragraphs: string[];
  signOff: string;
  degraded: boolean;
  promptVersion: string;
  modelVersion: string;
  /** #642: the language the letter was asked for, or null for none. */
  outputLanguage: OutputLanguage | null;
  /** Sentences/paragraphs the grounding check removed because the profile
   *  doesn't back them — told to the candidate, never shown. */
  removedSentences: number;
  droppedParagraphs: number;
  /** Whether to persist this letter on confirm — declining it is a valid
   *  outcome independent of the CV (issue #454). */
  include: boolean;
}

interface ReviewState {
  targetJobId: string;
  /** generate-preview's own record of the call it made — sent back
   *  verbatim to generate-confirm, which reads provenance from that row
   *  rather than from anything else in this request (issue #525). */
  previewId: string;
  promptVersion: string;
  modelVersion: string;
  degraded: boolean;
  /** The candidate's own freeform steering text for this run (issue #431),
   *  echoed back from generate-preview so confirm() can re-send it for
   *  provenance without re-deriving it. */
  instructions: string | null;
  /** The language this preview's suggestions were written in (#641),
   *  as generate-preview recorded it; null when none was requested. */
  outputLanguage: OutputLanguage | null;
  /** The candidate confirmed this job despite a low fit; the suggestions
   *  lead with transferable strengths. */
  lowFit: boolean;
  headline: string;
  summary: string;
  /** The summary the review started with before any typing (the AI's,
   *  or the profile's when the AI wrote none), or null when the saved one
   *  is the candidate's own: a summary that differs from it is theirs. */
  aiSummary: string | null;
  /** The profile's own summary, offered with "Use my profile summary". */
  profileSummary: string | null;
  /** Set when editing a saved CV: the save goes to that CV (and its
   *  letter) instead of generate-confirm. */
  editOf: { resumeId: string; coverLetterId: string | null } | null;
  originalSkillsOrder: string[];
  /** The profile's skills in the AI's order (names the profile doesn't
   *  hold already dropped), the same list the server will save. */
  suggestedSkillsOrder: string[];
  keepOriginalSkillOrder: boolean;
  /** Hand edits (lib/tailoring/candidateEdits.ts): profile skills left off
   *  this CV, and skills the candidate typed in for this CV only. */
  removedSkills: string[];
  addedSkills: string[];
  experience: ReviewExperienceItem[];
  /** null when the candidate didn't opt into a cover letter on the fetched
   *  card, or the call degraded with nothing to review. */
  coverLetter: ReviewCoverLetter | null;
  /** The confirmed profile's own name — used only to render the letter
   *  quality checklist's "signed with your name" check (issue #456), same
   *  as generate-confirm carries it into the persisted content in code. */
  profileFullName: string | null;
}

interface FetchedJob {
  targetJobId: string;
  title: string | null;
  employer: string | null;
  snippet: string;
}

type FetchState =
  | { kind: "idle" }
  | { kind: "fetching" }
  | ({ kind: "fetched" } & FetchedJob)
  | { kind: "fetch_failed"; reasonCode: string }
  | { kind: "loading_review"; targetJobId: string }
  /** `saveError`: a save the server refused as written (422). The review
   *  stays open so the candidate can fix it without losing their edits. */
  | { kind: "reviewing"; review: ReviewState; saveError?: string }
  | { kind: "confirming"; review: ReviewState }
  | { kind: "error"; message: string; canGoBack?: boolean };

/** fetch-job reason codes with their own message
 *  (resumatch.flow.fetchFailed.<code>); anything else gets the generic one. */
const FETCH_FAILURE_CODES = new Set([
  "URL_NOT_ALLOWED",
  "REDIRECT_REFUSED",
  "RESPONSE_TOO_LARGE",
  "TIMEOUT",
  "BOT_BLOCKED",
  "HTTP_ERROR",
  "NETWORK_ERROR",
  "NO_READABLE_TEXT",
]);

type Mode = "url" | "paste" | "email" | "upload" | "manual";

/** Mirrors lib/tailoring/ai/prompts.ts's MAX_INSTRUCTIONS_CHARS — kept as a
 *  local constant rather than imported, so this Client Component never
 *  risks pulling in a server-side module (see #471's server-only leak). */
const INSTRUCTIONS_MAX_CHARS = 1000;

/** Reads a JSON response body, or null when the body is not JSON. A proxy
 *  502/504 or a framework error page is HTML; letting res.json() throw
 *  there sent it to the catch and showed "Could not reach the server" for
 *  what was really a server error. */
async function readJsonBody(res: Response): Promise<Record<string, any> | null> {
  try {
    const body: unknown = await res.json();
    return body && typeof body === "object" ? (body as Record<string, any>) : null;
  } catch {
    return null;
  }
}

/** The review of a saved CV, filled in as it was saved (no AI call). */
function reviewFromSaved(saved: SavedReviewSeed, nextKey: () => string): ReviewState {
  return {
    targetJobId: saved.job.targetJobId,
    previewId: "",
    promptVersion: "",
    modelVersion: "",
    degraded: false,
    instructions: saved.instructions,
    outputLanguage: saved.outputLanguage,
    lowFit: false,
    headline: saved.headline,
    summary: saved.summary,
    aiSummary: saved.aiSummary,
    profileSummary: saved.profileSummary,
    editOf: { resumeId: saved.resumeId, coverLetterId: saved.coverLetterId },
    originalSkillsOrder: saved.originalSkillsOrder,
    suggestedSkillsOrder: saved.suggestedSkillsOrder,
    keepOriginalSkillOrder: saved.keepOriginalSkillOrder,
    addedSkills: saved.addedSkills,
    removedSkills: saved.removedSkills,
    experience: saved.experience.map((entry) => ({
      title: entry.title,
      employer: entry.employer,
      startedOn: entry.startedOn,
      endedOn: entry.endedOn,
      isCurrent: entry.isCurrent,
      originalSummary: entry.originalSummary,
      bullets: entry.bullets.map((bullet) => ({
        key: nextKey(),
        text: bullet.text,
        accepted: true,
        aiText: bullet.aiText,
        ...(bullet.fromProfile ? { fromProfile: true } : {}),
      })),
    })),
    coverLetter: saved.coverLetter
      ? {
          greeting: saved.coverLetter.greeting,
          paragraphs: saved.coverLetter.paragraphs,
          signOff: saved.coverLetter.signOff,
          degraded: false,
          promptVersion: "",
          modelVersion: "",
          outputLanguage: saved.coverLetter.outputLanguage,
          removedSentences: 0,
          droppedParagraphs: 0,
          include: true,
        }
      : null,
    profileFullName: saved.profileFullName,
  };
}

export function TailorFlow({ confirmedVersionId, seed = null, editSeed = null }: TailorFlowProps) {
  const router = useRouter();
  const { t, locale: pageLocale } = useTranslation();
  const [url, setUrl] = useState("");
  const [pastedText, setPastedText] = useState("");
  const [emailText, setEmailText] = useState("");
  const [emailSubject, setEmailSubject] = useState("");
  const [uploadFile, setUploadFile] = useState<File | null>(null);
  const [mode, setMode] = useState<Mode>("url");
  const [instructions, setInstructions] = useState(seed?.instructions ?? "");
  // #641: defaults to the page language from the language bar (#640);
  // the candidate can pick another for this run.
  const [cvLanguage, setCvLanguage] = useState<OutputLanguage>(
    () => seed?.cvLanguage ?? outputLanguageFromLocale(pageLocale),
  );
  const [includeCoverLetter, setIncludeCoverLetter] = useState(seed?.includeCoverLetter ?? false);
  const [coverLetterTone, setCoverLetterTone] = useState<"formal" | "warm" | "confident">("formal");
  const [coverLetterLength, setCoverLetterLength] = useState<"short" | "standard" | "detailed">("standard");
  // #642: null means "same as the CV", so the letter keeps following the CV
  // language until the candidate picks a different one on purpose.
  const [coverLetterLanguage, setCoverLetterLanguage] = useState<OutputLanguage | null>(seed?.coverLetterLanguage ?? null);
  const bulletKeyRef = useRef(0);
  const nextBulletKey = useCallback(() => `b${++bulletKeyRef.current}`, []);
  const [state, setState] = useState<FetchState>(() =>
    editSeed
      ? { kind: "reviewing", review: reviewFromSaved(editSeed, nextBulletKey) }
      : seed
        ? { kind: "fetched", ...seed.job }
        : { kind: "idle" },
  );
  // The fit check for the job on the card (lib/tailoring/jobFit.ts): null
  // while loading or when it couldn't run, which never blocks tailoring.
  const [fit, setFit] = useState<{ targetJobId: string; fit: JobFit } | null>(null);
  // The candidate's explicit "yes, tailor anyway" for a low-fit job.
  const [lowFitConfirmedFor, setLowFitConfirmedFor] = useState<string | null>(null);
  const [lastFetched, setLastFetched] = useState<FetchedJob | null>(editSeed?.job ?? seed?.job ?? null);

  const showFetched = useCallback((body: Record<string, any>) => {
    const job: FetchedJob = { targetJobId: body.id, title: body.title, employer: body.employer, snippet: body.snippet };
    setFit(null);
    setLowFitConfirmedFor(null);
    setLastFetched(job);
    setState({ kind: "fetched", ...job });
  }, []);

  /** Back from the review (or a failed tailoring run) to the options card
   *  of the same job, with every choice kept, so the candidate can change
   *  the language, steering note or letter options and run it again. */
  const backToOptions = useCallback(() => {
    if (lastFetched) setState({ kind: "fetched", ...lastFetched });
  }, [lastFetched]);

  const fetchedJobId = state.kind === "fetched" ? state.targetJobId : null;
  useEffect(() => {
    if (!fetchedJobId || fit?.targetJobId === fetchedJobId) return;
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch("/api/tailor/job-fit", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ profileVersionId: confirmedVersionId, targetJobId: fetchedJobId }),
        });
        const body = await readJsonBody(res);
        if (!cancelled && res.ok && body?.fit) setFit({ targetJobId: fetchedJobId, fit: body.fit as JobFit });
      } catch {
        // No fit shown; generate-preview still checks it before any AI call.
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [fetchedJobId, fit?.targetJobId, confirmedVersionId]);

  const fetchJob = useCallback(async () => {
    if (!url.trim()) return;
    setState({ kind: "fetching" });
    try {
      const res = await fetch("/api/tailor/fetch-job", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ url: url.trim() }),
      });
      const body = await readJsonBody(res);
      if (!res.ok || !body) {
        setState({
          kind: "error",
          message: body?.error ?? `${t("resumatch.flow.error.fetchUrl")} ${t("resumatch.flow.error.server", { status: res.status })}`,
        });
        return;
      }
      if (body.status === "FETCH_FAILED") {
        setState({ kind: "fetch_failed", reasonCode: body.reasonCode ?? "HTTP_ERROR" });
        return;
      }
      showFetched(body);
    } catch {
      setState({ kind: "error", message: t("resumatch.flow.error.network") });
    }
  }, [url, t, showFetched]);

  const pasteJob = useCallback(async () => {
    if (pastedText.trim().length < MIN_PASTE_CHARS) return;
    setState({ kind: "fetching" });
    try {
      const res = await fetch("/api/tailor/paste-job", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ text: pastedText }),
      });
      const body = await readJsonBody(res);
      if (!res.ok || !body) {
        setState({
          kind: "error",
          message: body?.error ?? `${t("resumatch.flow.error.pasteText")} ${t("resumatch.flow.error.server", { status: res.status })}`,
        });
        return;
      }
      showFetched(body);
    } catch {
      setState({ kind: "error", message: t("resumatch.flow.error.network") });
    }
  }, [pastedText, t, showFetched]);

  const pasteEmail = useCallback(async () => {
    if (emailText.trim().length < MIN_PASTE_CHARS) return;
    setState({ kind: "fetching" });
    try {
      const res = await fetch("/api/tailor/paste-email", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ text: emailText, subject: emailSubject.trim() || undefined }),
      });
      const body = await readJsonBody(res);
      if (!res.ok || !body) {
        setState({
          kind: "error",
          message: body?.error ?? `${t("resumatch.flow.error.pasteEmail")} ${t("resumatch.flow.error.server", { status: res.status })}`,
        });
        return;
      }
      showFetched(body);
    } catch {
      setState({ kind: "error", message: t("resumatch.flow.error.network") });
    }
  }, [emailText, emailSubject, t, showFetched]);

  const uploadJob = useCallback(async () => {
    if (!uploadFile) return;
    setState({ kind: "fetching" });
    try {
      const form = new FormData();
      form.append("file", uploadFile);
      const res = await fetch("/api/tailor/upload-job", { method: "POST", body: form });
      const body = await readJsonBody(res);
      if (!res.ok || !body) {
        setState({
          kind: "error",
          message: body?.error ?? `${t("resumatch.flow.error.upload")} ${t("resumatch.flow.error.server", { status: res.status })}`,
        });
        return;
      }
      showFetched(body);
    } catch {
      setState({ kind: "error", message: t("resumatch.flow.error.network") });
    }
  }, [uploadFile, t, showFetched]);

  const submitManualJob = useCallback(async (values: ManualJobFormValues) => {
    setState({ kind: "fetching" });
    try {
      const res = await fetch("/api/tailor/manual-job", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          title: values.title,
          employer: values.employer,
          location: values.location || undefined,
          workMode: values.workMode || undefined,
          employmentType: values.employmentType || undefined,
          salaryMin: values.salaryMin ? Number(values.salaryMin) : undefined,
          salaryMax: values.salaryMax ? Number(values.salaryMax) : undefined,
          salaryCurrency: values.salaryCurrency || undefined,
          applicationDeadline: values.applicationDeadline || undefined,
          responsibilities: values.responsibilities || undefined,
          requirements: values.requirements || undefined,
          preferredQualifications: values.preferredQualifications || undefined,
          benefits: values.benefits || undefined,
          contactName: values.contactName || undefined,
          source: values.source || undefined,
        }),
      });
      const body = await readJsonBody(res);
      if (!res.ok || !body) {
        setState({
          kind: "error",
          message: body?.error ?? `${t("resumatch.flow.error.manual")} ${t("resumatch.flow.error.server", { status: res.status })}`,
        });
        return;
      }
      showFetched(body);
    } catch {
      setState({ kind: "error", message: t("resumatch.flow.error.network") });
    }
  }, [t, showFetched]);

  const startReview = useCallback(
    async (targetJobId: string) => {
      setState({ kind: "loading_review", targetJobId });
      try {
        const res = await fetch("/api/tailor/generate-preview", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({
            profileVersionId: confirmedVersionId,
            targetJobId,
            includeCoverLetter,
            coverLetterTone: includeCoverLetter ? coverLetterTone : undefined,
            coverLetterLength: includeCoverLetter ? coverLetterLength : undefined,
            coverLetterOutputLanguage: includeCoverLetter ? (coverLetterLanguage ?? undefined) : undefined,
            instructions: instructions.trim() || undefined,
            outputLanguage: cvLanguage,
            proceedDespiteLowFit: lowFitConfirmedFor === targetJobId ? true : undefined,
          }),
        });
        const body = await readJsonBody(res);
        // The server's own fit check found a low fit the card hadn't shown
        // (the fit request failed or was still loading): show the warning.
        if (res.status === 409 && body?.code === "LOW_FIT_UNCONFIRMED" && body.fit && lastFetched?.targetJobId === targetJobId) {
          setFit({ targetJobId, fit: body.fit as JobFit });
          setState({ kind: "fetched", ...lastFetched });
          return;
        }
        if (!res.ok || !body) {
          setState({
            kind: "error",
            message: body?.error ?? `${t("resumatch.flow.error.tailor")} ${t("resumatch.flow.error.server", { status: res.status })}`,
            canGoBack: true,
          });
          return;
        }

        const suggestions = body.suggestions as
          | { headline: string | null; summary: string | null; skillsOrder: string[]; experienceBullets: string[][] }
          | null;
        const coverLetterResult = body.coverLetter as
          | {
              suggestion: { greeting: string; paragraphs: string[]; signOff: string } | null;
              degraded: boolean;
              promptVersion: string;
              modelVersion: string;
              outputLanguage: string | null;
              removedSentences?: number;
              droppedParagraphs?: number;
            }
          | null;
        const profile = body.profile as {
          fullName: string | null;
          headline: string | null;
          summary: string | null;
          skills: string[];
          experience: {
            title: string;
            employer: string | null;
            startedOn: string | null;
            endedOn: string | null;
            isCurrent: boolean;
            summary: string | null;
          }[];
        };

        // "Regenerate": the saved CV's own hand edits come back.
        const seedEdits = seed && seed.job.targetJobId === targetJobId ? seed.candidateEdits : NO_CANDIDATE_EDITS;
        const suggestedOrder = orderProfileSkills(suggestions?.skillsOrder ?? [], profile.skills);
        const ownByRole = ownBulletsByRole(seedEdits, profile.experience);
        const review: ReviewState = {
          targetJobId,
          previewId: body.previewId,
          promptVersion: body.promptVersion,
          modelVersion: body.modelVersion,
          degraded: body.degraded,
          instructions: typeof body.instructions === "string" ? body.instructions : null,
          outputLanguage: isOutputLanguage(body.outputLanguage) ? body.outputLanguage : null,
          lowFit: body.lowFit === true,
          headline: suggestions?.headline ?? profile.headline ?? "",
          // "Regenerate" keeps the candidate's own summary; otherwise the
          // AI's, or the profile's when the AI wrote none.
          summary: seedEdits.ownSummary ?? suggestions?.summary ?? profile.summary ?? "",
          // What the review starts with when the candidate types nothing:
          // only a summary that differs from it is kept as their own.
          aiSummary: suggestions?.summary ?? profile.summary ?? null,
          profileSummary: profile.summary,
          editOf: null,
          originalSkillsOrder: profile.skills,
          suggestedSkillsOrder: suggestedOrder,
          keepOriginalSkillOrder: !suggestions?.skillsOrder?.length,
          ...seedSkillEdits(seedEdits, profile.skills),
          experience: profile.experience.map((entry, index) => {
            const suggestedBullets = suggestions?.experienceBullets?.[index] ?? [];
            const ownBullets = ownByRole[index] ?? [];
            return {
              title: entry.title,
              employer: entry.employer,
              startedOn: entry.startedOn,
              endedOn: entry.endedOn,
              isCurrent: entry.isCurrent,
              originalSummary: entry.summary,
              bullets: buildReviewBullets(suggestedBullets, ownBullets, entry.summary, nextBulletKey),
            };
          }),
          // A degraded letter has no suggestion; it still gets an entry (with
          // include: false) so the review says so instead of staying silent.
          coverLetter: coverLetterResult
            ? {
                greeting: coverLetterResult.suggestion?.greeting ?? "",
                paragraphs: coverLetterResult.suggestion?.paragraphs ?? [],
                signOff: coverLetterResult.suggestion?.signOff ?? "",
                degraded: coverLetterResult.degraded || !coverLetterResult.suggestion,
                promptVersion: coverLetterResult.promptVersion,
                modelVersion: coverLetterResult.modelVersion,
                outputLanguage: isOutputLanguage(coverLetterResult.outputLanguage) ? coverLetterResult.outputLanguage : null,
                removedSentences: coverLetterResult.removedSentences ?? 0,
                droppedParagraphs: coverLetterResult.droppedParagraphs ?? 0,
                include: Boolean(coverLetterResult.suggestion) && !coverLetterResult.degraded,
              }
            : null,
          profileFullName: profile.fullName,
        };

        setState({ kind: "reviewing", review });
      } catch {
        setState({ kind: "error", message: t("resumatch.flow.error.network"), canGoBack: true });
      }
    },
    [
      confirmedVersionId,
      includeCoverLetter,
      coverLetterTone,
      coverLetterLength,
      coverLetterLanguage,
      instructions,
      cvLanguage,
      lowFitConfirmedFor,
      lastFetched,
      seed,
      nextBulletKey,
      t,
    ],
  );

  /** Change one bullet (`patch`), or delete it (`null`). */
  const updateBullet = useCallback(
    (experienceIndex: number, key: string, patch: Partial<ReviewBullet> | null) => {
      setState((previous) => {
        if (previous.kind !== "reviewing") return previous;
        const experience = previous.review.experience.map((entry, i) => {
          if (i !== experienceIndex) return entry;
          const bullets =
            patch === null
              ? entry.bullets.filter((b) => b.key !== key)
              : entry.bullets.map((b) => (b.key === key ? { ...b, ...patch } : b));
          return { ...entry, bullets };
        });
        return { kind: "reviewing", review: { ...previous.review, experience } };
      });
    },
    [],
  );

  const addBullet = useCallback(
    (experienceIndex: number) => {
      const key = nextBulletKey();
      setState((previous) => {
        if (previous.kind !== "reviewing") return previous;
        const experience = previous.review.experience.map((entry, i) =>
          i === experienceIndex
            ? { ...entry, bullets: [...entry.bullets, { key, text: "", accepted: true, aiText: null }] }
            : entry,
        );
        return { kind: "reviewing", review: { ...previous.review, experience } };
      });
      // Focus the new, empty bullet once it has rendered.
      requestAnimationFrame(() => {
        document.querySelector<HTMLTextAreaElement>(`[data-bullet-key="${key}"] textarea`)?.focus();
      });
    },
    [nextBulletKey],
  );

  const updateReview = useCallback(<K extends keyof ReviewState>(key: K, value: ReviewState[K]) => {
    setState((previous) => {
      if (previous.kind !== "reviewing") return previous;
      return { kind: "reviewing", review: { ...previous.review, [key]: value } };
    });
  }, []);

  const updateCoverLetter = useCallback(<K extends keyof ReviewCoverLetter>(key: K, value: ReviewCoverLetter[K]) => {
    setState((previous) => {
      if (previous.kind !== "reviewing" || !previous.review.coverLetter) return previous;
      return {
        kind: "reviewing",
        review: { ...previous.review, coverLetter: { ...previous.review.coverLetter, [key]: value } },
      };
    });
  }, []);

  const updateCoverLetterParagraph = useCallback((index: number, value: string) => {
    setState((previous) => {
      if (previous.kind !== "reviewing" || !previous.review.coverLetter) return previous;
      const paragraphs = previous.review.coverLetter.paragraphs.map((p, i) => (i === index ? value : p));
      return {
        kind: "reviewing",
        review: { ...previous.review, coverLetter: { ...previous.review.coverLetter, paragraphs } },
      };
    });
  }, []);

  const confirm = useCallback(
    async (review: ReviewState) => {
      setState({ kind: "confirming", review });
      const editOf = review.editOf;
      try {
        const res = await fetch(editOf ? `/api/tailor/${encodeURIComponent(editOf.resumeId)}/edit` : "/api/tailor/generate-confirm", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({
            ...(editOf
              ? {}
              : {
                  profileVersionId: confirmedVersionId,
                  targetJobId: review.targetJobId,
                  previewId: review.previewId,
                  instructions: review.instructions,
                }),
            approved: review.degraded
              ? null
              : {
                  headline: review.headline.trim() || null,
                  summary: review.summary.trim() || null,
                  // The merge appends profile skills left out of the order in
                  // profile order, exactly as orderProfileSkills shows them, so
                  // the first 60 (the proposal's own cap) say the same thing.
                  skillsOrder: review.keepOriginalSkillOrder
                    ? []
                    : review.suggestedSkillsOrder.slice(0, MAX_PROPOSED_SKILLS),
                  experienceBullets: review.experience.map((entry) => approvedBullets(entry.bullets)),
                },
            // The candidate's own changes: applied to this CV only, and
            // kept so "Regenerate" can bring them back.
            candidateEdits: review.degraded
              ? null
              : {
                  addedSkills: review.addedSkills,
                  removedSkills: review.removedSkills,
                  ownBullets: review.experience
                    .map((entry) => ({
                      title: entry.title,
                      employer: entry.employer,
                      startedOn: entry.startedOn,
                      bullets: approvedOwnBullets(entry.bullets),
                    }))
                    .filter((row) => row.bullets.length > 0),
                  ownSummary: ownSummaryOf(review.summary, review.aiSummary),
                },
            coverLetter:
              review.coverLetter && review.coverLetter.include && !review.coverLetter.degraded
                ? {
                    approved: {
                      greeting: review.coverLetter.greeting.trim(),
                      paragraphs: review.coverLetter.paragraphs.map((p) => p.trim()).filter(Boolean),
                      signOff: review.coverLetter.signOff.trim(),
                    },
                  }
                : null,
          }),
        });
        const body = await readJsonBody(res);
        if (!res.ok || !body) {
          const message =
            body?.error ?? `${t("resumatch.flow.error.save")} ${t("resumatch.flow.error.server", { status: res.status })}`;
          // Keep the review (and every hand edit) open so the candidate can
          // fix it or just press Save again: a refused or failed write hands
          // the preview back. Only a used-up preview (409) can't be retried.
          if (res.status !== 409 || editOf) {
            setState({ kind: "reviewing", review, saveError: message });
            return;
          }
          setState({ kind: "error", message, canGoBack: true });
          return;
        }
        if (editOf) {
          router.push(
            editOf.coverLetterId
              ? `/tailor/${editOf.resumeId}/preview?coverLetterId=${editOf.coverLetterId}`
              : `/tailor/${editOf.resumeId}/preview`,
          );
          return;
        }
        // The CV is saved even when its letter is not (coverLetterError);
        // the preview page then says so instead of silently dropping it.
        router.push(
          body.coverLetterId
            ? `/tailor/${body.id}/preview?coverLetterId=${body.coverLetterId}`
            : body.coverLetterError
              ? `/tailor/${body.id}/preview?coverLetterFailed=1`
              : `/tailor/${body.id}/preview`,
        );
      } catch {
        setState({ kind: "reviewing", review, saveError: t("resumatch.flow.error.network") });
      }
    },
    [confirmedVersionId, router, t],
  );

  /** A language's name for use inside a sentence, in the UI language. */
  const languageName = (code: OutputLanguage) => t(`resumatch.lang.${code}`);

  const activeJobId =
    state.kind === "fetched" || state.kind === "loading_review"
      ? state.targetJobId
      : state.kind === "reviewing" || state.kind === "confirming"
        ? state.review.targetJobId
        : state.kind === "error" && state.canGoBack
          ? (lastFetched?.targetJobId ?? null)
          : null;

  const busy = state.kind === "fetching" || state.kind === "loading_review" || state.kind === "confirming";

  return (
    <Card title={t("resumatch.flow.cardTitle")}>
      <p style={{ color: "var(--muted)" }}>
        {t("resumatch.flow.intro")}
      </p>

      <div className="rm-mode-tabs">
        <Button variant={mode === "url" ? undefined : "ghost"} size="sm" onClick={() => setMode("url")} disabled={busy}>
          {t("resumatch.flow.mode.url")}
        </Button>
        <Button variant={mode === "paste" ? undefined : "ghost"} size="sm" onClick={() => setMode("paste")} disabled={busy}>
          {t("resumatch.flow.mode.paste")}
        </Button>
        <Button variant={mode === "email" ? undefined : "ghost"} size="sm" onClick={() => setMode("email")} disabled={busy}>
          {t("resumatch.flow.mode.email")}
        </Button>
        <Button variant={mode === "upload" ? undefined : "ghost"} size="sm" onClick={() => setMode("upload")} disabled={busy}>
          {t("resumatch.flow.mode.upload")}
        </Button>
        <Button variant={mode === "manual" ? undefined : "ghost"} size="sm" onClick={() => setMode("manual")} disabled={busy}>
          {t("resumatch.flow.mode.manual")}
        </Button>
      </div>

      {mode === "url" ? (
        <div className="rm-intake-panel" style={{ display: "flex", gap: "0.5rem" }}>
          <Input
            type="url"
            placeholder="https://company.example/careers/senior-engineer"
            value={url}
            onChange={(e) => setUrl(e.target.value)}
            disabled={busy}
            style={{ flex: 1 }}
          />
          <Button onClick={fetchJob} disabled={!url.trim() || busy}>
            {state.kind === "fetching" ? t("resumatch.flow.fetching") : t("resumatch.flow.fetch")}
          </Button>
        </div>
      ) : mode === "paste" ? (
        <div className="rm-intake-panel">
          <p className="rm-intake-panel__hint">
            {t("resumatch.flow.paste.hint")}
          </p>
          <textarea className="ui-input"
            rows={8}
            placeholder={t("resumatch.flow.paste.placeholder")}
            value={pastedText}
            onChange={(e) => setPastedText(e.target.value)}
            disabled={busy}
            style={{ width: "100%" }}
          />
          <div style={{ marginTop: "0.5rem" }}>
            <Button onClick={pasteJob} disabled={pastedText.trim().length < MIN_PASTE_CHARS || busy}>
              {state.kind === "fetching" ? t("resumatch.flow.reading") : t("resumatch.flow.paste.submit")}
            </Button>
          </div>
        </div>
      ) : mode === "email" ? (
        <div className="rm-intake-panel">
          <p className="rm-intake-panel__hint">
            {t("resumatch.flow.email.hint")}
          </p>
          <Input
            type="text"
            placeholder={t("resumatch.flow.email.subject")}
            value={emailSubject}
            onChange={(e) => setEmailSubject(e.target.value)}
            disabled={busy}
            style={{ marginBottom: "0.5rem" }}
          />
          <textarea className="ui-input"
            rows={8}
            placeholder={t("resumatch.flow.email.placeholder")}
            value={emailText}
            onChange={(e) => setEmailText(e.target.value)}
            disabled={busy}
            style={{ width: "100%" }}
          />
          <div style={{ marginTop: "0.5rem" }}>
            <Button onClick={pasteEmail} disabled={emailText.trim().length < MIN_PASTE_CHARS || busy}>
              {state.kind === "fetching" ? t("resumatch.flow.reading") : t("resumatch.flow.email.submit")}
            </Button>
          </div>
        </div>
      ) : mode === "upload" ? (
        <div className="rm-intake-panel">
          <p className="rm-intake-panel__hint" id="rm-upload-job-hint">
            {t("resumatch.flow.upload.hint")}
          </p>
          <input
            type="file"
            aria-label={t("resumatch.flow.upload.aria")}
            aria-describedby="rm-upload-job-hint"
            accept=".pdf,.docx,.txt,application/pdf,application/vnd.openxmlformats-officedocument.wordprocessingml.document,text/plain"
            onChange={(e) => setUploadFile(e.target.files?.[0] ?? null)}
            disabled={busy}
          />
          <div style={{ marginTop: "0.5rem" }}>
            <Button onClick={uploadJob} disabled={!uploadFile || busy}>
              {state.kind === "fetching" ? t("resumatch.flow.reading") : t("resumatch.flow.upload.submit")}
            </Button>
          </div>
        </div>
      ) : (
        <div className="rm-intake-panel">
          <ManualJobForm busy={busy} onSubmit={submitManualJob} />
        </div>
      )}

      {state.kind === "fetch_failed" ? (
        <div style={{ marginTop: "1rem" }}>
          <Alert tone="warning">{t(
              FETCH_FAILURE_CODES.has(state.reasonCode)
                ? `resumatch.flow.fetchFailed.${state.reasonCode}`
                : "resumatch.flow.fetchFailed.default",
            )}</Alert>
        </div>
      ) : null}

      {state.kind === "error" ? (
        <div style={{ marginTop: "1rem" }}>
          <Alert tone="error">{state.message}</Alert>
          {state.canGoBack && lastFetched ? (
            <div style={{ marginTop: "0.5rem" }}>
              <Button variant="ghost" size="sm" onClick={backToOptions}>
                {t("resumatch.flow.backToOptions")}
              </Button>
            </div>
          ) : null}
        </div>
      ) : null}

      {seed && activeJobId === seed.job.targetJobId ? (
        <div className="rm-regen-note" role="status" data-testid="regenerate-note">
          <p>{t("resumatch.flow.regen.note")}</p>
          <p className="rm-regen-note__links">
            <Link href={`/tailor/${seed.fromResumeId}/preview`}>{t("resumatch.flow.regen.backToSaved")}</Link>
            <Link href="/profile">{t("resumatch.flow.regen.editProfile")}</Link>
          </p>
        </div>
      ) : null}

      {state.kind === "fetched" ? (
        <div style={{ marginTop: "1rem" }}>
          <Card title={state.title ?? t("resumatch.flow.jobFound")}>
            {state.employer ? <p style={{ color: "var(--muted)" }}>{state.employer}</p> : null}
            <p style={{ color: "var(--muted)", fontSize: "0.9rem" }}>{state.snippet}…</p>
            {fit && fit.targetJobId === state.targetJobId ? (
              <JobFitPanel
                fit={fit.fit}
                confirmed={lowFitConfirmedFor === state.targetJobId}
                onConfirm={() => setLowFitConfirmedFor(state.targetJobId)}
                onDecline={() => {
                  setFit(null);
                  setLowFitConfirmedFor(null);
                  setState({ kind: "idle" });
                }}
              />
            ) : null}
            {fit?.targetJobId === state.targetJobId && fit.fit.level === "low" && lowFitConfirmedFor !== state.targetJobId ? null : (
            <>
            <label className="jm-field" style={{ display: "block", margin: "0.5rem 0" }}>
              <span className="rm-review__section-label">{t("resumatch.flow.cvLanguage")}</span>
              <select
                className="ui-input ui-select"
                value={cvLanguage}
                onChange={(e) => setCvLanguage(e.target.value as OutputLanguage)}
                aria-describedby="rm-cv-language-help"
                style={{ maxWidth: "16rem" }}
              >
                {OUTPUT_LANGUAGES.map((code) => (
                  <option key={code} value={code}>
                    {LANGUAGE_LABELS[code]}
                  </option>
                ))}
              </select>
              <small id="rm-cv-language-help">
                {t("resumatch.flow.cvLanguageHelp")}
              </small>
            </label>
            <label className="jm-field" style={{ display: "block", margin: "0.5rem 0" }}>
              <span className="rm-review__section-label">{t("resumatch.flow.instructions.label")}</span>
              <textarea className="ui-input"
                rows={2}
                placeholder={t("resumatch.flow.instructions.placeholder")}
                value={instructions}
                maxLength={INSTRUCTIONS_MAX_CHARS}
                onChange={(e) => setInstructions(e.target.value)}
                style={{ width: "100%" }}
              />
              <span style={{ color: "var(--muted)", fontSize: "0.78rem" }}>
                {t("resumatch.flow.instructions.counter", { count: instructions.length, max: INSTRUCTIONS_MAX_CHARS })}
              </span>
            </label>
            <label style={{ display: "flex", alignItems: "center", gap: "0.5rem", fontSize: "0.85rem", margin: "0.5rem 0" }}>
              <input
                type="checkbox"
                checked={includeCoverLetter}
                onChange={(e) => setIncludeCoverLetter(e.target.checked)}
              />
              <span>{t("resumatch.flow.includeCoverLetter")}</span>
            </label>
            {includeCoverLetter ? (
              <div style={{ display: "flex", gap: "1rem", flexWrap: "wrap", margin: "0 0 0.75rem" }}>
                <label style={{ display: "flex", alignItems: "center", gap: "0.4rem", fontSize: "0.82rem" }}>
                  <span>{t("resumatch.flow.tone")}</span>
                  <select className="ui-input ui-select" value={coverLetterTone} onChange={(e) => setCoverLetterTone(e.target.value as typeof coverLetterTone)}>
                    <option value="formal">{t("resumatch.flow.tone.formal")}</option>
                    <option value="warm">{t("resumatch.flow.tone.warm")}</option>
                    <option value="confident">{t("resumatch.flow.tone.confident")}</option>
                  </select>
                </label>
                <label style={{ display: "flex", alignItems: "center", gap: "0.4rem", fontSize: "0.82rem" }}>
                  <span>{t("resumatch.flow.length")}</span>
                  <select className="ui-input ui-select" value={coverLetterLength} onChange={(e) => setCoverLetterLength(e.target.value as typeof coverLetterLength)}>
                    <option value="short">{t("resumatch.flow.length.short")}</option>
                    <option value="standard">{t("resumatch.flow.length.standard")}</option>
                    <option value="detailed">{t("resumatch.flow.length.detailed")}</option>
                  </select>
                </label>
                <label style={{ display: "flex", alignItems: "center", gap: "0.4rem", fontSize: "0.82rem" }}>
                  <span>{t("resumatch.flow.language")}</span>
                  <select
                    className="ui-input ui-select"
                    value={coverLetterLanguage ?? ""}
                    onChange={(e) =>
                      setCoverLetterLanguage(isOutputLanguage(e.target.value) ? e.target.value : null)
                    }
                  >
                    <option value="">{t("resumatch.flow.sameAsCv", { language: LANGUAGE_LABELS[cvLanguage] })}</option>
                    {OUTPUT_LANGUAGES.map((code) => (
                      <option key={code} value={code}>
                        {LANGUAGE_LABELS[code]}
                      </option>
                    ))}
                  </select>
                </label>
              </div>
            ) : null}
            <Button onClick={() => startReview(state.targetJobId)}>
              {seed && seed.job.targetJobId === state.targetJobId
                ? t("resumatch.flow.regen.run")
                : t("resumatch.flow.startReview")}
            </Button>
            </>
            )}
          </Card>
        </div>
      ) : null}

      {state.kind === "loading_review" ? (
        <div style={{ marginTop: "1rem" }}>
          <Card>
            <TailoringLoader />
          </Card>
        </div>
      ) : null}

      {state.kind === "reviewing" || state.kind === "confirming" ? (
        <div className="rm-review">
          <Card title={t(state.review.editOf ? "resumatch.review.editTitle" : "resumatch.review.title")}>
            {state.review.editOf ? (
              <p className="rm-regen-note" role="status" data-testid="edit-note">
                {t("resumatch.review.editNote")}
              </p>
            ) : null}
            {state.review.degraded ? (
              <Alert tone="warning">
                {t("resumatch.review.degraded")}
                {state.review.outputLanguage ? ` ${t("resumatch.review.degradedLanguage")}` : ""}
              </Alert>
            ) : (
              <>
                {state.review.editOf ? null : (
                  <p className="rm-review__intro">
                    {t("resumatch.review.intro")}
                  </p>
                )}
                {state.review.outputLanguage ? (
                  <p className="rx-lang-note">
                    <span className="rx-pill rx-pill--lang">{LANGUAGE_LABELS[state.review.outputLanguage]}</span>
                    {t("resumatch.review.langNote", { language: languageName(state.review.outputLanguage) })}
                  </p>
                ) : null}

                {state.review.lowFit ? (
                  <p className="rm-fit__review-note">{t("resumatch.review.lowFitNote")}</p>
                ) : null}

                {state.review.instructions ? (
                  <p style={{ color: "var(--muted)", fontSize: "0.82rem", fontStyle: "italic" }}>
                    {t("resumatch.review.steering", { note: state.review.instructions })}
                  </p>
                ) : null}

                <div className="rm-review__section">
                  <label htmlFor="rm-review-headline" className="rm-review__section-label">{t("resumatch.review.headline")}</label>
                  <input
                    id="rm-review-headline"
                    type="text"
                    value={state.review.headline}
                    onChange={(e) => updateReview("headline", e.target.value)}
                    disabled={state.kind === "confirming"}
                  />
                </div>

                <div className="rm-review__section">
                  <label htmlFor="rm-review-summary" className="rm-review__section-label">{t("resumatch.review.summary")}</label>
                  <textarea className="ui-input"
                    id="rm-review-summary"
                    rows={4}
                    value={state.review.summary}
                    onChange={(e) => updateReview("summary", e.target.value)}
                    disabled={state.kind === "confirming"}
                    aria-describedby="rm-review-summary-help"
                    maxLength={2000}
                  />
                  <div className="rm-review__summary-tools">
                    <small id="rm-review-summary-help">{t("resumatch.review.summaryHelp")}</small>
                    {state.review.profileSummary?.trim() &&
                    state.review.summary.trim() !== state.review.profileSummary.trim() ? (
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => updateReview("summary", state.review.profileSummary ?? "")}
                        disabled={state.kind === "confirming"}
                      >
                        {t("resumatch.review.useProfileSummary")}
                      </Button>
                    ) : null}
                    {state.review.aiSummary?.trim() &&
                    state.review.aiSummary.trim() !== state.review.profileSummary?.trim() &&
                    state.review.summary.trim() !== state.review.aiSummary.trim() ? (
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => updateReview("summary", state.review.aiSummary ?? "")}
                        disabled={state.kind === "confirming"}
                      >
                        {t("resumatch.review.useAiSummary")}
                      </Button>
                    ) : null}
                  </div>
                </div>

                <ReviewSkillsEditor
                  baseSkills={
                    state.review.keepOriginalSkillOrder ? state.review.originalSkillsOrder : state.review.suggestedSkillsOrder
                  }
                  canReorder={state.review.suggestedSkillsOrder.join() !== state.review.originalSkillsOrder.join()}
                  reorder={!state.review.keepOriginalSkillOrder}
                  onReorderChange={(value) => updateReview("keepOriginalSkillOrder", !value)}
                  removedSkills={state.review.removedSkills}
                  addedSkills={state.review.addedSkills}
                  onRemovedChange={(next) => updateReview("removedSkills", next)}
                  onAddedChange={(next) => updateReview("addedSkills", next)}
                  disabled={state.kind === "confirming"}
                />
                <p className="rm-review__own-note">{t("resumatch.review.ownNote")}</p>

                {state.review.experience.length > 0 ? (
                  <div className="rm-review__section">
                    <span className="rm-review__section-label">{t("resumatch.review.experience")}</span>
                    {state.review.experience.map((entry, entryIndex) => (
                      <div className="rm-entry" key={entryIndex}>
                        <div className="rm-entry__heading">
                          <strong>{entry.title}</strong>
                          {entry.employer ? <span className="rm-entry__sub"> · {entry.employer}</span> : null}
                        </div>
                        {entry.bullets.length === 0 ? (
                          <p style={{ color: "var(--muted)", fontSize: "0.85rem", fontStyle: "italic", margin: "0.4rem 0 0" }}>
                            {t("resumatch.review.noSuggestion")}
                          </p>
                        ) : null}
                        <ReviewBulletsEditor
                          role={entry.employer ? `${entry.title} · ${entry.employer}` : entry.title}
                          bullets={entry.bullets}
                          onChange={(key, patch) => updateBullet(entryIndex, key, patch)}
                          onAdd={() => addBullet(entryIndex)}
                          disabled={state.kind === "confirming"}
                        />
                      </div>
                    ))}
                  </div>
                ) : null}
              </>
            )}

            {state.review.coverLetter ? (
              <div className="rm-review__section">
                {state.review.editOf ? (
                  <span className="rm-review__section-label">{t("resumatch.coverLetter")}</span>
                ) : (
                  <label className="rm-skill-toggle">
                    <input
                      type="checkbox"
                      checked={state.review.coverLetter.include}
                      onChange={(e) => updateCoverLetter("include", e.target.checked)}
                      disabled={state.kind === "confirming" || state.review.coverLetter.degraded}
                    />
                    <span>{t("resumatch.coverLetter")}</span>
                  </label>
                )}

                {state.review.coverLetter.degraded ? (
                  <Alert tone="warning">
                    {t("resumatch.review.cl.degraded")}
                    {state.review.coverLetter.outputLanguage
                      ? ` ${t("resumatch.review.cl.degradedLanguage", {
                          language: languageName(state.review.coverLetter.outputLanguage),
                        })}`
                      : ""}{" "}
                    {t("resumatch.review.cl.cvStillSaves")}
                  </Alert>
                ) : state.review.coverLetter.include ? (
                  <div style={{ marginTop: "0.5rem" }} lang={state.review.coverLetter.outputLanguage ?? undefined}>
                    {state.review.coverLetter.removedSentences + state.review.coverLetter.droppedParagraphs > 0 ? (
                      <Alert tone="info">
                        <span lang={pageLocale}>
                          {t("resumatch.review.cl.removedClaims", {
                            count: String(state.review.coverLetter.removedSentences + state.review.coverLetter.droppedParagraphs),
                          })}
                        </span>
                      </Alert>
                    ) : null}
                    {state.review.coverLetter.outputLanguage ? (
                      <p className="rx-lang-note" lang={pageLocale}>
                        <span className="rx-pill rx-pill--lang">
                          {LANGUAGE_LABELS[state.review.coverLetter.outputLanguage]}
                        </span>
                        {t("resumatch.review.cl.langNote", {
                          language: languageName(state.review.coverLetter.outputLanguage),
                        })}
                      </p>
                    ) : null}
                    <label className="jm-field">
                      <span className="rm-review__section-label">{t("resumatch.review.cl.greeting")}</span>
                      <input
                        type="text"
                        value={state.review.coverLetter.greeting}
                        onChange={(e) => updateCoverLetter("greeting", e.target.value)}
                        disabled={state.kind === "confirming"}
                      />
                    </label>
                    {state.review.coverLetter.paragraphs.map((paragraph, index) => (
                      <label className="jm-field" key={index} style={{ display: "block", marginTop: "0.5rem" }}>
                        <span className="rm-review__section-label">{t("resumatch.review.cl.paragraph", { n: index + 1 })}</span>
                        <textarea className="ui-input"
                          rows={3}
                          value={paragraph}
                          onChange={(e) => updateCoverLetterParagraph(index, e.target.value)}
                          disabled={state.kind === "confirming"}
                          style={{ width: "100%" }}
                        />
                      </label>
                    ))}
                    <label className="jm-field" style={{ display: "block", marginTop: "0.5rem" }}>
                      <span className="rm-review__section-label">{t("resumatch.review.cl.signOff")}</span>
                      <input
                        type="text"
                        value={state.review.coverLetter.signOff}
                        onChange={(e) => updateCoverLetter("signOff", e.target.value)}
                        disabled={state.kind === "confirming"}
                      />
                    </label>
                    <div style={{ marginTop: "0.75rem" }}>
                      <CoverLetterQualityChecklist
                        quality={computeCoverLetterQuality(
                          {
                            contractVersion: "1.0.0",
                            greeting: state.review.coverLetter.greeting,
                            paragraphs: state.review.coverLetter.paragraphs,
                            signOff: state.review.coverLetter.signOff,
                            fullName: state.review.profileFullName,
                          },
                          coverLetterLength,
                          state.review.coverLetter.outputLanguage,
                        )}
                      />
                    </div>
                  </div>
                ) : (
                  <p style={{ color: "var(--muted)", fontSize: "0.85rem", fontStyle: "italic", margin: "0.3rem 0 0" }}>
                    {t("resumatch.review.cl.declined")}
                  </p>
                )}
              </div>
            ) : null}

            {state.kind === "reviewing" && state.saveError ? (
              <div style={{ marginTop: "1rem" }}>
                <Alert tone="error">{state.saveError}</Alert>
              </div>
            ) : null}

            {state.review.editOf ? (
              <div className="rm-review__actions">
                <Button onClick={() => confirm(state.review)} disabled={state.kind === "confirming"}>
                  {state.kind === "confirming" ? t("resumatch.saving") : t("resumatch.review.saveChanges")}
                </Button>
                <Link
                  href={
                    state.review.editOf.coverLetterId
                      ? `/tailor/${state.review.editOf.resumeId}/preview?coverLetterId=${state.review.editOf.coverLetterId}`
                      : `/tailor/${state.review.editOf.resumeId}/preview`
                  }
                  className="ui-btn ui-btn--ghost"
                  aria-disabled={state.kind === "confirming" || undefined}
                >
                  {t("resumatch.review.cancelEdit")}
                </Link>
              </div>
            ) : (
            <div className="rm-review__actions">
              <Button onClick={() => confirm(state.review)} disabled={state.kind === "confirming"}>
                {state.kind === "confirming" ? t("resumatch.saving") : t("resumatch.review.confirm")}
              </Button>
              <Button variant="ghost" onClick={backToOptions} disabled={state.kind === "confirming" || !lastFetched}>
                {t("resumatch.flow.backToOptions")}
              </Button>
              <Button variant="ghost" onClick={() => setState({ kind: "idle" })} disabled={state.kind === "confirming"}>
                {t("resumatch.review.discard")}
              </Button>
            </div>
            )}
          </Card>
        </div>
      ) : null}
    </Card>
  );
}
