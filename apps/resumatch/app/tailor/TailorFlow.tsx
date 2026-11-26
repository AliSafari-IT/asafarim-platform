"use client";

import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useTranslation } from "@asafarim/shared-i18n";
import { Alert, Button, Card, ConfirmDialog, Input } from "@asafarim/ui";
import { ManualJobForm, type ManualJobFormValues } from "./ManualJobForm";
import { JobFilesPicker, type JobFileErrors } from "../../components/tailoring/JobFilesPicker";
import { fileKey } from "../../lib/tailoring/jobFiles";
import { computeCoverLetterQuality } from "../../lib/tailoring/coverLetterQuality";
import { CoverLetterQualityChecklist } from "../../components/tailoring/CoverLetterQualityChecklist";
import { TailoringLoader } from "../../components/tailoring/TailoringLoader";
import { FitAssessmentPanel } from "../../components/tailoring/FitAssessmentPanel";
import { EvidencePanel } from "../../components/tailoring/EvidencePanel";
import { ReviewBulletsEditor, ReviewSkillsEditor } from "../../components/tailoring/ReviewEditors";
import {
  ClaimCard,
  ClaimSummaryBar,
  ClaimText,
  markId,
  RequirementGaps,
  SaveImpact,
  type EvidenceSource,
  type SaveImpactItem,
} from "../../components/tailoring/ClaimReview";
import {
  applyRecheck,
  confirmedClaimsOf,
  fieldIssuesFrom,
  isCurrent,
  isEdited,
  openCount,
  openGapCount,
  openIssues,
  removalFor,
  savedConfirmation,
  setAllStatus,
  setIssueStatus,
  withoutOpenIssues,
  type ClaimReviewState,
  type FieldIssues,
  type RequirementGap,
} from "../../lib/tailoring/claimReview";
import type { ClaimIssue } from "../../lib/tailoring/selection/claims";
import { MAX_BULLETS_PER_ROLE, MAX_PROPOSED_SKILLS, NO_CANDIDATE_EDITS, ownBulletsByRole } from "../../lib/tailoring/candidateEdits";
import {
  approvedBulletOrigins,
  approvedBullets,
  approvedIndexOf,
  approvedOwnBullets,
  isOwnBullet,
  buildReviewBullets,
  orderProfileSkills,
  seedSkillEdits,
  type ReviewBullet,
} from "../../lib/tailoring/reviewEdits";
import type { RegenerateSeed } from "../../lib/tailoring/regenerate";
import type { ReviewBulletMeta } from "../../lib/tailoring/reviewEdits";
import { degradedMessage, isDegradedReason, type DegradedReason } from "../../lib/tailoring/degradedReason";
import { ownSummaryOf, type SavedReviewSeed } from "../../lib/tailoring/editSaved";
import {
  LANGUAGE_LABELS,
  OUTPUT_LANGUAGES,
  isOutputLanguage,
  outputLanguageFromLocale,
  type OutputLanguage,
} from "../../lib/tailoring/language";
import { WritingSettingsSummary, WritingSource } from "../../components/tailoring/WritingSettings";
import { putWritingPreferences } from "../../lib/writingPreferences/client";
import type { WritingPreferences, WritingPreferencesView } from "../../lib/writingPreferences/contract";
import { deriveFeedback, type FeedbackItem, type FeedbackReason, type OriginalSuggestions } from "../../lib/tailoring/feedback";
import { preferencePromotionPayload } from "../../lib/tailoring/feedbackScope";
import { FeedbackPanel, type BackgroundDraft, type OwnBulletChoice, type PreferenceDraft } from "../../components/tailoring/FeedbackPanel";
import type { DraftOptions, TailorDraftView } from "../../lib/tailoring/drafts/contract";

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
  /** #931: the saved writing preferences the options card starts from
   *  (null: none). Choices on the card apply to this run only, unless the
   *  candidate presses "Remember". */
  writingPreferences?: WritingPreferencesView | null;
  /** An unfinished run to resume (lib/tailoring/drafts): the flow opens on
   *  its job, with its choices, or on its review exactly as it was left.
   *  The job is never refetched and no AI call runs to resume. */
  draft?: TailorDraftView | null;
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
  /** #756: why there is no letter, for a specific message; null when the
   *  server didn't say (the generic message is shown). */
  degradedReason: DegradedReason | "grounding" | null;
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
  /** #756: why the CV wasn't AI-tailored; null for the generic message. */
  degradedReason: DegradedReason | null;
  /** #756: when the monthly AI budgets reset (YYYY-MM-DD, UTC). */
  budgetResetsOn: string | null;
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
  /** How many confirmed evidence items the run used (#929). */
  evidenceUsed?: number;
  /** #931: whether the saved style notes steered this run. */
  styleNotes?: "saved" | "off" | "none";
  /** #930: claim-check flags on the AI headline and summary (empty: none),
   *  how many AI suggestions were flagged, and how many job requirements
   *  the profile does not back (so the CV does not claim them). */
  headlineFlags?: string[];
  summaryFlags?: string[];
  flaggedClaims?: number;
  unbackedRequirements?: number;
  /** #964: what exactly the claim check could not trace, per checked text
   *  ("headline", "summary", or a bullet's key), and what the candidate
   *  did about it. Missing on a draft from before #964: the older notes
   *  above are shown instead. */
  claimReview?: ClaimReviewState;
  /** #964: job requirements the profile does not back, to discuss. */
  gaps?: RequirementGap[];
  /** The source labels of this preview, for review cards. */
  sourceLabels?: Record<string, string>;
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
  /** #932: the suggestions as generated (null when editing a saved CV),
   *  for the "Your changes" panel. The server keeps its own copy. */
  original?: OriginalSuggestions | null;
  profileHeadline?: string | null;
  /** #932: optional reason codes, by feedback key. */
  feedbackReasons?: Record<string, FeedbackReason>;
  /** #932: bullets to add to the confirmed background, by review bullet key. */
  background?: Record<string, BackgroundDraft>;
  /** #932: new style notes to remember, or null for none. */
  preferenceDraft?: PreferenceDraft | null;
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
  /** Names of the uploaded files the job was read from (several files
   *  since 0.6.18); absent for the other intake paths. */
  sourceFiles?: string[] | null;
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

const NO_IDS: string[] = [];

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

/** The CV part of what Save sends: what the candidate approved. */
/**
 * #964: the headline or summary Save sends. The AI's own text leaves out
 * the words still open (or falls back to the profile's text when they
 * cannot be cut cleanly); text the candidate typed is kept as written.
 */
function savedFieldText(review: ReviewState, key: "headline" | "summary"): string {
  const text = review[key];
  const field = review.claimReview?.[key];
  if (!field || isEdited(field, text)) return text;
  const result = withoutOpenIssues(field, text);
  if (!result.fallback) return result.text;
  return (key === "headline" ? review.profileHeadline : review.profileSummary) ?? "";
}

function approvedCvOf(review: ReviewState) {
  return {
    headline: savedFieldText(review, "headline").trim() || null,
    summary: savedFieldText(review, "summary").trim() || null,
    // The merge appends profile skills left out of the order in
    // profile order, exactly as orderProfileSkills shows them, so
    // the first 60 (the proposal's own cap) say the same thing.
    skillsOrder: review.keepOriginalSkillOrder ? [] : review.suggestedSkillsOrder.slice(0, MAX_PROPOSED_SKILLS),
    experienceBullets: review.experience.map((entry) => approvedBullets(entry.bullets)),
  };
}

/** #964: the text a claim-review key stands for on screen. */
function claimFieldText(review: ReviewState, key: string): string | undefined {
  if (key === "headline" || key === "summary") return review[key];
  for (const entry of review.experience) {
    const bullet = entry.bullets.find((b) => b.key === key);
    if (bullet) return bullet.text;
  }
  return undefined;
}

/** #964: the text a key will be saved with, or undefined when it is not saved. */
function savedClaimText(review: ReviewState, key: string): string | undefined {
  if (key === "headline" || key === "summary") return savedFieldText(review, key);
  for (const entry of review.experience) {
    const bullet = entry.bullets.find((b) => b.key === key);
    if (bullet) return bullet.accepted ? bullet.text : undefined;
  }
  return undefined;
}

