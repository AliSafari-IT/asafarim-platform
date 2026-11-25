import { PROFESSIONAL_EVIDENCE_KINDS, parseEvidenceInput, type EvidenceInput, type EvidenceInputError, type EvidenceKind, type ExperienceRef } from "../evidence/contract";
import {
  parseWritingPreferences,
  type WritingPreferences,
  type WritingPreferencesError,
} from "../writingPreferences/contract";

/**
 * The explicit scope actions on the Tailor review (#932). By default every
 * change applies to this application only. Two other actions exist, each
 * one a separate, visible choice the candidate reviews before saving:
 *
 * - "Remember as my writing preference": a new style note for the CV or
 *   the letter, written by the candidate (never inferred from an edit),
 *   saved as a new writing-preference revision on top of the one they saw.
 * - "Update my confirmed background": a bullet the candidate wrote or
 *   rewrote, saved as a confirmed background evidence item for that role.
 *
 * Both run once, with the save, after the CV is stored: the preview can
 * back one save only, so a repeated or retried save cannot promote twice.
 */

export const MAX_BACKGROUND_PROMOTIONS = 3;

export interface PreferencePromotion {
  /** The revision the candidate saw (null: none saved). */
  baseRevisionId: string | null;
  /** undefined: leave that note as it is. null: clear it. */
  cvStyleNote?: string | null;
  letterStyleNote?: string | null;
}

export interface BackgroundPromotion {
  /** The role, by index in the profile's experience. */
  experienceIndex: number;
  /** The approved bullet it came from, by index in that role's approved list. */
  bulletIndex: number;
  kind: EvidenceKind;
  title: string;
  detail: string;
}

export interface PromotionRequest {
  preference: PreferencePromotion | null;
  background: BackgroundPromotion[];
}

export type PromotionError =
  | { code: "invalid" }
  | { code: "too_many_background" }
  | { code: "background_target" }
  | { code: "background_input"; field: EvidenceInputError }
  | { code: "preference_input"; field: WritingPreferencesError };

const noteValue = (value: unknown): string | null | undefined | "invalid" => {
  if (value === undefined) return undefined;
  if (value === null) return null;
  return typeof value === "string" ? value : "invalid";
};

/** Shape check only. Targets and content are checked by `resolvePromotions`. */
export function parsePromotionRequest(raw: unknown): { ok: true; value: PromotionRequest } | { ok: false; error: PromotionError } {
  if (raw === undefined || raw === null) return { ok: true, value: { preference: null, background: [] } };
  if (typeof raw !== "object" || Array.isArray(raw)) return { ok: false, error: { code: "invalid" } };
  const body = raw as Record<string, unknown>;

  let preference: PreferencePromotion | null = null;
  if (body.preference !== undefined && body.preference !== null) {
    const p = body.preference as Record<string, unknown>;
    if (typeof p !== "object" || Array.isArray(p)) return { ok: false, error: { code: "invalid" } };
    if (p.baseRevisionId !== null && typeof p.baseRevisionId !== "string") return { ok: false, error: { code: "invalid" } };
    const cv = noteValue(p.cvStyleNote);
    const letter = noteValue(p.letterStyleNote);
    if (cv === "invalid" || letter === "invalid") return { ok: false, error: { code: "invalid" } };
    if (cv !== undefined || letter !== undefined) {
      preference = {
        baseRevisionId: (p.baseRevisionId as string | null) ?? null,
        ...(cv !== undefined ? { cvStyleNote: cv } : {}),
        ...(letter !== undefined ? { letterStyleNote: letter } : {}),
      };
    }
  }

  const list = body.background === undefined || body.background === null ? [] : body.background;
  if (!Array.isArray(list)) return { ok: false, error: { code: "invalid" } };
  if (list.length > MAX_BACKGROUND_PROMOTIONS) return { ok: false, error: { code: "too_many_background" } };
  const background: BackgroundPromotion[] = [];
  const seen = new Set<string>();
  for (const entry of list) {
    if (!entry || typeof entry !== "object") return { ok: false, error: { code: "invalid" } };
    const e = entry as Record<string, unknown>;
    if (!Number.isInteger(e.experienceIndex) || !Number.isInteger(e.bulletIndex)) return { ok: false, error: { code: "invalid" } };
    const target = `${e.experienceIndex}:${e.bulletIndex}`;
    if (seen.has(target)) return { ok: false, error: { code: "background_target" } };
    seen.add(target);
    background.push({
      experienceIndex: e.experienceIndex as number,
      bulletIndex: e.bulletIndex as number,
      kind: e.kind as EvidenceKind,
      title: typeof e.title === "string" ? e.title : "",
      detail: typeof e.detail === "string" ? e.detail : "",
    });
  }
  return { ok: true, value: { preference, background } };
}

export interface ResolvedBackground {
  experienceIndex: number;
  bulletIndex: number;
  /** The feedback key of the AI bullet it rewrote, or null for the
   *  candidate's own bullet. */
  feedbackKey: string | null;
  input: EvidenceInput;
}

export interface ResolvedPromotions {
  /** The full preferences to save, or null for no change. */
  preference: { prefs: WritingPreferences; baseRevisionId: string | null } | null;
  background: ResolvedBackground[];
}

