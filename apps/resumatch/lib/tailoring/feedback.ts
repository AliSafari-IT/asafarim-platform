import { orderProfileSkills } from "./reviewEdits";

/**
 * Review feedback (#932): what the candidate did with each AI suggestion on
 * the Tailor review, derived from the original suggestions and what they
 * approved.
 *
 * - The original suggestions are the server's own copy (stored on the
 *   preview by generate-preview), never the client's. A decision is
 *   *derived* here, not taken from the client: the client only says which
 *   original bullet or paragraph each approved one started from
 *   (`origins`), and a wrong claim can only mislabel an edit, never change
 *   what the CV says or promote anything.
 * - One item per suggested field: the headline, the summary, the skill
 *   order, every AI bullet, and the letter's greeting, paragraphs and
 *   sign-off. A letter left out of the save is one "rejected" item for the
 *   whole section.
 * - An optional reason code per edited or rejected item, from a closed
 *   list. No free text: a reason is a category, not another copy of CV
 *   content.
 * - The scope is "application" unless the candidate explicitly added an
 *   edited bullet to their confirmed background on the same save. Nothing
 *   is inferred: saving is not consent to remember an edit.
 *
 * Pure and client-safe: the review panel shows the same items the server
 * will store.
 */

export const FEEDBACK_VERSION = "tailoring_feedback@1";

export const FEEDBACK_REASONS = ["inaccurate", "not_relevant", "too_generic", "wording", "too_long", "other"] as const;
export type FeedbackReason = (typeof FEEDBACK_REASONS)[number];

export type FeedbackDecision = "accepted" | "edited" | "rejected";
export type FeedbackScope = "application" | "background";

export interface FeedbackItem {
  /** "headline" | "summary" | "skills" | "bullet:<role>:<n>" | "letter" |
   *  "letter.greeting" | "letter.paragraph:<n>" | "letter.signOff". `<n>`
   *  indexes the original suggestion, so the key names it exactly. */
  key: string;
  decision: FeedbackDecision;
  /** Edited only: the text that was saved instead. */
  final?: string;
  reason?: FeedbackReason;
  scope: FeedbackScope;
}

export interface OriginalCvSuggestions {
  headline: string | null;
  summary: string | null;
  skillsOrder: string[];
  experienceBullets: string[][];
}

export interface OriginalLetterSuggestion {
  greeting: string;
  paragraphs: string[];
  signOff: string;
}

export interface OriginalSuggestions {
  cv: OriginalCvSuggestions | null;
  coverLetter: OriginalLetterSuggestion | null;
}

export interface ApprovedCv {
  headline: string | null;
  summary: string | null;
  skillsOrder: string[];
  experienceBullets: string[][];
}

export interface FeedbackInput {
  original: OriginalSuggestions;
  /** The profile's own values: an AI field replaced by the profile's is
   *  rejected, not edited. */
  profile: { headline: string | null; summary: string | null; skills: string[]; roles: number };
  /** null: nothing from the CV suggestions was kept. */
  approved: ApprovedCv | null;
  /** Aligned with `approved.experienceBullets`: the index of the original
   *  AI bullet each one started from, or null for the candidate's own. */
  bulletOrigins?: (number | null)[][];
  letter: {
    /** The letter is saved with this CV. */
    included: boolean;
    approved: OriginalLetterSuggestion | null;
    /** Aligned with `approved.paragraphs`. */
    paragraphOrigins?: (number | null)[];
  };
  reasons?: Record<string, unknown>;
  /** Keys of edited bullets the candidate added to their background. */
  backgroundKeys?: ReadonlySet<string>;
}

const norm = (value: string | null | undefined) => (value ?? "").replace(/\s+/g, " ").trim();

function decide(original: string, final: string | null | undefined, fallback: string | null): Pick<FeedbackItem, "decision" | "final"> {
  const saved = norm(final);
  if (saved === norm(original)) return { decision: "accepted" };
  if (!saved || (fallback !== null && saved === norm(fallback))) return { decision: "rejected" };
  return { decision: "edited", final: saved };
}