/** #964: what Save will do with each claim still open, for "Before you save". */
function saveImpactOf(review: ReviewState, locationOf: (key: string) => string, fieldName: (key: "headline" | "summary") => string): SaveImpactItem[] {
  const items: SaveImpactItem[] = [];
  for (const [key, field] of Object.entries(review.claimReview ?? {})) {
    const text = claimFieldText(review, key);
    if (text === undefined) continue;
    const current = isCurrent(field, text);
    const open = current ? openIssues(field) : [];
    const location = locationOf(key);
    if (field.field !== "bullet") {
      const k = key as "headline" | "summary";
      if (open.length === 0) continue;
      if (isEdited(field, text)) {
        for (const issue of open) items.push({ kind: "kept", location, text: issue.text, targetId: markId(key, issue.id) });
        continue;
      }
      const result = withoutOpenIssues(field, text);
      if (result.fallback) items.push({ kind: "fallback", location, field: fieldName(k), text: "", targetId: null });
      else for (const issue of open) items.push({ kind: "removed", location, field: fieldName(k), text: issue.text, targetId: markId(key, issue.id) });
      continue;
    }
    const bullet = review.experience.flatMap((e) => e.bullets).find((b) => b.key === key);
    if (!bullet) continue;
    if (!bullet.accepted && field.issues.length > 0) {
      const first = open[0] ?? field.issues[0]!;
      items.push({ kind: "excluded", location, text: text.length > 140 ? `${text.slice(0, 139)}…` : text, targetId: current ? markId(key, first.id) : null });
    } else if (bullet.accepted) {
      for (const issue of open) items.push({ kind: "kept", location, text: issue.text, targetId: markId(key, issue.id) });
    }
  }
  return items;
}

/** The letter part of what Save sends, with each paragraph's origin (#932). */
function approvedLetterOf(review: ReviewState) {
  const letter = review.coverLetter;
  if (!letter || !letter.include || letter.degraded) return null;
  const kept = letter.paragraphs.map((p, index) => ({ text: p.trim(), index })).filter((p) => p.text);
  return {
    approved: { greeting: letter.greeting.trim(), paragraphs: kept.map((p) => p.text), signOff: letter.signOff.trim() },
    paragraphOrigins: kept.map((p) => p.index),
  };
}

/** #932: the feedback the server will record for this review. */
function feedbackOf(review: ReviewState): FeedbackItem[] {
  if (!review.original) return [];
  const letter = approvedLetterOf(review);
  return deriveFeedback({
    original: review.original,
    profile: {
      headline: review.profileHeadline ?? null,
      summary: review.profileSummary,
      skills: review.originalSkillsOrder,
      roles: review.experience.length,
    },
    approved: review.degraded ? null : approvedCvOf(review),
    bulletOrigins: review.experience.map((entry) => approvedBulletOrigins(entry.bullets)),
    letter: { included: letter !== null, approved: letter?.approved ?? null, paragraphOrigins: letter?.paragraphOrigins },
  });
}

/** #932: bullets the candidate wrote or rewrote and kept, which they may
 *  add to their confirmed background. */
function ownBulletChoices(review: ReviewState): (OwnBulletChoice & { experienceIndex: number; bulletIndex: number })[] {
  if (review.degraded) return [];
  return review.experience.flatMap((entry, experienceIndex) =>
    entry.bullets.flatMap((bullet) => {
      const bulletIndex = approvedIndexOf(entry.bullets, bullet.key);
      if (bulletIndex === -1 || !isOwnBullet(bullet)) return [];
      return [
        {
          key: bullet.key,
          role: entry.employer ? `${entry.title} · ${entry.employer}` : entry.title,
          text: bullet.text.trim(),
          experienceIndex,
          bulletIndex,
        },
      ];
    }),
  );
}