/**
 * Checks each requested promotion against the server's own records: the
 * bullet must be one the candidate approved and wrote or rewrote (an AI
 * bullet kept as written is the model's text, not a fact they confirmed),
 * and the content must pass the same checks as the evidence and
 * writing-preference forms.
 */
export function resolvePromotions(input: {
  request: PromotionRequest;
  roles: ExperienceRef[];
  approvedBullets: string[][];
  /** Aligned with `approvedBullets`, already cleaned (see feedback.ts). */
  bulletOrigins: (number | null)[][];
  originalBullets: string[][];
  savedPreferences: WritingPreferences;
}): { ok: true; value: ResolvedPromotions } | { ok: false; error: PromotionError } {
  const background: ResolvedBackground[] = [];
  for (const entry of input.request.background) {
    const role = input.roles[entry.experienceIndex];
    const bullet = input.approvedBullets[entry.experienceIndex]?.[entry.bulletIndex];
    if (!role || bullet === undefined) return { ok: false, error: { code: "background_target" } };
    const origin = input.bulletOrigins[entry.experienceIndex]?.[entry.bulletIndex] ?? null;
    const aiText = origin === null ? null : (input.originalBullets[entry.experienceIndex]?.[origin] ?? null);
    if (aiText !== null && aiText.replace(/\s+/g, " ").trim() === bullet.replace(/\s+/g, " ").trim()) {
      return { ok: false, error: { code: "background_target" } };
    }
    if (!PROFESSIONAL_EVIDENCE_KINDS.includes(entry.kind)) return { ok: false, error: { code: "background_input", field: "kind" } };
    const parsed = parseEvidenceInput({ kind: entry.kind, title: entry.title, detail: entry.detail, experienceRef: role });
    if (!parsed.ok) return { ok: false, error: { code: "background_input", field: parsed.error } };
    background.push({
      experienceIndex: entry.experienceIndex,
      bulletIndex: entry.bulletIndex,
      feedbackKey: origin === null ? null : `bullet:${entry.experienceIndex}:${origin}`,
      input: parsed.value,
    });
  }

  let preference: ResolvedPromotions["preference"] = null;
  const p = input.request.preference;
  if (p) {
    const saved = input.savedPreferences;
    const next = {
      cv: { ...saved.cv, ...(p.cvStyleNote !== undefined ? { styleNote: p.cvStyleNote } : {}) },
      coverLetter: { ...saved.coverLetter, ...(p.letterStyleNote !== undefined ? { styleNote: p.letterStyleNote } : {}) },
    };
    const parsed = parseWritingPreferences(next);
    if (!parsed.ok) return { ok: false, error: { code: "preference_input", field: parsed.error } };
    preference = { prefs: parsed.value, baseRevisionId: p.baseRevisionId };
  }
  return { ok: true, value: { preference, background } };
}

/** What happened to each promotion, stored on the feedback row. Ids and
 *  outcomes only: the text lives in the evidence item or preference
 *  revision it created. */
export interface PromotionOutcome {
  preference: { status: "saved" | "unchanged" | "stale" | "failed"; revisionNumber: number | null } | null;
  background: {
    experienceIndex: number;
    bulletIndex: number;
    feedbackKey: string | null;
    status: "saved" | "too_many" | "failed";
    evidenceId: string | null;
    revisionId: string | null;
  }[];
}

export function promotionFailed(outcome: PromotionOutcome): boolean {
  return (
    (outcome.preference !== null && (outcome.preference.status === "stale" || outcome.preference.status === "failed")) ||
    outcome.background.some((b) => b.status !== "saved")
  );
}

/**
 * What the review sends for "Remember as my writing preference": only the
 * notes the candidate actually typed in, on top of the revision they now
 * see. A note they never touched is left out, so after a stale-save
 * conflict it cannot overwrite a newer saved note. Null: nothing to send.
 */
export function preferencePromotionPayload(
  draft: { cvStyleNote: string; letterStyleNote: string; touched?: { cv?: boolean; letter?: boolean } } | null,
  baseRevisionId: string | null,
  includeLetter: boolean,
): PreferencePromotion | null {
  if (!draft) return null;
  const cv = draft.touched?.cv === true;
  const letter = draft.touched?.letter === true && includeLetter;
  if (!cv && !letter) return null;
  return {
    baseRevisionId,
    ...(cv ? { cvStyleNote: draft.cvStyleNote.trim() || null } : {}),
    ...(letter ? { letterStyleNote: draft.letterStyleNote.trim() || null } : {}),
  };
}

/** A short title for a bullet the candidate adds to their background: its
 *  first words, cut at a word boundary. The candidate sees and can change it. */
export function suggestEvidenceTitle(text: string, max = 60): string {
  const clean = text.replace(/\s+/g, " ").trim().replace(/[.;:,]+$/, "");
  if (clean.length <= max) return clean;
  const cut = clean.slice(0, max);
  const space = cut.lastIndexOf(" ");
  return `${(space > 20 ? cut.slice(0, space) : cut).replace(/[.;:,]+$/, "")}…`;
}
