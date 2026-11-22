import { readStoredCandidateEdits, ownBulletsByRole, type CandidateEdits } from "./candidateEdits";
import { orderProfileSkills, seedSkillEdits } from "./reviewEdits";
import { isOutputLanguage, type OutputLanguage } from "./language";

/**
 * "Edit" on a saved tailored CV (0.5.0): reopen the "Review before saving"
 * step exactly as it was saved, with the headline, summary, skills, bullets
 * and cover letter filled in, and no AI call.
 *
 * Saving an edit updates that CV (and its letter) in place; it never makes
 * a new one. "Regenerate" (lib/tailoring/regenerate.ts) is the way to get a
 * fresh AI run saved as a new CV. Every fact is still copied from the
 * profile version the CV was made from, by the same merge as a first save
 * (`mergeTailoringSuggestions`), so an edit can change wording, the skill
 * selection and the candidate's own bullets, never an employer or a date.
 *
 * Everything here is computed from the stored rows; nothing is guessed. A
 * saved bullet is the candidate's own when the stored hand edits say so;
 * the rest were the AI's (or the profile's own role summary).
 */

export interface SavedReviewBullet {
  text: string;
  /** The AI's wording, or the profile's role summary; null when the
   *  candidate wrote it (or rewrote it) themselves. */
  aiText: string | null;
  fromProfile: boolean;
}

export interface SavedReviewSeed {
  resumeId: string;
  coverLetterId: string | null;
  job: { targetJobId: string; title: string | null; employer: string | null; snippet: string };
  outputLanguage: OutputLanguage | null;
  instructions: string | null;
  headline: string;
  summary: string;
  /** The summary the review started with (the AI's, or the profile's
   *  when the AI wrote none), when the saved one is still that; null when
   *  the saved summary is the candidate's own. */
  aiSummary: string | null;
  profileSummary: string | null;
  profileFullName: string | null;
  originalSkillsOrder: string[];
  suggestedSkillsOrder: string[];
  keepOriginalSkillOrder: boolean;
  addedSkills: string[];
  removedSkills: string[];
  experience: {
    title: string;
    employer: string | null;
    startedOn: string | null;
    endedOn: string | null;
    isCurrent: boolean;
    originalSummary: string | null;
    bullets: SavedReviewBullet[];
  }[];
  coverLetter: {
    greeting: string;
    paragraphs: string[];
    signOff: string;
    outputLanguage: OutputLanguage | null;
  } | null;
}

interface ProfileLike {
  fullName?: string | null;
  headline?: string | null;
  summary?: string | null;
  skills?: { name: string }[];
  experience?: {
    title: string;
    employer?: string | null;
    startedOn?: string | null;
    endedOn?: string | null;
    isCurrent?: boolean;
    summary?: string | null;
  }[];
}

interface ContentLike {
  headline: string | null;
  summary: string | null;
  skills: string[];
  experience: { bullets: string[] }[];
}

export interface EditSourceRow {
  id: string;
  instructions: string | null;
  outputLanguage: string | null;
  content: ContentLike;
  candidateEdits?: unknown;
  profileContent: ProfileLike;
  targetJob: { id: string; title: string | null; employer: string | null; rawText: string | null };
  coverLetter: {
    id: string;
    outputLanguage: string | null;
    content: { greeting: string; paragraphs: string[]; signOff: string };
  } | null;
}

/** Same length as every intake route's `snippet`. */
const SNIPPET_CHARS = 400;

const same = (a: string | null | undefined, b: string | null | undefined) => (a ?? "").trim() === (b ?? "").trim();

export function buildSavedReviewSeed(row: EditSourceRow): SavedReviewSeed {
  const edits: CandidateEdits = readStoredCandidateEdits(row.candidateEdits);
  const profile = row.profileContent;
  const profileSkills = (profile.skills ?? []).map((skill) => skill.name);
  const roles = (profile.experience ?? []).map((entry) => ({
    title: entry.title,
    employer: entry.employer ?? null,
    startedOn: entry.startedOn ?? null,
    endedOn: entry.endedOn ?? null,
    isCurrent: entry.isCurrent ?? false,
    summary: entry.summary ?? null,
  }));

  // The saved list holds the profile's skills in the chosen order, minus
  // the removed ones, plus the added ones. Taking the profile's skills out
  // of it in that order gives back the order the review showed; the
  // removed ones follow at the end, shown as removed.
  const skillEdits = seedSkillEdits(edits, profileSkills);
  const suggestedSkillsOrder = orderProfileSkills(row.content.skills, profileSkills);
  const keepOriginalSkillOrder = suggestedSkillsOrder.join("\u0000") === profileSkills.join("\u0000");

  const own = ownBulletsByRole(edits, roles);
  const experience = roles.map((role, index) => {
    const ownSet = new Set((own[index] ?? []).map((text) => text.trim()));
    const saved = row.content.experience[index]?.bullets ?? [];
    return {
      title: role.title,
      employer: role.employer,
      startedOn: role.startedOn,
      endedOn: role.endedOn,
      isCurrent: role.isCurrent,
      originalSummary: role.summary,
      bullets: saved.map((text): SavedReviewBullet => {
        if (ownSet.has(text.trim())) return { text, aiText: null, fromProfile: false };
        const fromProfile = Boolean(role.summary?.trim()) && same(text, role.summary);
        return { text, aiText: text, fromProfile };
      }),
    };
  });

  const summary = row.content.summary ?? "";
  // The stored own summary is the candidate's; anything else was the
  // AI's, or the profile's own filled in because the AI wrote none.
  const ownSummary = Boolean(edits.ownSummary) && same(edits.ownSummary, summary);

  const letter = row.coverLetter;
  return {
    resumeId: row.id,
    coverLetterId: letter?.id ?? null,
    job: {
      targetJobId: row.targetJob.id,
      title: row.targetJob.title,
      employer: row.targetJob.employer,
      snippet: (row.targetJob.rawText ?? "").slice(0, SNIPPET_CHARS),
    },
    outputLanguage: isOutputLanguage(row.outputLanguage) ? row.outputLanguage : null,
    instructions: row.instructions,
    headline: row.content.headline ?? "",
    summary,
    aiSummary: ownSummary ? null : summary,
    profileSummary: profile.summary ?? null,
    profileFullName: profile.fullName ?? null,
    originalSkillsOrder: profileSkills,
    suggestedSkillsOrder,
    keepOriginalSkillOrder,
    ...skillEdits,
    experience,
    coverLetter: letter
      ? {
          greeting: letter.content.greeting,
          paragraphs: letter.content.paragraphs,
          signOff: letter.content.signOff,
          outputLanguage: isOutputLanguage(letter.outputLanguage) ? letter.outputLanguage : null,
        }
      : null,
  };
}

/** The summary to keep as the candidate's own: what they typed, rewrote or
 *  took from their profile instead of the AI's. Null when it is the AI's
 *  (or empty, which saves the profile's summary). */
export function ownSummaryOf(summary: string, aiSummary: string | null): string | null {
  const text = summary.trim();
  if (!text) return null;
  if (aiSummary !== null && text === aiSummary.trim()) return null;
  return text;
}
