import type { CandidateProfileContent, ExperienceEntry } from "../profile/contract";

/**
 * Background evidence (#929): projects, achievements and responsibilities a
 * candidate types in for one application or for every application, plus
 * their motivation for a job. Pure rules only; the database side is
 * `store.ts`, the prompt side `prompt.ts`.
 *
 * - Professional kinds are facts the candidate confirmed. They can support
 *   CV and letter wording; they never add a skill (the confirmed profile
 *   merge still owns the skill list) and never change an employer, title,
 *   date, degree or certification.
 * - MOTIVATION is the candidate's reason for wanting the job. The letter
 *   may reflect it; it is never a fact and never reaches the CV.
 * - Only a CONFIRMED latest revision is ever used. A draft, an item from
 *   another workspace, an item for another job, or an item tied to a role
 *   the selected profile no longer has is left out.
 */

export const EVIDENCE_KINDS = ["PROJECT", "ACHIEVEMENT", "RESPONSIBILITY", "MOTIVATION"] as const;
export type EvidenceKind = (typeof EVIDENCE_KINDS)[number];
export const PROFESSIONAL_EVIDENCE_KINDS: readonly EvidenceKind[] = ["PROJECT", "ACHIEVEMENT", "RESPONSIBILITY"];

export const EVIDENCE_SCOPES = ["APPLICATION", "BACKGROUND"] as const;
export type EvidenceScope = (typeof EVIDENCE_SCOPES)[number];

export const MAX_EVIDENCE_TITLE_CHARS = 120;
export const MAX_EVIDENCE_DETAIL_CHARS = 1000;
/** Items one workspace can hold, drafts included. */
export const MAX_EVIDENCE_ITEMS = 40;

/** A source reference to one role of the profile. Experience entries have
 *  no ids, so a role is named by what the candidate sees. */
export interface ExperienceRef {
  title: string;
  employer: string | null;
  startedOn: string | null;
}

export interface EvidenceInput {
  kind: EvidenceKind;
  title: string;
  detail: string;
  experienceRef: ExperienceRef | null;
}

export type EvidenceInputError =
  | "kind"
  | "title_missing"
  | "title_too_long"
  | "detail_missing"
  | "detail_too_long"
  | "experience_ref"
  | "motivation_with_role"
  | "contact_details";

const EMAIL = /[^\s@<>()]+@[^\s@<>()]+\.[a-z]{2,}/i;
/** A phone number: starts with + or 0 and has at least 9 digits. Date
 *  ranges ("2019-2021") and plain counts ("1,200 users") do not match. */
const PHONE_CANDIDATE = /(?:\+|\b0)\d[\d\s().-]{6,}\d/g;

/** Evidence goes to an AI provider, so it must not carry contact details
 *  (buildProfileText keeps email and phone out of prompts for the same reason). */
export function containsContactDetails(text: string): boolean {
  if (EMAIL.test(text)) return true;
  for (const match of text.matchAll(PHONE_CANDIDATE)) {
    if ((match[0].match(/\d/g) ?? []).length >= 9) return true;
  }
  return false;
}

function trimmedString(value: unknown): string | null {
  return typeof value === "string" ? value.trim() : null;
}

function parseExperienceRef(value: unknown): ExperienceRef | null | "invalid" {
  if (value === null || value === undefined) return null;
  if (typeof value !== "object" || Array.isArray(value)) return "invalid";
  const raw = value as Record<string, unknown>;
  const title = trimmedString(raw.title);
  if (!title || title.length > 200) return "invalid";
  const employer = raw.employer === null || raw.employer === undefined ? null : trimmedString(raw.employer);
  const startedOn = raw.startedOn === null || raw.startedOn === undefined ? null : trimmedString(raw.startedOn);
  if (employer === null && raw.employer != null) return "invalid";
  if (startedOn === null && raw.startedOn != null) return "invalid";
  return { title, employer: employer || null, startedOn: startedOn || null };
}

/** Validates what the candidate sent. Over-long text is refused, never cut,
 *  so nothing is saved that the candidate did not see. */
export function parseEvidenceInput(body: unknown): { ok: true; value: EvidenceInput } | { ok: false; error: EvidenceInputError } {
  const raw = (body ?? {}) as Record<string, unknown>;
  if (!EVIDENCE_KINDS.includes(raw.kind as EvidenceKind)) return { ok: false, error: "kind" };
  const kind = raw.kind as EvidenceKind;
  const title = trimmedString(raw.title);
  if (!title) return { ok: false, error: "title_missing" };
  if (title.length > MAX_EVIDENCE_TITLE_CHARS) return { ok: false, error: "title_too_long" };
  const detail = trimmedString(raw.detail);
  if (!detail) return { ok: false, error: "detail_missing" };
  if (detail.length > MAX_EVIDENCE_DETAIL_CHARS) return { ok: false, error: "detail_too_long" };
  const experienceRef = parseExperienceRef(raw.experienceRef);
  if (experienceRef === "invalid") return { ok: false, error: "experience_ref" };
  if (kind === "MOTIVATION" && experienceRef) return { ok: false, error: "motivation_with_role" };
  if (containsContactDetails(`${title}\n${detail}`)) return { ok: false, error: "contact_details" };
  return { ok: true, value: { kind, title, detail, experienceRef } };
}

export const EVIDENCE_INPUT_MESSAGES: Record<EvidenceInputError, string> = {
  kind: "Choose what kind of evidence this is.",
  title_missing: "Give the evidence a short title.",
  title_too_long: `Keep the title to ${MAX_EVIDENCE_TITLE_CHARS} characters or fewer.`,
  detail_missing: "Describe the evidence in a sentence or two.",
  detail_too_long: `Keep the description to ${MAX_EVIDENCE_DETAIL_CHARS} characters or fewer.`,
  experience_ref: "That role could not be read. Choose it again.",
  motivation_with_role: "Motivation belongs to the application, not to a role. Remove the role.",
  contact_details: "Leave out email addresses and phone numbers. They are added from your account, not from evidence.",
};

/** Reads a stored source reference; anything unreadable counts as none. */
export function readExperienceRef(value: unknown): ExperienceRef | null {
  const parsed = parseExperienceRef(value);
  return parsed === "invalid" ? null : parsed;
}

function same(a: string | null, b: string | null): boolean {
  return (a ?? "").trim().toLowerCase() === (b ?? "").trim().toLowerCase();
}

/** The profile role a reference names, or null when the profile has none. */
export function findExperience(profile: CandidateProfileContent, ref: ExperienceRef): ExperienceEntry | null {
  return (
    profile.experience.find(
      (entry) => same(entry.title, ref.title) && same(entry.employer, ref.employer) && (ref.startedOn === null || same(entry.startedOn, ref.startedOn)),
    ) ?? null
  );
}

export function experienceRefOf(entry: ExperienceEntry): ExperienceRef {
  return { title: entry.title, employer: entry.employer ?? null, startedOn: entry.startedOn ?? null };
}

export function describeExperienceRef(ref: ExperienceRef): string {
  return ref.employer ? `${ref.title} at ${ref.employer}` : ref.title;
}