/** The review of a saved CV, filled in as it was saved (no AI call). */
function reviewFromSaved(saved: SavedReviewSeed, nextKey: () => string): ReviewState {
  return {
    targetJobId: saved.job.targetJobId,
    previewId: "",
    promptVersion: "",
    modelVersion: "",
    degraded: false,
    degradedReason: null,
    budgetResetsOn: null,
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
          degradedReason: null,
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

function jobOfDraft(draft: TailorDraftView): FetchedJob {
  return { targetJobId: draft.targetJobId, title: draft.title, employer: draft.employer, snippet: draft.snippet, sourceFiles: draft.sourceFiles };
}

/** A saved review draft, if it still has the shape this page renders. */
function resumableReview(draft: TailorDraftView | null): ReviewState | null {
  if (!draft || draft.step !== "review" || !draft.review) return null;
  const review = draft.review;
  if (review.targetJobId !== draft.targetJobId || review.previewId !== draft.previewId) return null;
  if (typeof review.headline !== "string" || typeof review.summary !== "string") return null;
  if (!Array.isArray(review.experience) || !Array.isArray(review.suggestedSkillsOrder)) return null;
  return { ...(review as unknown as ReviewState), editOf: null };
}

/** The highest `b<n>` bullet key in a review, so new keys never collide. */
function maxBulletKey(review: ReviewState | null): number {
  let max = 0;
  for (const entry of review?.experience ?? []) {
    for (const bullet of entry.bullets ?? []) {
      const n = /^b(\d+)$/.exec(String(bullet.key))?.[1];
      if (n) max = Math.max(max, Number(n));
    }
  }
  return max;
}

const DRAFT_SAVE_DELAY_MS = 800;
/** fetch keepalive bodies are capped (64 KB in browsers); a larger review
 *  is saved by the regular debounced save instead. */
const KEEPALIVE_MAX_CHARS = 60_000;

export function TailorFlow({ confirmedVersionId, seed = null, editSeed = null, writingPreferences = null, draft = null }: TailorFlowProps) {
  const router = useRouter();
  const { t, locale: pageLocale } = useTranslation();
  const draftOptions: DraftOptions | null = draft?.options ?? null;
  const [url, setUrl] = useState(draft?.sourceUrl ?? "");
  const [pastedText, setPastedText] = useState("");
  const [emailText, setEmailText] = useState("");
  const [emailSubject, setEmailSubject] = useState("");
  const [uploadFiles, setUploadFiles] = useState<File[]>([]);
  const [uploadErrors, setUploadErrors] = useState<JobFileErrors>({});
  const [mode, setMode] = useState<Mode>("url");
  const [instructions, setInstructions] = useState(draftOptions?.instructions ?? seed?.instructions ?? "");
  // #931: the saved writing preferences, kept current after "Remember".
  const [savedWriting, setSavedWriting] = useState<WritingPreferencesView | null>(writingPreferences);
  const savedPrefs = savedWriting?.preferences ?? null;
  // #641: defaults to the page language from the language bar (#640);
  // the candidate can pick another for this run. #931: a regenerate seed
  // first, then the saved preference, then that default.
  const [cvLanguage, setCvLanguage] = useState<OutputLanguage>(
    () => draftOptions?.cvLanguage ?? seed?.cvLanguage ?? writingPreferences?.preferences.cv.outputLanguage ?? outputLanguageFromLocale(pageLocale),
  );
  const [includeCoverLetter, setIncludeCoverLetter] = useState(draftOptions?.includeCoverLetter ?? seed?.includeCoverLetter ?? false);
  const [coverLetterTone, setCoverLetterTone] = useState<"formal" | "warm" | "confident">(
    draftOptions?.coverLetterTone ?? seed?.coverLetterTone ?? writingPreferences?.preferences.coverLetter.tone ?? "formal",
  );
  const [coverLetterLength, setCoverLetterLength] = useState<"short" | "standard" | "detailed">(
    draftOptions?.coverLetterLength ?? seed?.coverLetterLength ?? writingPreferences?.preferences.coverLetter.length ?? "standard",
  );
  // #642: null means "same as the CV", so the letter keeps following the CV
  // language until the candidate picks a different one on purpose.
  const [coverLetterLanguage, setCoverLetterLanguage] = useState<OutputLanguage | null>(
    draftOptions
      ? draftOptions.coverLetterLanguage
      : seed && seed.hadCoverLetter !== false
      ? seed.coverLetterLanguage
      : (writingPreferences?.preferences.coverLetter.outputLanguage ?? null),
  );
  const hasSavedNotes = Boolean(savedPrefs?.cv.styleNote || savedPrefs?.coverLetter.styleNote);
  // A per-run opt-out, kept only for the job it was made on: another job
  // starts with the saved notes on again.
  const [notesOffFor, setNotesOffFor] = useState<string | null>(draftOptions?.savedNotesOff ? draft!.targetJobId : null);
  const [writingNote, setWritingNote] = useState<{ tone: "info" | "error"; text: string } | null>(null);
  const [rememberBusy, setRememberBusy] = useState(false);
  // What "Remember" would save: the card's choices, the saved notes kept.
  // The letter's choices only count when the card shows them.
  const cardPreferences: WritingPreferences = {
    cv: { outputLanguage: cvLanguage, styleNote: savedPrefs?.cv.styleNote ?? null },
    coverLetter: includeCoverLetter
      ? {
          tone: coverLetterTone,
          length: coverLetterLength,
          outputLanguage: coverLetterLanguage,
          styleNote: savedPrefs?.coverLetter.styleNote ?? null,
        }
      : (savedPrefs?.coverLetter ?? { tone: null, length: null, outputLanguage: null, styleNote: null }),
  };
  const cardMatchesSaved =
    savedPrefs !== null &&
    savedPrefs.cv.outputLanguage === cardPreferences.cv.outputLanguage &&
    savedPrefs.coverLetter.tone === cardPreferences.coverLetter.tone &&
    savedPrefs.coverLetter.length === cardPreferences.coverLetter.length &&
    savedPrefs.coverLetter.outputLanguage === cardPreferences.coverLetter.outputLanguage;
  async function rememberChoices() {
    setRememberBusy(true);
    setWritingNote(null);
    const result = await putWritingPreferences(cardPreferences, savedWriting?.revisionId ?? null);
    setRememberBusy(false);
    if (result.kind === "saved") {
      setSavedWriting(result.current);
      setWritingNote({ tone: "info", text: t("resumatch.writing.flow.remembered") });
    } else if (result.kind === "stale") {
      setSavedWriting(result.current);
      setWritingNote({ tone: "error", text: t("resumatch.writing.stale") });
    } else {
      setWritingNote({ tone: "error", text: t("resumatch.writing.error.save") });
    }
  }
  const [resumedReview] = useState(() => resumableReview(draft));
  const bulletKeyRef = useRef(maxBulletKey(resumedReview));
  const nextBulletKey = useCallback(() => `b${++bulletKeyRef.current}`, []);
  const [state, setState] = useState<FetchState>(() =>
    editSeed
      ? { kind: "reviewing", review: reviewFromSaved(editSeed, nextBulletKey) }
      : seed
        ? { kind: "fetched", ...seed.job }
        : resumedReview
          ? { kind: "reviewing", review: resumedReview }
          : draft
            ? { kind: "fetched", ...jobOfDraft(draft) }
            : { kind: "idle" },
  );
  // #971: the gate the job fit assessment applies for the job on the card
  // (lib/tailoring/fit): the current AI assessment, else the keyword check.
  // Null while loading or when it couldn't load, which never blocks
  // tailoring: generate-preview applies the same gate before any AI call.
  // while loading or when it couldn't run, which never blocks tailoring.
  const [fitGate, setFitGate] = useState<{ targetJobId: string; lowFit: boolean } | null>(null);
  // The candidate's explicit "yes, tailor anyway" for a low-fit job.
  const [lowFitConfirmedFor, setLowFitConfirmedFor] = useState<string | null>(
    draftOptions?.lowFitConfirmed ? draft!.targetJobId : null,
  );
  // #971: "no" answers are saved server-side with the job fit and read by
  // generate-preview; a draft's older `unmetRequirementIds` are no longer
  // sent, so an answer the panel cannot show or undo never restricts a run.
  // A counter refreshes the evidence list after an answer is saved as
  // evidence.
  const [evidenceVersion, setEvidenceVersion] = useState(0);
  const [evidenceUsedCount, setEvidenceUsedCount] = useState<number | null>(null);
  const [evidenceRevisionsKey, setEvidenceRevisionsKey] = useState("");
  const [lastFetched, setLastFetched] = useState<FetchedJob | null>(
    editSeed?.job ?? seed?.job ?? (draft ? jobOfDraft(draft) : null),
  );

  // ─── Tailor drafts (lib/tailoring/drafts) ──────────────────────────────
  // Every run on a job is kept server-side until its CV is saved or it is
  // discarded: the options card and the review are saved as the candidate
  // works, and once more when the page is hidden or left. Not when editing
  // a saved CV, which has its own record.
  const draftsEnabled = !editSeed;
  /** What the note under the job says: a resumed draft, or a fetch that
   *  reused an earlier one (with "Fetch again"). */
  const [draftNote, setDraftNote] = useState<{ kind: "resumed" | "reused"; date: string; targetJobId: string } | null>(
    draft ? { kind: "resumed", date: draft.fetchedAt.slice(0, 10), targetJobId: draft.targetJobId } : null,
  );
  const [reviewExpired, setReviewExpired] = useState(Boolean(draft?.reviewExpired));
  const [saveStatus, setSaveStatus] = useState<"idle" | "saving" | "saved" | "failed">("idle");
  const [confirmDiscard, setConfirmDiscard] = useState(false);
  const [discarding, setDiscarding] = useState(false);
  /** Jobs whose draft is gone (saved or discarded): never saved again. */
  const closedDraftsRef = useRef(new Set<string>());
  const pendingDraftRef = useRef<{ targetJobId: string; body: string } | null>(null);
  const lastSavedDraftRef = useRef(new Map<string, string>());
  const inflightDraftRef = useRef<Promise<void> | null>(null);

  const flushDraft = useCallback(async (onLeave = false) => {
    const pending = pendingDraftRef.current;
    if (!pending) return;
    pendingDraftRef.current = null;
    if (closedDraftsRef.current.has(pending.targetJobId)) return;
    if (!onLeave) setSaveStatus("saving");
    const run = (async () => {
      try {
        const res = await fetch(`/api/tailor/drafts/${encodeURIComponent(pending.targetJobId)}`, {
          method: "PUT",
          headers: { "content-type": "application/json" },
          body: pending.body,
          keepalive: onLeave && pending.body.length < KEEPALIVE_MAX_CHARS,
        });
        if (res.ok) {
          lastSavedDraftRef.current.set(pending.targetJobId, pending.body);
          if (!onLeave) setSaveStatus("saved");
        } else if (!onLeave) {
          // 409: the review's preview was used or is gone, so there is no
          // review left to keep. Anything else is a failed save.
          setSaveStatus(res.status === 409 ? "idle" : "failed");
        }
      } catch {
        if (!onLeave) setSaveStatus("failed");
      }
    })();
    inflightDraftRef.current = run;
    await run;
  }, []);

  /** Stops saving a job's draft (saved or discarded), after any save in
   *  flight has landed, so nothing recreates it afterwards. */
  const closeDraftLocally = useCallback(async (targetJobId: string) => {
    closedDraftsRef.current.add(targetJobId);
    if (pendingDraftRef.current?.targetJobId === targetJobId) pendingDraftRef.current = null;
    await inflightDraftRef.current;
  }, []);

  const showFetched = useCallback((body: Record<string, any>) => {
    const sourceFiles = Array.isArray(body.sourceFiles)
      ? body.sourceFiles.map((file: { name?: unknown }) => (typeof file?.name === "string" ? file.name : "")).filter(Boolean)
      : null;
    const job: FetchedJob = { targetJobId: body.id, title: body.title, employer: body.employer, snippet: body.snippet, sourceFiles };
    setFitGate(null);
    setLowFitConfirmedFor(null);
    setLastFetched(job);
    setReviewExpired(false);
    setSaveStatus("idle");
    closedDraftsRef.current.delete(job.targetJobId);
    setDraftNote(
      body.reused === true && typeof body.fetchedAt === "string"
        ? { kind: "reused", date: body.fetchedAt.slice(0, 10), targetJobId: job.targetJobId }
        : null,
    );
    setState({ kind: "fetched", ...job });
    // A reload or a return to /tailor reopens this job, whatever the URL
    // said before (?new=1, ?draft=<another job>).
    if (!editSeed && typeof window !== "undefined") {
      window.history.replaceState(window.history.state, "", `/tailor?draft=${encodeURIComponent(job.targetJobId)}`);
    }
  }, [editSeed]);

  /** Back from the review (or a failed tailoring run) to the options card
   *  of the same job, with every choice kept, so the candidate can change
   *  the language, steering note or letter options and run it again. */
  const backToOptions = useCallback(() => {
    if (lastFetched) setState({ kind: "fetched", ...lastFetched });
  }, [lastFetched]);


  /** `refresh`: "Fetch again" on a link fetched before, for a posting
   *  that changed. Otherwise a recent fetch of the same link is reused. */
  const fetchJob = useCallback(async (refresh = false) => {
    if (!url.trim()) return;
    setState({ kind: "fetching" });
    try {
      const res = await fetch("/api/tailor/fetch-job", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(refresh ? { url: url.trim(), refresh: true } : { url: url.trim() }),
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
    if (uploadFiles.length === 0) return;
    setState({ kind: "fetching" });
    setUploadErrors({});
    try {
      const form = new FormData();
      for (const file of uploadFiles) form.append("file", file);
      const res = await fetch("/api/tailor/upload-job", { method: "POST", body: form });
      const body = await readJsonBody(res);
      if (!res.ok || !body) {
        // The route answers per file, in the order sent: mark each failed one.
        if (Array.isArray(body?.files) && body.files.length === uploadFiles.length) {
          const marks: JobFileErrors = {};
          body.files.forEach((result: { ok?: boolean; code?: string; error?: string }, index: number) => {
            if (result?.ok === false) {
              marks[fileKey(uploadFiles[index])] = { code: result.code ?? "", error: result.error ?? "" };
            }
          });
          setUploadErrors(marks);
        }
        setState({
          kind: "error",
          message: body?.error ?? `${t("resumatch.flow.error.upload")} ${t("resumatch.flow.error.server", { status: res.status })}`,
        });
        return;
      }
      setUploadFiles([]);
      showFetched(body);
    } catch {
      setState({ kind: "error", message: t("resumatch.flow.error.network") });
    }
  }, [uploadFiles, t, showFetched]);

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
            // #931: null is an explicit "same as the CV", which beats a
            // saved letter language.
            coverLetterOutputLanguage: includeCoverLetter ? coverLetterLanguage : undefined,
            useSavedWritingStyle: hasSavedNotes ? notesOffFor !== targetJobId : undefined,
            instructions: instructions.trim() || undefined,
            outputLanguage: cvLanguage,
            proceedDespiteLowFit: lowFitConfirmedFor === targetJobId ? true : undefined,
          }),
        });
        const body = await readJsonBody(res);
        // The server's own fit check found a low fit the card hadn't shown
        // (the fit request failed or was still loading): show the warning.
        if (res.status === 409 && body?.code === "LOW_FIT_UNCONFIRMED" && lastFetched?.targetJobId === targetJobId) {
          setFitGate({ targetJobId, lowFit: true });
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
              degradedReason?: unknown;
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

        // #930: the claim check, and a readable label per cited source id.
        const claimCheck = body.claimCheck as
          | { claims: { field: string; experienceIndex: number | null; bulletIndex: number | null; sourceIds: string[]; flags: string[] }[]; flagged: number }
          | null
          | undefined;
        const sourceLabels = new Map<string, string>(
          ((body.sources ?? []) as { id: string; kind: string; label: string }[]).map((source) => [
            source.id,
            source.kind === "evidence"
              ? t("resumatch.claims.source.evidence", { title: source.label })
              : source.id.startsWith("exp:")
                ? source.label
                : t(`resumatch.claims.source.${source.id.split(":")[0]}`),
          ]),
        );
        const claimFor = (field: string, experienceIndex: number | null = null, bulletIndex: number | null = null) =>
          claimCheck?.claims.find((c) => c.field === field && c.experienceIndex === experienceIndex && c.bulletIndex === bulletIndex);
        const bulletMeta = (experienceIndex: number, count: number): (ReviewBulletMeta | undefined)[] =>
          Array.from({ length: count }, (_, bulletIndex) => {
            const claim = claimFor("bullet", experienceIndex, bulletIndex);
            return claim ? { sources: claim.sourceIds.map((id) => sourceLabels.get(id) ?? id), flags: claim.flags } : undefined;
          });
        const requirementStatuses = ((body.requirements ?? []) as { status: string }[]).map((r) => r.status);

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
          degradedReason: body.degraded && isDegradedReason(body.degradedReason) ? body.degradedReason : null,
          budgetResetsOn: typeof body.budgetResetsOn === "string" ? body.budgetResetsOn : null,
          instructions: typeof body.instructions === "string" ? body.instructions : null,
          outputLanguage: isOutputLanguage(body.outputLanguage) ? body.outputLanguage : null,
          lowFit: body.lowFit === true,
          evidenceUsed: typeof body.evidenceUsed === "number" ? body.evidenceUsed : 0,
          styleNotes: body.writing?.styleNotes === "saved" || body.writing?.styleNotes === "off" ? body.writing.styleNotes : "none",
          headlineFlags: suggestions?.headline ? (claimFor("headline")?.flags ?? []) : [],
          summaryFlags: suggestions?.summary && !seedEdits.ownSummary ? (claimFor("summary")?.flags ?? []) : [],
          flaggedClaims: claimCheck?.flagged ?? 0,
          unbackedRequirements: requirementStatuses.filter((status) => status !== "supported").length,
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
              bullets: buildReviewBullets(suggestedBullets, ownBullets, entry.summary, nextBulletKey, bulletMeta(index, suggestedBullets.length)),
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
                degradedReason:
                  coverLetterResult.degradedReason === "grounding" || isDegradedReason(coverLetterResult.degradedReason)
                    ? coverLetterResult.degradedReason
                    : null,
                promptVersion: coverLetterResult.promptVersion,
                modelVersion: coverLetterResult.modelVersion,
                outputLanguage: isOutputLanguage(coverLetterResult.outputLanguage) ? coverLetterResult.outputLanguage : null,
                removedSentences: coverLetterResult.removedSentences ?? 0,
                droppedParagraphs: coverLetterResult.droppedParagraphs ?? 0,
                include: Boolean(coverLetterResult.suggestion) && !coverLetterResult.degraded,
              }
            : null,
          profileFullName: profile.fullName,
          original: {
            cv: suggestions
              ? {
                  headline: suggestions.headline,
                  summary: suggestions.summary,
                  skillsOrder: suggestions.skillsOrder ?? [],
                  experienceBullets: suggestions.experienceBullets ?? [],
                }
              : null,
            coverLetter: coverLetterResult?.suggestion && !coverLetterResult.degraded ? coverLetterResult.suggestion : null,
          },
          profileHeadline: profile.headline,
          feedbackReasons: {},
          background: {},
          preferenceDraft: null,
        };

        // #964: the exact words behind every flag, per checked text, and
        // the job requirements the profile does not back. A claim the
        // candidate confirmed on the CV being regenerated stays confirmed.
        const savedClaims = seedEdits.confirmedClaims ?? [];
        const issuesOf = (field: string, experienceIndex: number | null = null, bulletIndex: number | null = null) =>
          ((claimFor(field, experienceIndex, bulletIndex) as { issues?: ClaimIssue[] } | undefined)?.issues ?? []) as ClaimIssue[];
        if (claimCheck) {
          const claimReview: ClaimReviewState = {};
          if (suggestions?.headline) {
            claimReview.headline = fieldIssuesFrom("headline", null, suggestions.headline, issuesOf("headline"), (issue) =>
              savedConfirmation(savedClaims, "headline", undefined, issue),
            );
          }
          if (suggestions?.summary && !seedEdits.ownSummary) {
            claimReview.summary = fieldIssuesFrom("summary", null, suggestions.summary, issuesOf("summary"), (issue) =>
              savedConfirmation(savedClaims, "summary", undefined, issue),
            );
          }
          review.experience = review.experience.map((entry, experienceIndex) => {
            const role = { title: entry.title, employer: entry.employer, startedOn: entry.startedOn };
            let ticked = entry.bullets.filter((b) => b.accepted).length;
            return {
              ...entry,
              bullets: entry.bullets.map((bullet) => {
                if (bullet.aiIndex === undefined || bullet.aiText === null) return bullet;
                const field = fieldIssuesFrom("bullet", experienceIndex, bullet.text, issuesOf("bullet", experienceIndex, bullet.aiIndex), (issue) =>
                  savedConfirmation(savedClaims, "bullet", role, issue),
                );
                claimReview[bullet.key] = field;
                // Every issue already confirmed: it starts ticked again.
                if (!bullet.accepted && field.issues.length > 0 && openIssues(field).length === 0 && ticked < MAX_BULLETS_PER_ROLE) {
                  ticked += 1;
                  return { ...bullet, accepted: true };
                }
                return bullet;
              }),
            };
          });
          review.claimReview = claimReview;
          review.sourceLabels = Object.fromEntries(sourceLabels);
          review.gaps = ((body.requirements ?? []) as { id: string; text: string; priority: string; status: string }[])
            .filter((r) => r.status !== "supported")
            .map((r) => ({ requirementId: r.id, text: r.text, priority: r.priority, status: r.status, decision: "open" as const }));
        }

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
      hasSavedNotes,
      notesOffFor,
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

  // ── #964: the claim review ──
  const [activeIssue, setActiveIssue] = useState<{ key: string; id: string } | null>(null);
  const [editingField, setEditingField] = useState<string | null>(null);
  const [onlyFlagged, setOnlyFlagged] = useState(false);
  const [recheckStatus, setRecheckStatus] = useState<Record<string, { status: "checking" | "failed"; text: string }>>({});

  /** Change the review in one step (text, ticks and issue statuses together). */
  const mutateReview = useCallback((change: (review: ReviewState) => ReviewState) => {
    setState((previous) => (previous.kind === "reviewing" ? { kind: "reviewing", review: change(previous.review) } : previous));
  }, []);

  const withClaim = (review: ReviewState, key: string, change: (field: FieldIssues) => FieldIssues): ReviewState => {
    const field = review.claimReview?.[key];
    return field ? { ...review, claimReview: { ...review.claimReview, [key]: change(field) } } : review;
  };

  const withBullet = (review: ReviewState, key: string, patch: Partial<ReviewBullet>): ReviewState => ({
    ...review,
    experience: review.experience.map((entry) =>
      entry.bullets.some((b) => b.key === key) ? { ...entry, bullets: entry.bullets.map((b) => (b.key === key ? { ...b, ...patch } : b)) } : entry,
    ),
  });

  /** A bullet whose issues are all settled (none open, none excluded) is
   *  ticked, room allowing; one with an excluded issue is not. */
  const settleBullet = (review: ReviewState, key: string): ReviewState => {
    const field = review.claimReview?.[key];
    if (!field || field.field !== "bullet") return review;
    const entry = review.experience.find((e) => e.bullets.some((b) => b.key === key));
    const bullet = entry?.bullets.find((b) => b.key === key);
    if (!entry || !bullet) return review;
    const excluded = field.issues.some((i) => i.status === "excluded");
    const open = openIssues(field).length > 0;
    if (!open && !excluded && !bullet.accepted && entry.bullets.filter((b) => b.accepted).length < MAX_BULLETS_PER_ROLE) {
      return withBullet(review, key, { accepted: true });
    }
    if ((open || excluded) && bullet.accepted && !isEdited(field, bullet.text)) return withBullet(review, key, { accepted: false });
    return review;
  };

  /** Bullet tick box: ticking a flagged bullet says its claims are true
   *  (confirmed by the candidate); unticking leaves it out. */
  const changeBullet = useCallback(
    (experienceIndex: number, key: string, patch: Partial<ReviewBullet> | null) => {
      if (patch && patch.accepted !== undefined && patch.text === undefined) {
        const accepted = patch.accepted;
        mutateReview((review) => {
          let next = withBullet(review, key, { accepted });
          next = withClaim(next, key, (field) =>
            accepted ? setAllStatus(field, ["open", "excluded"], "confirmed") : setAllStatus(field, ["open", "confirmed"], "excluded"),
          );
          return next;
        });
        return;
      }
      updateBullet(experienceIndex, key, patch);
    },
    [mutateReview, updateBullet],
  );

  // An edited text is checked again before its issues count as resolved.
  useEffect(() => {
    if (state.kind !== "reviewing" || !state.review.claimReview || state.review.degraded) return;
    const review = state.review;
    const dirty = Object.entries(review.claimReview!).flatMap(([key, field]) => {
      const text = claimFieldText(review, key);
      if (text === undefined || isCurrent(field, text)) return [];
      if (recheckStatus[key]?.text === text) return []; // checking it, or it failed for this text
      return [{ key, field, text }];
    });
    if (dirty.length === 0) return;
    const timer = setTimeout(async () => {
      setRecheckStatus((previous) => ({ ...previous, ...Object.fromEntries(dirty.map((d) => [d.key, { status: "checking" as const, text: d.text }])) }));
      try {
        const res = await fetch("/api/tailor/check-claims", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({
            previewId: review.previewId,
            items: dirty.map((d) => ({ field: d.field.field, experienceIndex: d.field.experienceIndex, text: d.text })),
          }),
        });
        const body = (await readJsonBody(res)) as { issues?: ClaimIssue[][] } | null;
        if (!res.ok || !Array.isArray(body?.issues)) throw new Error("recheck failed");
        mutateReview((current) => {
          let next = current;
          dirty.forEach((d, index) => {
            // Typed on since: the next run checks the newer text.
            if (claimFieldText(next, d.key) !== d.text) return;
            next = withClaim(next, d.key, (field) => applyRecheck(field, d.text, body.issues![index] ?? []));
            next = settleBullet(next, d.key);
          });
          return next;
        });
        setRecheckStatus((previous) => {
          const next = { ...previous };
          for (const d of dirty) if (next[d.key]?.text === d.text) delete next[d.key];
          return next;
        });
      } catch {
        setRecheckStatus((previous) => ({ ...previous, ...Object.fromEntries(dirty.map((d) => [d.key, { status: "failed" as const, text: d.text }])) }));
      }
    }, 700);
    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state, recheckStatus, mutateReview]);

  /** Every open issue in page order: headline, summary, then each role's bullets. */
  const openIssueOrder = (review: ReviewState): { key: string; id: string }[] => {
    const claims = review.claimReview ?? {};
    const keys = ["headline", "summary", ...review.experience.flatMap((e) => e.bullets.map((b) => b.key))];
    return keys.flatMap((key) => {
      const field = claims[key];
      const text = claimFieldText(review, key);
      if (!field || text === undefined || !isCurrent(field, text)) return [];
      return openIssues(field)
        .sort((a, b) => a.start - b.start)
        .map((issue) => ({ key, id: issue.id }));
    });
  };

  const focusIssue = useCallback((target: { key: string; id: string }) => {
    setEditingField(null);
    setActiveIssue(target);
    requestAnimationFrame(() => {
      const el = document.getElementById(markId(target.key, target.id));
      el?.scrollIntoView({ block: "center", behavior: "smooth" });
      el?.focus({ preventScroll: true });
    });
  }, []);

  const reviewNext = (review: ReviewState) => {
    const order = openIssueOrder(review);
    if (order.length === 0) return;
    const at = activeIssue ? order.findIndex((o) => o.key === activeIssue.key && o.id === activeIssue.id) : -1;
    focusIssue(order[(at + 1) % order.length]!);
  };

  const editClaim = (key: string, issue: { start: number; end: number }) => {
    setEditingField(key);
    setActiveIssue(null);
    requestAnimationFrame(() => {
      const el =
        key === "headline" || key === "summary"
          ? document.getElementById(`rm-review-${key}`)
          : document.querySelector(`[data-bullet-key="${key}"] textarea`);
      if (el instanceof HTMLInputElement || el instanceof HTMLTextAreaElement) {
        el.focus();
        el.setSelectionRange(issue.start, issue.end);
      }
    });
  };

  const setClaimText = (key: string, text: string) => {
    mutateReview((review) =>
      key === "headline" || key === "summary" ? { ...review, [key]: text } : withBullet(review, key, { text }),
    );
    setActiveIssue(null);
  };

  const setStatus = (key: string, issueId: string, status: "open" | "confirmed" | "excluded", detail?: string | null) => {
    mutateReview((review) => {
      let next = withClaim(review, key, (field) => setIssueStatus(field, issueId, status, detail));
      if (status === "excluded") {
        next = withBullet(next, key, { accepted: false });
        next = withClaim(next, key, (field) => setAllStatus(field, ["open", "confirmed"], "excluded"));
      }
      return settleBullet(next, key);
    });
  };

  const addGapBullet = (requirementId: string, roleIndex: number, text: string) => {
    const key = nextBulletKey();
    mutateReview((review) => ({
      ...review,
      experience: review.experience.map((entry, i) =>
        i === roleIndex
          ? {
              ...entry,
              bullets: [...entry.bullets, { key, text, accepted: entry.bullets.filter((b) => b.accepted).length < MAX_BULLETS_PER_ROLE, aiText: null }],
            }
          : entry,
      ),
      gaps: (review.gaps ?? []).map((g) => (g.requirementId === requirementId ? { ...g, decision: "added" } : g)),
    }));
  };

  const claimRole = (review: ReviewState, key: string) => {
    const field = review.claimReview?.[key];
    return field?.field === "bullet" && field.experienceIndex !== null ? review.experience[field.experienceIndex] : undefined;
  };

  /** "Experience at Probex Belgium", "Headline". */
  const claimLocation = (review: ReviewState, key: string): string => {
    if (key === "headline" || key === "summary") return t(`resumatch.claimReview.location.${key}`);
    const role = claimRole(review, key);
    if (!role) return t("resumatch.review.experience");
    return role.employer
      ? t("resumatch.claimReview.location.role", { employer: role.employer })
      : t("resumatch.claimReview.location.title", { title: role.title });
  };

  /** "your role at Probex Belgium", "your profile". */
  const claimWhere = (review: ReviewState, key: string): string => {
    const role = claimRole(review, key);
    if (!role) return t("resumatch.claimReview.where.profile");
    return role.employer ? t("resumatch.claimReview.where.role", { employer: role.employer }) : t("resumatch.claimReview.where.title", { title: role.title });
  };

  const evidenceSource = (review: ReviewState, id: string): EvidenceSource => {
    const label = review.sourceLabels?.[id] ?? id;
    const section = id.startsWith("exp:")
      ? "experience"
      : id.startsWith("edu:")
        ? "education"
        : id === "skills"
          ? "skills"
          : id === "languages"
            ? "languages"
            : id === "certs"
              ? "certifications"
              : id === "headline" || id === "summary" || id === "work_auth"
                ? "about"
                : null;
    return { label, href: section ? `/profile#rm-sec-${section}` : null };
  };

  const needsReview = (review: ReviewState, key: string): boolean => {
    const field = review.claimReview?.[key];
    const text = claimFieldText(review, key);
    return Boolean(field && text !== undefined && isCurrent(field, text) && openIssues(field).length > 0);
  };

  /** The highlighted text of a checked field, or null for the plain editor. */
  const claimView = (review: ReviewState, key: string, text: string): ReactNode | null => {
    const field = review.claimReview?.[key];
    if (!field || editingField === key || !isCurrent(field, text) || field.issues.length === 0) return null;
    return (
      <ClaimText
        fieldKey={key}
        text={text}
        issues={field.issues}
        activeId={activeIssue?.key === key ? activeIssue.id : null}
        onOpen={(id) => setActiveIssue(activeIssue?.key === key && activeIssue.id === id ? null : { key, id })}
      />
    );
  };

  /** The card of the open highlight, the edit/recheck status and badges. */
  const claimExtras = (review: ReviewState, key: string, text: string, disabled: boolean): ReactNode => {
    const field = review.claimReview?.[key];
    if (!field) return null;
    const status = recheckStatus[key];
    const issue = activeIssue?.key === key && isCurrent(field, text) ? field.issues.find((i) => i.id === activeIssue.id) : undefined;
    const allConfirmed = isCurrent(field, text) && field.issues.length > 0 && field.issues.every((i) => i.status === "confirmed");
    return (
      <>
        {editingField === key || allConfirmed || status ? (
          <div className="rm-claim-row">
            {allConfirmed ? <span className="rm-claim-badge rm-claim-badge--confirmed">{t("resumatch.claimReview.confirmedBadge")}</span> : null}
            {status?.text === text ? (
              <span className="rm-claim-status" role="status">
                {t(status.status === "checking" ? "resumatch.claimReview.checking" : "resumatch.claimReview.recheckFailed")}
              </span>
            ) : null}
            {editingField === key ? (
              <button type="button" className="rm-link-button" onClick={() => setEditingField(null)} disabled={disabled}>
                {t("resumatch.claimReview.action.done")}
              </button>
            ) : null}
          </div>
        ) : null}
        {issue ? (
          <ClaimCard
            key={`${key}:${issue.id}`}
            issue={issue}
            location={claimLocation(review, key)}
            where={claimWhere(review, key)}
            source={(id) => evidenceSource(review, id)}
            removal={removalFor(text, issue, field.field)}
            isBullet={field.field === "bullet"}
            onEdit={() => editClaim(key, issue)}
            onRemove={(next) => setClaimText(key, next)}
            onExclude={() => setStatus(key, issue.id, "excluded")}
            onConfirm={(detail) => setStatus(key, issue.id, "confirmed", detail)}
            onUndo={() => setStatus(key, issue.id, "open")}
            onClose={() => {
              setActiveIssue(null);
              requestAnimationFrame(() => document.getElementById(markId(key, issue.id))?.focus());
            }}
            disabled={disabled}
          />
        ) : null}
      </>
    );
  };

  const confirm = useCallback(
    async (review: ReviewState) => {
      setState({ kind: "confirming", review });
      const editOf = review.editOf;
      // The save closes this job's draft on the server: stop saving it
      // first, so a late draft save can't bring it back.
      await closeDraftLocally(review.targetJobId);
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
            approved: review.degraded ? null : approvedCvOf(review),
            // #932: which AI bullet each approved one started from, a reason
            // per change, and what the candidate chose to remember.
            ...(editOf
              ? {}
              : {
                  bulletOrigins: review.experience.map((entry) => approvedBulletOrigins(entry.bullets)),
                  feedbackReasons: review.feedbackReasons ?? {},
                  promotions: {
                    // Only the notes the candidate typed in: an untouched one
                    // must not overwrite a newer saved note after a conflict.
                    preference: preferencePromotionPayload(
                      review.preferenceDraft ?? null,
                      savedWriting?.revisionId ?? null,
                      Boolean(review.coverLetter?.include && !review.coverLetter.degraded),
                    ),
                    background: ownBulletChoices(review)
                      .filter((choice) => review.background?.[choice.key])
                      .map((choice) => ({
                        experienceIndex: choice.experienceIndex,
                        bulletIndex: choice.bulletIndex,
                        ...review.background![choice.key]!,
                      })),
                  },
                }),
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
                  // #964: claims the candidate confirmed, kept apart from
                  // what the profile backs, for this CV only.
                  // An in-place edit has no claim check: the server keeps
                  // the CV's own.
                  ...(editOf
                    ? {}
                    : {
                        confirmedClaims: confirmedClaimsOf(
                          review.claimReview,
                          (i) => review.experience[i],
                          (key) => savedClaimText(review, key),
                        ),
                      }),
                },
            coverLetter: approvedLetterOf(review),
          }),
        });
        const body = await readJsonBody(res);
        if (!res.ok || !body) {
          // Not saved: the draft is still this job's, keep saving it.
          closedDraftsRef.current.delete(review.targetJobId);
          const message =
            body?.error ?? `${t("resumatch.flow.error.save")} ${t("resumatch.flow.error.server", { status: res.status })}`;
          // Keep the review (and every hand edit) open so the candidate can
          // fix it or just press Save again: a refused or failed write hands
          // the preview back. Only a used-up preview (409) can't be retried.
          // A stale one (#928: the job text or note changed) can't be saved
          // either, but the review stays so its edits can still be copied
          // before "Back to options" runs it again.
          // #932: preferences saved elsewhere meanwhile: show the new ones.
          if (body?.code === "PREFERENCES_STALE" && body.current !== undefined) {
            setSavedWriting((body.current as WritingPreferencesView | null) ?? null);
          }
          if (res.status !== 409 || editOf || body?.code === "PREVIEW_CONTEXT_STALE") {
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
        const query = new URLSearchParams();
        if (body.coverLetterId) query.set("coverLetterId", body.coverLetterId);
        else if (body.coverLetterError) query.set("coverLetterFailed", "1");
        if (body.promotionFailed) query.set("rememberFailed", "1");
        const qs = query.toString();
        router.push(qs ? `/tailor/${body.id}/preview?${qs}` : `/tailor/${body.id}/preview`);
      } catch {
        closedDraftsRef.current.delete(review.targetJobId);
        setState({ kind: "reviewing", review, saveError: t("resumatch.flow.error.network") });
      }
    },
    [confirmedVersionId, router, savedWriting, t, closeDraftLocally],
  );

  /** A language's name for use inside a sentence, in the UI language. */
  const languageName = (code: OutputLanguage) => t(`resumatch.lang.${code}`);

  /** #932: a feedback key as the candidate sees it. */
  const feedbackLabel = (key: string): string => {
    const bullet = /^bullet:(\d+):(\d+)$/.exec(key);
    if (bullet && (state.kind === "reviewing" || state.kind === "confirming")) {
      const entry = state.review.experience[Number(bullet[1])];
      const role = entry ? (entry.employer ? `${entry.title} · ${entry.employer}` : entry.title) : "";
      return t("resumatch.feedback.label.bullet", { n: Number(bullet[2]) + 1, role });
    }
    const paragraph = /^letter\.paragraph:(\d+)$/.exec(key);
    if (paragraph) return t("resumatch.feedback.label.letterParagraph", { n: Number(paragraph[1]) + 1 });
    const labels: Record<string, string> = {
      headline: "resumatch.feedback.label.headline",
      summary: "resumatch.feedback.label.summary",
      skills: "resumatch.feedback.label.skills",
      letter: "resumatch.feedback.label.letter",
      "letter.greeting": "resumatch.feedback.label.letterGreeting",
      "letter.signOff": "resumatch.feedback.label.letterSignOff",
    };
    return labels[key] ? t(labels[key]) : key;
  };

  const activeJobId =
    state.kind === "fetched" || state.kind === "loading_review"
      ? state.targetJobId
      : state.kind === "reviewing" || state.kind === "confirming"
        ? state.review.targetJobId
        : state.kind === "error" && state.canGoBack
          ? (lastFetched?.targetJobId ?? null)
          : null;

  const busy = state.kind === "fetching" || state.kind === "loading_review" || state.kind === "confirming";

  // The draft body for where the flow is now: the options card, or the
  // review (with the options it was made with). Nothing while a request
  // runs, on an error, or when editing a saved CV.
  const draftJobId =
    !draftsEnabled
      ? null
      : state.kind === "fetched"
        ? state.targetJobId
        : state.kind === "reviewing" && !state.review.editOf
          ? state.review.targetJobId
          : null;
  const draftBody = draftJobId
    ? JSON.stringify({
        step: state.kind === "reviewing" ? "review" : "options",
        options: {
          cvLanguage,
          instructions,
          includeCoverLetter,
          coverLetterTone,
          coverLetterLength,
          coverLetterLanguage,
          savedNotesOff: notesOffFor === draftJobId,
          lowFitConfirmed: lowFitConfirmedFor === draftJobId,
          unmetRequirementIds: [],
        } satisfies DraftOptions,
        previewId: state.kind === "reviewing" ? state.review.previewId : null,
        review: state.kind === "reviewing" ? state.review : null,
      })
    : null;

  // A resumed draft is already saved as it opens: don't save it again
  // (and move it to the top of "Unfinished jobs") until something changes.
  const seededDraftRef = useRef(false);
  if (!seededDraftRef.current) {
    seededDraftRef.current = true;
    if (draft && !draft.reviewExpired && draftJobId === draft.targetJobId && draftBody) {
      lastSavedDraftRef.current.set(draftJobId, draftBody);
    }
  }

  useEffect(() => {
    if (!draftJobId || !draftBody) return;
    if (closedDraftsRef.current.has(draftJobId)) return;
    if (lastSavedDraftRef.current.get(draftJobId) === draftBody) return;
    pendingDraftRef.current = { targetJobId: draftJobId, body: draftBody };
    const timer = window.setTimeout(() => void flushDraft(), DRAFT_SAVE_DELAY_MS);
    return () => window.clearTimeout(timer);
  }, [draftJobId, draftBody, flushDraft]);

  // Leaving: the tab is hidden or closed, or the candidate navigates to
  // another page of the app (this component unmounts). The last change is
  // sent right away instead of waiting for the debounce.
  useEffect(() => {
    const onHidden = () => {
      if (document.visibilityState === "hidden") void flushDraft(true);
    };
    const onPageHide = () => void flushDraft(true);
    document.addEventListener("visibilitychange", onHidden);
    window.addEventListener("pagehide", onPageHide);
    return () => {
      document.removeEventListener("visibilitychange", onHidden);
      window.removeEventListener("pagehide", onPageHide);
      void flushDraft(true);
    };
  }, [flushDraft]);

  /** "Discard this job": the draft goes (the job row stays) and the flow
   *  starts empty. */
  const discardCurrent = useCallback(async () => {
    const targetJobId = draftJobId;
    if (!targetJobId) return;
    setDiscarding(true);
    await closeDraftLocally(targetJobId);
    try {
      const res = await fetch(`/api/tailor/drafts/${encodeURIComponent(targetJobId)}`, { method: "DELETE" });
      if (!res.ok) throw new Error(String(res.status));
    } catch {
      closedDraftsRef.current.delete(targetJobId);
      setDiscarding(false);
      setConfirmDiscard(false);
      setSaveStatus("failed");
      return;
    }
    setDiscarding(false);
    setConfirmDiscard(false);
    setDraftNote(null);
    setReviewExpired(false);
    setSaveStatus("idle");
    setLastFetched(null);
    setFitGate(null);
    setUrl("");
    setState({ kind: "idle" });
    window.history.replaceState(window.history.state, "", "/tailor?new=1");
    router.refresh();
  }, [draftJobId, closeDraftLocally, router]);

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
          <Button onClick={() => fetchJob()} disabled={!url.trim() || busy}>
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
          <JobFilesPicker
            files={uploadFiles}
            onChange={(files) => {
              setUploadFiles(files);
              // A changed list is a new attempt: drop marks for removed files.
              setUploadErrors((marks) => {
                const keep = new Set(files.map(fileKey));
                return Object.fromEntries(Object.entries(marks).filter(([key]) => keep.has(key)));
              });
            }}
            errors={uploadErrors}
            busy={busy}
            reading={state.kind === "fetching"}
            onSubmit={uploadJob}
          />
        </div>
      ) : (
        <div className="rm-intake-panel">
          <ManualJobForm busy={busy} onSubmit={submitManualJob} />
        </div>
      )}

      {draftJobId ? (
        <div className="rm-draft-bar" data-testid="draft-bar">
          <span role="status" data-testid="draft-status">
            {saveStatus === "saving"
              ? t("resumatch.flow.draft.saving")
              : saveStatus === "saved"
                ? t("resumatch.flow.draft.saved")
                : saveStatus === "failed"
                  ? t("resumatch.flow.draft.saveFailed")
                  : draftNote?.targetJobId === draftJobId
                    ? t(draftNote.kind === "reused" ? "resumatch.flow.reused" : "resumatch.flow.draft.resumed", { date: draftNote.date })
                    : null}
          </span>
          <span className="rm-draft-bar__actions">
            {draftNote?.kind === "reused" && draftNote.targetJobId === draftJobId && state.kind === "fetched" && url.trim() ? (
              <Button variant="ghost" size="sm" onClick={() => fetchJob(true)}>
                {t("resumatch.flow.fetchAgain")}
              </Button>
            ) : null}
            <Link href="/tailor?new=1" className="ui-btn ui-btn--ghost ui-btn--sm" data-testid="draft-start-new">
              {t("resumatch.flow.draft.startNew")}
            </Link>
            <Button variant="ghost" size="sm" onClick={() => setConfirmDiscard(true)} data-testid="draft-discard">
              {t("resumatch.flow.draft.discard")}
            </Button>
          </span>
        </div>
      ) : null}

      {reviewExpired && state.kind === "fetched" ? (
        <div style={{ marginTop: "0.75rem" }}>
          <Alert tone="info">{t("resumatch.flow.draft.reviewExpired")}</Alert>
        </div>
      ) : null}

      <ConfirmDialog
        open={confirmDiscard}
        title={t("resumatch.drafts.discardTitle")}
        message={t("resumatch.drafts.discardBody")}
        confirmLabel={t("resumatch.drafts.discard")}
        cancelLabel={t("resumatch.drafts.keep")}
        tone="danger"
        confirmDisabled={discarding}
        onConfirm={() => void discardCurrent()}
        onCancel={() => setConfirmDiscard(false)}
      />

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
            {state.sourceFiles && state.sourceFiles.length > 1 ? (
              <p className="rm-job-files__source" data-testid="job-source-files">
                {t("resumatch.flow.upload.readFrom", { count: String(state.sourceFiles.length), names: state.sourceFiles.join(", ") })}
              </p>
            ) : null}
            <p style={{ color: "var(--muted)", fontSize: "0.9rem" }}>{state.snippet}…</p>
            <FitAssessmentPanel
              key={`fit-${state.targetJobId}`}
              targetJobId={state.targetJobId}
              profileVersionId={confirmedVersionId}
              acknowledged={lowFitConfirmedFor === state.targetJobId}
              onAcknowledge={() => setLowFitConfirmedFor(state.targetJobId)}
              onDecline={() => {
                setFitGate(null);
                setLowFitConfirmedFor(null);
                setState({ kind: "idle" });
              }}
              onGateChange={(jobId, gate) => setFitGate(gate ? { targetJobId: jobId, lowFit: gate.lowFit } : null)}
              onEvidenceAdded={() => setEvidenceVersion((n) => n + 1)}
              refreshKey={`${evidenceVersion}:${evidenceUsedCount ?? "-"}:${evidenceRevisionsKey}`}
            />
            {fitGate?.targetJobId === state.targetJobId && fitGate.lowFit && lowFitConfirmedFor !== state.targetJobId ? null : (
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
              <WritingSource saved={savedPrefs?.cv.outputLanguage} value={cvLanguage} testId="writing-source-cv-language" />
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
            <EvidencePanel
              key={`${state.targetJobId}:${evidenceVersion}`}
              targetJobId={state.targetJobId}
              onUsedCountChange={setEvidenceUsedCount}
              onUsedRevisionsChange={setEvidenceRevisionsKey}
            />
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
                  <WritingSource saved={savedPrefs?.coverLetter.tone} value={coverLetterTone} testId="writing-source-tone" />
                </label>
                <label style={{ display: "flex", alignItems: "center", gap: "0.4rem", fontSize: "0.82rem" }}>
                  <span>{t("resumatch.flow.length")}</span>
                  <select className="ui-input ui-select" value={coverLetterLength} onChange={(e) => setCoverLetterLength(e.target.value as typeof coverLetterLength)}>
                    <option value="short">{t("resumatch.flow.length.short")}</option>
                    <option value="standard">{t("resumatch.flow.length.standard")}</option>
                    <option value="detailed">{t("resumatch.flow.length.detailed")}</option>
                  </select>
                  <WritingSource saved={savedPrefs?.coverLetter.length} value={coverLetterLength} testId="writing-source-length" />
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
                  <WritingSource saved={savedPrefs?.coverLetter.outputLanguage} value={coverLetterLanguage} testId="writing-source-letter-language" />
                </label>
              </div>
            ) : null}
            <WritingSettingsSummary
              saved={savedWriting}
              canRemember={!cardMatchesSaved}
              remembering={rememberBusy}
              onRemember={() => void rememberChoices()}
              useNotes={notesOffFor !== state.targetJobId}
              onUseNotesChange={(use) => setNotesOffFor(use ? null : state.targetJobId)}
              includeLetter={includeCoverLetter}
              note={writingNote}
            />
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
        <div className={`rm-review${onlyFlagged && state.review.claimReview ? " rm-review--only-flagged" : ""}`}>
          <Card title={t(state.review.editOf ? "resumatch.review.editTitle" : "resumatch.review.title")}>
            {state.review.editOf ? (
              <p className="rm-regen-note" role="status" data-testid="edit-note">
                {t("resumatch.review.editNote")}
              </p>
            ) : null}
            {state.review.degraded ? (
              <Alert tone="warning">
                {degradedMessage(t, "resumatch.review.degraded", state.review.degradedReason, state.review.budgetResetsOn, pageLocale)}
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

                {state.review.evidenceUsed ? (
                  <p className="rm-evidence__review-note" data-testid="evidence-review-note">
                    {t("resumatch.evidence.review.used", { count: state.review.evidenceUsed })}
                  </p>
                ) : null}

                {state.review.claimReview ? (
                  <ClaimSummaryBar
                    open={openCount(state.review.claimReview)}
                    gaps={openGapCount(state.review.gaps)}
                    onNext={() => reviewNext(state.review)}
                    onGaps={() => {
                      const el = document.getElementById("rm-claim-gaps");
                      el?.scrollIntoView({ block: "start", behavior: "smooth" });
                      el?.querySelector<HTMLButtonElement>("button")?.focus({ preventScroll: true });
                    }}
                    onlyFlagged={onlyFlagged}
                    onOnlyFlagged={setOnlyFlagged}
                  />
                ) : null}

                {!state.review.claimReview && state.review.flaggedClaims ? (
                  <p className="rm-claim-flag" data-testid="claims-flagged-note">
                    {t("resumatch.claims.flaggedNote", { count: state.review.flaggedClaims })}
                  </p>
                ) : null}

                {!state.review.claimReview && state.review.unbackedRequirements ? (
                  <p className="rm-evidence__review-note" data-testid="requirements-review-note">
                    {t("resumatch.requirements.reviewNote", { count: state.review.unbackedRequirements })}
                  </p>
                ) : null}

                {state.review.instructions ? (
                  <p style={{ color: "var(--muted)", fontSize: "0.82rem", fontStyle: "italic" }}>
                    {t("resumatch.review.steering", { note: state.review.instructions })}
                  </p>
                ) : null}
                {state.review.styleNotes === "saved" || state.review.styleNotes === "off" ? (
                  <p style={{ color: "var(--muted)", fontSize: "0.82rem" }} data-testid="writing-review-note">
                    {t(state.review.styleNotes === "saved" ? "resumatch.writing.review.notesUsed" : "resumatch.writing.review.notesOff")}
                  </p>
                ) : null}

                <div className="rm-review__section" data-review-item data-needs-review={needsReview(state.review, "headline") || undefined}>
                  <label htmlFor="rm-review-headline" className="rm-review__section-label">{t("resumatch.review.headline")}</label>
                  {claimView(state.review, "headline", state.review.headline) ?? (
                  <input
                    id="rm-review-headline"
                    type="text"
                    value={state.review.headline}
                    onChange={(e) => updateReview("headline", e.target.value)}
                    disabled={state.kind === "confirming"}
                    aria-describedby={!state.review.claimReview && state.review.headlineFlags?.length ? "rm-review-headline-flag" : undefined}
                  />
                  )}
                  {claimExtras(state.review, "headline", state.review.headline, state.kind === "confirming")}
                  {!state.review.claimReview && state.review.headlineFlags?.length ? (
                    <p id="rm-review-headline-flag" className="rm-claim-flag">
                      {t("resumatch.claims.fieldFlag")}
                    </p>
                  ) : null}
                </div>

                <div className="rm-review__section" data-review-item data-needs-review={needsReview(state.review, "summary") || undefined}>
                  <label htmlFor="rm-review-summary" className="rm-review__section-label">{t("resumatch.review.summary")}</label>
                  {claimView(state.review, "summary", state.review.summary) ?? (
                  <textarea className="ui-input"
                    id="rm-review-summary"
                    rows={4}
                    value={state.review.summary}
                    onChange={(e) => updateReview("summary", e.target.value)}
                    disabled={state.kind === "confirming"}
                    aria-describedby={!state.review.claimReview && state.review.summaryFlags?.length ? "rm-review-summary-help rm-review-summary-flag" : "rm-review-summary-help"}
                    maxLength={2000}
                  />
                  )}
                  {claimExtras(state.review, "summary", state.review.summary, state.kind === "confirming")}
                  {!state.review.claimReview && state.review.summaryFlags?.length ? (
                    <p id="rm-review-summary-flag" className="rm-claim-flag">
                      {t("resumatch.claims.fieldFlag")}
                    </p>
                  ) : null}
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

                <div data-review-item>
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
                </div>

                {state.review.experience.length > 0 ? (
                  <div className="rm-review__section">
                    <span className="rm-review__section-label">{t("resumatch.review.experience")}</span>
                    {state.review.experience.map((entry, entryIndex) => (
                      <div
                        className="rm-entry"
                        key={entryIndex}
                        data-review-item
                        data-needs-review={entry.bullets.some((b) => needsReview(state.review, b.key)) || undefined}
                      >
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
                          onChange={(key, patch) => changeBullet(entryIndex, key, patch)}
                          onAdd={() => addBullet(entryIndex)}
                          disabled={state.kind === "confirming"}
                          {...(state.review.claimReview
                            ? {
                                claimView: (bullet: ReviewBullet) => claimView(state.review, bullet.key, bullet.text),
                                claimExtras: (bullet: ReviewBullet) => claimExtras(state.review, bullet.key, bullet.text, state.kind === "confirming"),
                                needsReview: (key: string) => needsReview(state.review, key),
                              }
                            : {})}
                        />
                      </div>
                    ))}
                  </div>
                ) : null}

                {state.review.gaps && state.review.gaps.length > 0 ? (
                  <RequirementGaps
                    gaps={state.review.gaps}
                    roles={state.review.experience.map((entry, index) => ({
                      index,
                      label: entry.employer ? `${entry.title} · ${entry.employer}` : entry.title,
                    }))}
                    onDecide={(requirementId, decision) =>
                      mutateReview((review) => ({
                        ...review,
                        gaps: (review.gaps ?? []).map((g) => (g.requirementId === requirementId ? { ...g, decision } : g)),
                      }))
                    }
                    onAdd={addGapBullet}
                    disabled={state.kind === "confirming"}
                  />
                ) : null}
              </>
            )}

            {state.review.coverLetter ? (
              <div className="rm-review__section" data-review-item>
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
                    {degradedMessage(
                      t,
                      "resumatch.review.cl.degraded",
                      state.review.coverLetter.degradedReason,
                      state.review.budgetResetsOn,
                      pageLocale,
                    )}
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

            {!state.review.editOf && state.review.original ? (
              <FeedbackPanel
                items={feedbackOf(state.review)}
                labelFor={feedbackLabel}
                reasons={state.review.feedbackReasons ?? {}}
                onReasonChange={(key, reason) => {
                  const next = { ...(state.review.feedbackReasons ?? {}) };
                  if (reason) next[key] = reason;
                  else delete next[key];
                  updateReview("feedbackReasons", next);
                }}
                ownBullets={ownBulletChoices(state.review)}
                background={state.review.background ?? {}}
                onBackgroundChange={(key, draft) => {
                  const next = { ...(state.review.background ?? {}) };
                  if (draft) next[key] = draft;
                  else delete next[key];
                  updateReview("background", next);
                }}
                preference={state.review.preferenceDraft ?? null}
                onPreferenceChange={(draft) => updateReview("preferenceDraft", draft)}
                savedNotes={{
                  cv: savedWriting?.preferences.cv.styleNote ?? null,
                  letter: savedWriting?.preferences.coverLetter.styleNote ?? null,
                }}
                includeLetter={Boolean(state.review.coverLetter?.include && !state.review.coverLetter.degraded)}
                disabled={state.kind === "confirming"}
              />
            ) : null}

            {!state.review.editOf && state.review.claimReview ? (
              <SaveImpact
                items={saveImpactOf(
                  state.review,
                  (key) => claimLocation(state.review, key),
                  // German keeps its capital nouns.
                  (key) => (pageLocale.startsWith("de") ? t(`resumatch.claimReview.location.${key}`) : t(`resumatch.claimReview.location.${key}`).toLowerCase()),
                )}
                confirmed={Object.values(state.review.claimReview).reduce((n, f) => n + f.issues.filter((i) => i.status === "confirmed").length, 0)}
                onJump={(id) => {
                  const target = openIssueOrder(state.review).find((o) => markId(o.key, o.id) === id);
                  if (target) focusIssue(target);
                  else document.getElementById(id)?.scrollIntoView({ block: "center", behavior: "smooth" });
                }}
              />
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
