import { DOCUMENT_LOCALES, isOutputLanguage, type OutputLanguage } from "./language";
import type { LinkEntry } from "../profile/contract";
import { displayUrl, headerLinks } from "../profile/links";

/**
 * The business-letter frame around a cover letter: sender block, recipient
 * block, place and date, subject line. The print/PDF view
 * (app/cover-letter/[id]/preview) and the DOCX export
 * (coverLetterDocx.ts) both render from this one function, so the two can
 * never disagree about what the letter says.
 *
 * Every value here is copied **in code** from data the candidate confirmed
 * or typed: their own contact details from the profile version the letter
 * was written from, the job's title and employer (and, for a job typed in
 * by hand, its contact person and location), and the letter's creation
 * date. The model never writes any of it, so the frame cannot carry an
 * invented fact.
 *
 * Fit-to-one-page sizing lives here too (`letterDensity`), so the PDF and
 * DOCX shrink at the same word counts.
 */

export interface LetterSenderInput {
  fullName: string | null;
  email: string | null;
  phone: string | null;
  baseLocation: string | null;
  /** The profile's links; the letter shows the first few profile links
   *  (LinkedIn, GitHub, website…), never products. */
  links?: LinkEntry[];
}

/** A letter's sender block stays short so the letter keeps to one page. */
export const LETTER_MAX_LINKS = 3;

export interface LetterJobInput {
  title: string | null;
  employer: string | null;
  /** TargetJob.structuredFields — only set for jobs typed in by hand. */
  structuredFields?: unknown;
}

export interface LetterLayout {
  sender: { name: string | null; lines: string[]; links: { text: string; url: string }[] };
  /** Empty when the job names no employer or contact. */
  recipient: string[];
  /** "Genk, 20 November 2026" — the place only when the profile has one. */
  dateLine: string;
  /** "Application: Application & Solutions Engineer"; null without a job title. */
  subject: string | null;
}

const SUBJECT: Record<OutputLanguage, (title: string) => string> = {
  en: (title) => `Application: ${title}`,
  nl: (title) => `Sollicitatie: ${title}`,
  fr: (title) => `Objet : candidature – ${title}`,
  de: (title) => `Bewerbung als ${title}`,
};

function structuredString(fields: unknown, key: string): string | null {
  if (!fields || typeof fields !== "object") return null;
  const value = (fields as Record<string, unknown>)[key];
  return typeof value === "string" && value.trim().length > 0 ? value.trim() : null;
}

export function formatLetterDate(date: Date, language: OutputLanguage): string {
  return new Intl.DateTimeFormat(DOCUMENT_LOCALES[language], {
    day: "numeric",
    month: "long",
    year: "numeric",
    timeZone: "UTC",
  }).format(date);
}

export function buildLetterLayout(
  sender: LetterSenderInput,
  job: LetterJobInput,
  createdAt: Date,
  language: string | null,
): LetterLayout {
  const lang: OutputLanguage = isOutputLanguage(language) ? language : "en";

  const senderLines = [sender.baseLocation, [sender.email, sender.phone].filter(Boolean).join(" · ") || null].filter(
    (line): line is string => Boolean(line),
  );

  const contactName = structuredString(job.structuredFields, "contactName");
  const jobLocation = structuredString(job.structuredFields, "location");
  const recipient = job.employer || contactName ? [contactName, job.employer, jobLocation].filter((l): l is string => Boolean(l)) : [];

  const date = formatLetterDate(createdAt, lang);
  // "Genk, Belgium" → "Genk, 20 November 2026": the place line takes the town only.
  const place = sender.baseLocation?.split(",")[0]?.trim() || null;
  return {
    sender: {
      name: sender.fullName,
      lines: senderLines,
      links: headerLinks(sender.links ?? [])
        .slice(0, LETTER_MAX_LINKS)
        .map((link) => ({ text: displayUrl(link.url), url: link.url })),
    },
    recipient,
    dateLine: place ? `${place}, ${date}` : date,
    subject: job.title ? SUBJECT[lang](job.title) : null,
  };
}

export type LetterDensity = "regular" | "compact" | "tight";

/**
 * How tightly to set the letter so it stays on one A4/Letter page. The
 * thresholds were measured with Chromium's print-to-PDF on A4 with the
 * full frame (sender, recipient, date, subject) — see the one-page tests in
 * e2e/cover-letter-print.spec.ts. Past ~430 words nothing readable fits
 * one page; "tight" is then a best effort.
 */
export function letterDensity(wordCount: number): LetterDensity {
  if (wordCount <= 290) return "regular";
  if (wordCount <= 360) return "compact";
  return "tight";
}

export function letterWordCount(parts: { greeting: string; paragraphs: string[]; signOff: string }): number {
  return [parts.greeting, ...parts.paragraphs, parts.signOff].join(" ").split(/\s+/).filter(Boolean).length;
}