/** Each origin used at most once and inside the original list; anything
 *  else reads as the candidate's own text. */
function cleanOrigins(origins: unknown, approvedCount: number, originalCount: number): (number | null)[] {
  const list = Array.isArray(origins) ? origins : [];
  const used = new Set<number>();
  return Array.from({ length: approvedCount }, (_, i) => {
    const value = list[i];
    if (typeof value !== "number" || !Number.isInteger(value) || value < 0 || value >= originalCount || used.has(value)) return null;
    used.add(value);
    return value;
  });
}

export function isFeedbackReason(value: unknown): value is FeedbackReason {
  return typeof value === "string" && (FEEDBACK_REASONS as readonly string[]).includes(value);
}

export function bulletKey(role: number, index: number): string {
  return `bullet:${role}:${index}`;
}

export function deriveFeedback(input: FeedbackInput): FeedbackItem[] {
  const items: Omit<FeedbackItem, "scope">[] = [];
  const cv = input.original.cv;
  const approved = input.approved ?? { headline: null, summary: null, skillsOrder: [], experienceBullets: [] };

  if (cv) {
    if (norm(cv.headline)) items.push({ key: "headline", ...decide(cv.headline!, approved.headline, input.profile.headline) });
    if (norm(cv.summary)) items.push({ key: "summary", ...decide(cv.summary!, approved.summary, input.profile.summary) });

    // A proposed order that changes nothing was not a suggestion.
    const suggested = orderProfileSkills(cv.skillsOrder, input.profile.skills);
    if (cv.skillsOrder.length > 0 && suggested.join("\n") !== input.profile.skills.join("\n")) {
      const kept = approved.skillsOrder.length > 0 ? orderProfileSkills(approved.skillsOrder, input.profile.skills) : null;
      items.push(
        !kept || kept.join("\n") === input.profile.skills.join("\n")
          ? { key: "skills", decision: "rejected" }
          : kept.join("\n") === suggested.join("\n")
            ? { key: "skills", decision: "accepted" }
            : { key: "skills", decision: "edited", final: kept.join(", ") },
      );
    }

    cv.experienceBullets.slice(0, input.profile.roles).forEach((originalBullets, role) => {
      const approvedBullets = approved.experienceBullets[role] ?? [];
      const origins = cleanOrigins(input.bulletOrigins?.[role], approvedBullets.length, originalBullets.length);
      originalBullets.forEach((text, index) => {
        if (!norm(text)) return;
        const at = origins.indexOf(index);
        items.push({ key: bulletKey(role, index), ...decide(text, at === -1 ? null : approvedBullets[at], null) });
      });
    });
  }

  const letter = input.original.coverLetter;
  if (letter) {
    if (!input.letter.included || !input.letter.approved) {
      items.push({ key: "letter", decision: "rejected" });
    } else {
      const saved = input.letter.approved;
      items.push({ key: "letter.greeting", ...decide(letter.greeting, saved.greeting, null) });
      const origins = input.letter.paragraphOrigins
        ? cleanOrigins(input.letter.paragraphOrigins, saved.paragraphs.length, letter.paragraphs.length)
        : saved.paragraphs.map((_, i) => (i < letter.paragraphs.length ? i : null));
      letter.paragraphs.forEach((text, index) => {
        const at = origins.indexOf(index);
        items.push({ key: `letter.paragraph:${index}`, ...decide(text, at === -1 ? null : saved.paragraphs[at], null) });
      });
      items.push({ key: "letter.signOff", ...decide(letter.signOff, saved.signOff, null) });
    }
  }

  const reasons = input.reasons ?? {};
  return items.map((item) => {
    const reason = item.decision !== "accepted" ? reasons[item.key] : undefined;
    const background = item.decision === "edited" && item.key.startsWith("bullet:") && input.backgroundKeys?.has(item.key);
    return {
      ...item,
      ...(isFeedbackReason(reason) ? { reason } : {}),
      scope: background ? "background" : "application",
    };
  });
}

export interface FeedbackCounts {
  accepted: number;
  edited: number;
  rejected: number;
}

