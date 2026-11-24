import { createHash } from "node:crypto";
import { contentStems, textStems } from "../jobFit";

/**
 * Job requirements (#930): the lines of a posting that say what a candidate
 * must or should bring, each with a stable id. Deterministic and free, no
 * model call: structured selection first, as the issue asks.
 *
 * - A requirement id is a hash of its normalised text, so it stays the same
 *   when the posting is fetched again unchanged, whatever its position.
 * - Requirement text comes from the job posting, which is untrusted. It is
 *   only ever compared, shown escaped in the UI, or fenced as data in a
 *   prompt; never treated as an instruction.
 */

export type RequirementPriority = "required" | "preferred";

export interface JobRequirement {
  /** "req_" + 10 hex characters of sha256(normalised text). */
  id: string;
  /** The requirement as the posting words it, trimmed and capped. */
  text: string;
  priority: RequirementPriority;
  /** Non-generic stems the requirement is about (jobFit.ts's stemming). */
  terms: string[];
}

/** The most requirements one posting yields. Bounds every later step. */
export const MAX_REQUIREMENTS = 12;
export const MAX_REQUIREMENT_CHARS = 200;
const MIN_REQUIREMENT_CHARS = 8;
const MAX_LINE_CHARS = 400;

/** Headings that open a requirements section (EN, NL, FR, DE). Matched on
 *  the folded, lower-cased heading without bullets or a trailing colon. */
const REQUIREMENT_HEADING =
  /^(?:requirements?|qualifications?|(?:your |the ideal |candidate )?profile|what you (?:bring|have|need|will need)|what we(?:'re| are)? look(?:ing)? for|who you are|about you|you have|you bring|must[- ]haves?|nice[- ]to[- ]haves?|skills(?: and experience)?|preferred(?: qualifications)?|bonus(?: points)?|vereisten|(?:jouw |je |uw )?profiel|wie ben je|wat breng je mee|wat vragen we|wat verwachten we|functie-?eisen|competenties|exigences|(?:votre )?profil(?: recherche)?|competences(?: requises)?|qualifications requises|ce que nous recherchons|anforderungen|(?:dein|ihr) profil|qualifikationen|was (?:du|sie) mitbring(?:st|en)|das bringst du mit|das bringen sie mit)$/;

/** Headings that end a requirements section. */
const OTHER_HEADING =
  /^(?:responsibilities|what you(?:'ll| will) do|tasks|duties|your role|the role|about (?:us|the company|the role|the job)|we offer|what we offer|benefits|perks|why join us|how to apply|taken|(?:jouw |je )?taken|functie(?:omschrijving)?|wat bieden we|wij bieden|ons aanbod|over ons|missions?|vos missions|nous offrons|ce que nous offrons|avantages|a propos|aufgaben|(?:deine|ihre) aufgaben|wir bieten|uber uns)$/;

const PREFERRED_CUE =
  /\b(?:nice[- ]to[- ]have|preferred|preferably|a plus|is a plus|bonus|ideally|desirable|pluspunt|is een plus|bij voorkeur|een troef|un atout|appreciee?s?|souhaite|idealement|wunschenswert|von vorteil|idealerweise)\b/;

/** A line that reads like a requirement even outside a heading. */
const REQUIREMENT_CUE =
  /\b(?:\d+\+?\s*(?:years?|yrs|jaar|ans|jahre)|experience (?:with|in)|knowledge of|familiar(?:ity)? with|proficien(?:t|cy) in|degree in|bachelor|master'?s?|certified|certification|fluent|required|must have|ervaring (?:met|in)|kennis van|diploma|vereist|experience (?:de|en)|maitrise|connaissance(?:s)? (?:de|en)|diplome|exige|erfahrung (?:mit|in)|kenntnisse in|abschluss|erforderlich)\b/;

const BULLET = /^\s*(?:[-*•·▪◦‣–—]|\d+[.)])\s+/;

function fold(text: string): string {
  return text.normalize("NFD").replace(/\p{M}/gu, "").toLowerCase();
}

function headingKey(line: string): string {
  return fold(line.replace(BULLET, "").replace(/^#+\s*/, ""))
    .replace(/[:：.!?]+\s*$/, "")
    .replace(/\s+/g, " ")
    .trim();
}

function isHeading(line: string): boolean {
  return line.length <= 60 && (/[:：]\s*$/.test(line) || REQUIREMENT_HEADING.test(headingKey(line)) || OTHER_HEADING.test(headingKey(line)));
}

/** Strip prompt fence sentinels and collapse whitespace: a requirement is
 *  shown and fenced later, so it must not be able to close a fence. */
export function cleanRequirementText(text: string): string {
  return text.replace(/<<<|>>>/g, "").replace(BULLET, "").replace(/\s+/g, " ").trim();
}

export function requirementId(text: string): string {
  const normalised = fold(cleanRequirementText(text)).replace(/[^\p{L}\p{N}]+/gu, " ").trim();
  return `req_${createHash("sha256").update(normalised).digest("hex").slice(0, 10)}`;
}

/** A long requirement line is often several requirements: split on ";" and
 *  inline bullets, never inside a sentence. */
function splitLine(line: string): string[] {
  return line
    .split(/\s*[;•·▪]\s+|\s+[-–]\s+(?=\p{Lu})/u)
    .map((part) => part.trim())
    .filter(Boolean);
}

/** Two-letter technology names the word split drops ("Go", "R", "UX",
 *  "AI", "QA", "BI"): written capitalised, they are a term; lower-case
 *  "go" is the verb and never counts. */
const SHORT_TERM = /(?<![\p{L}\p{N}])(?:[A-Z][a-z]|[A-Z]{2})(?![\p{L}\p{N}])/gu;
const SHORT_STOP = new Set(["an", "as", "at", "be", "by", "do", "he", "if", "in", "is", "it", "me", "my", "no", "of", "on", "or", "so", "to", "up", "us", "we", "de", "en", "et", "la", "le", "un", "du", "je", "ik", "op", "te", "om", "er", "zu", "im", "am", "es", "ab", "co", "eu", "hr", "id", "ok", "pr", "vs", "nl", "fr"]);

function shortTerms(text: string): string[] {
  return [...text.matchAll(SHORT_TERM)].map((m) => m[0].toLowerCase()).filter((t) => !SHORT_STOP.has(t));
}

/** Every term a text mentions, for matching requirements against sources:
 *  jobFit.ts's stems plus capitalised two-letter names. */
export function termStems(text: string): Set<string> {
  const stems = textStems(text);
  for (const term of shortTerms(text)) stems.add(term);
  return stems;
}

/** The terms a requirement is about: non-generic stems plus two-letter
 *  names, first-seen order. */
export function requirementTerms(text: string): string[] {
  return [...new Set([...contentStems(text), ...shortTerms(text)])];
}

function sentences(text: string): string[] {
  return text.split(/(?<=[.!?])\s+/).map((s) => s.trim()).filter(Boolean);
}

/**
 * The posting's requirements, in posting order, at most MAX_REQUIREMENTS.
 * Lines under a requirements heading count; elsewhere only bullet lines or
 * short lines with a requirement cue ("3+ years", "knowledge of", "vereist")
 * do, and never under a heading such as "Responsibilities" or "We offer".
 * A posting with no line breaks at all falls back to cue sentences.
 */
export function extractRequirements(jobText: string): JobRequirement[] {
  const lines = jobText.split(/\n+/).map((l) => l.trim()).filter(Boolean);
  const candidates: { text: string; preferred: boolean }[] = [];
  let section: "requirements" | "preferred" | "other" | null = null;

  const consider = (raw: string, preferredSection: boolean) => {
    for (const part of splitLine(raw)) {
      const text = cleanRequirementText(part);
      if (text.length < MIN_REQUIREMENT_CHARS || text.length > MAX_LINE_CHARS) continue;
      candidates.push({ text, preferred: preferredSection || PREFERRED_CUE.test(fold(text)) });
    }
  };

  for (const line of lines) {
    if (isHeading(line)) {
      const key = headingKey(line);
      if (REQUIREMENT_HEADING.test(key)) section = PREFERRED_CUE.test(key) || /^(?:preferred|bonus)/.test(key) ? "preferred" : "requirements";
      else section = OTHER_HEADING.test(key) ? "other" : section === "other" ? "other" : null;
      // A heading with content after the colon ("Profile: 5 years of Go")
      // still carries a requirement.
      const after = line.split(/[:：]/).slice(1).join(":").trim();
      if (after && section !== "other" && section !== null) consider(after, section === "preferred");
      continue;
    }
    if (section === "requirements" || section === "preferred") {
      consider(line, section === "preferred");
    } else if (section !== "other") {
      const folded = fold(line);
      if (REQUIREMENT_CUE.test(folded) && (BULLET.test(line) || line.length <= 200)) consider(line, false);
    }
  }
  // A posting with almost no line breaks (one pasted paragraph): cue sentences.
  if (candidates.length === 0 && lines.length <= 3) {
    for (const sentence of sentences(jobText)) {
      if (REQUIREMENT_CUE.test(fold(sentence))) consider(sentence, false);
    }
  }

  const seen = new Set<string>();
  const requirements: JobRequirement[] = [];
  for (const candidate of candidates) {
    const terms = requirementTerms(candidate.text);
    if (terms.length === 0) continue;
    const text = candidate.text.length > MAX_REQUIREMENT_CHARS ? `${candidate.text.slice(0, MAX_REQUIREMENT_CHARS - 1).trimEnd()}…` : candidate.text;
    const id = requirementId(candidate.text);
    if (seen.has(id)) continue;
    seen.add(id);
    requirements.push({ id, text, priority: candidate.preferred ? "preferred" : "required", terms: terms.slice(0, 12) });
    if (requirements.length >= MAX_REQUIREMENTS) break;
  }
  return requirements;
}