export function countFeedback(items: FeedbackItem[]): FeedbackCounts {
  return {
    accepted: items.filter((i) => i.decision === "accepted").length,
    edited: items.filter((i) => i.decision === "edited").length,
    rejected: items.filter((i) => i.decision === "rejected").length,
  };
}

/** The original text a key names, or null when it names none. */
export function originalText(original: OriginalSuggestions, key: string): string | null {
  const cv = original.cv;
  const letter = original.coverLetter;
  if (key === "headline") return cv?.headline ?? null;
  if (key === "summary") return cv?.summary ?? null;
  if (key === "skills") return cv ? cv.skillsOrder.join(", ") : null;
  const bullet = /^bullet:(\d+):(\d+)$/.exec(key);
  if (bullet) return cv?.experienceBullets[Number(bullet[1])]?.[Number(bullet[2])] ?? null;
  if (key === "letter.greeting") return letter?.greeting ?? null;
  if (key === "letter.signOff") return letter?.signOff ?? null;
  const paragraph = /^letter\.paragraph:(\d+)$/.exec(key);
  if (paragraph) return letter?.paragraphs[Number(paragraph[1])] ?? null;
  if (key === "letter" && letter) return [letter.greeting, ...letter.paragraphs, letter.signOff].join("\n\n");
  return null;
}

export interface ReconstructedItem extends FeedbackItem {
  /** What the AI suggested. */
  original: string | null;
  /** What the saved CV or letter holds for this field: the original when
   *  accepted, the edit when edited, nothing when rejected. */
  saved: string | null;
}

/** Each decision next to the suggestion it was about (#932): enough to
 *  tell, from the stored records alone, which suggestion was accepted,
 *  how one was edited and which section was rejected. */
export function reconstructFeedback(original: OriginalSuggestions, items: FeedbackItem[]): ReconstructedItem[] {
  return items.map((item) => {
    const text = originalText(original, item.key);
    return {
      ...item,
      original: text,
      saved: item.decision === "accepted" ? text : item.decision === "edited" ? (item.final ?? null) : null,
    };
  });
}

/** Lenient read of stored original suggestions. */
export function readOriginalSuggestions(stored: unknown): OriginalSuggestions {
  const raw = (stored && typeof stored === "object" ? stored : {}) as Record<string, unknown>;
  const strings = (value: unknown) => (Array.isArray(value) ? value.filter((v): v is string => typeof v === "string") : []);
  const text = (value: unknown) => (typeof value === "string" ? value : null);
  const cvRaw = raw.cv && typeof raw.cv === "object" ? (raw.cv as Record<string, unknown>) : null;
  const letterRaw = raw.coverLetter && typeof raw.coverLetter === "object" ? (raw.coverLetter as Record<string, unknown>) : null;
  return {
    cv: cvRaw
      ? {
          headline: text(cvRaw.headline),
          summary: text(cvRaw.summary),
          skillsOrder: strings(cvRaw.skillsOrder),
          experienceBullets: Array.isArray(cvRaw.experienceBullets) ? cvRaw.experienceBullets.map(strings) : [],
        }
      : null,
    coverLetter: letterRaw
      ? { greeting: text(letterRaw.greeting) ?? "", paragraphs: strings(letterRaw.paragraphs), signOff: text(letterRaw.signOff) ?? "" }
      : null,
  };
}

/** Lenient read of stored decisions. */
export function readFeedbackItems(stored: unknown): FeedbackItem[] {
  if (!Array.isArray(stored)) return [];
  return stored.flatMap((entry): FeedbackItem[] => {
    if (!entry || typeof entry !== "object") return [];
    const raw = entry as Record<string, unknown>;
    if (typeof raw.key !== "string") return [];
    if (raw.decision !== "accepted" && raw.decision !== "edited" && raw.decision !== "rejected") return [];
    return [
      {
        key: raw.key,
        decision: raw.decision,
        ...(typeof raw.final === "string" ? { final: raw.final } : {}),
        ...(isFeedbackReason(raw.reason) ? { reason: raw.reason } : {}),
        scope: raw.scope === "background" ? "background" : "application",
      },
    ];
  });
}
