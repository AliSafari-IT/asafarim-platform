import { z } from "zod";
import type { OutputLanguage } from "../tailoring/language";

/**
 * Contact preferences in application emails (#940). The candidate saves
 * when and how they like to be reached; the email composer adds one
 * paragraph built here, in code, from those values, in the email's
 * language. The AI never writes or sees it, so it can't invent hours or
 * promise a fast reply. Pure: no database, safe in the browser.
 */

/** ISO weekday: 1 = Monday … 7 = Sunday. */
export const WEEKDAYS = [1, 2, 3, 4, 5, 6, 7] as const;
export type Weekday = (typeof WEEKDAYS)[number];

export interface TimeWindow {
  days: Weekday[];
  /** "HH:MM", 24-hour. */
  start: string;
  end: string;
}

export type OutsideHours = "none" | "arrange" | "unavailable";

export interface ContactPreferences {
  /** When phone calls suit best. May be empty. */
  callWindows: TimeWindow[];
  /** IANA zone, e.g. "Europe/Brussels". */
  timeZone: string;
  /** What the paragraph says about other times: nothing, "please arrange
   *  calls in advance", or the listed times the candidate can't take calls. */
  outsideHours: OutsideHours;
  unavailable: TimeWindow[];
  /** "Messages welcome any time" per channel. */
  email: boolean;
  whatsapp: boolean;
}

/** Per application: the saved defaults, values just for this email, or none. */
export const CONTACT_MODES = ["DEFAULT", "OVERRIDE", "OMIT"] as const;
export type ContactMode = (typeof CONTACT_MODES)[number];

export const MAX_WINDOWS = 5;
export const DEFAULT_TIME_ZONE = "Europe/Brussels";

export const EMPTY_PREFERENCES: ContactPreferences = {
  callWindows: [],
  timeZone: DEFAULT_TIME_ZONE,
  outsideHours: "none",
  unavailable: [],
  email: false,
  whatsapp: false,
};

const TIME = /^([01]\d|2[0-3]):[0-5]\d$/;

export function isTimeZone(value: string): boolean {
  if (!/^[A-Za-z_]+(?:\/[A-Za-z0-9_+-]+)+$/.test(value) && value !== "UTC") return false;
  try {
    new Intl.DateTimeFormat("en", { timeZone: value });
    return true;
  } catch {
    return false;
  }
}

const windowSchema = z
  .object({
    days: z
      .array(z.number().int().min(1).max(7))
      .min(1, "days_missing")
      .max(7)
      .refine((days) => new Set(days).size === days.length, "days_repeated"),
    start: z.string().regex(TIME, "time_invalid"),
    end: z.string().regex(TIME, "time_invalid"),
  })
  .strict()
  .refine((w) => w.start < w.end, "time_order");

export const contactPreferencesSchema = z
  .object({
    callWindows: z.array(windowSchema).max(MAX_WINDOWS, "too_many"),
    timeZone: z.string().max(64).refine(isTimeZone, "time_zone"),
    outsideHours: z.enum(["none", "arrange", "unavailable"]),
    unavailable: z.array(windowSchema).max(MAX_WINDOWS, "too_many"),
    email: z.boolean(),
    whatsapp: z.boolean(),
  })
  .strict()
  .refine((p) => p.outsideHours !== "unavailable" || p.unavailable.length > 0, "unavailable_missing");

export type ContactPreferencesError =
  | "days_missing"
  | "days_repeated"
  | "time_invalid"
  | "time_order"
  | "too_many"
  | "time_zone"
  | "unavailable_missing"
  | "invalid";

const KNOWN_ERRORS = new Set<string>(["days_missing", "days_repeated", "time_invalid", "time_order", "too_many", "time_zone", "unavailable_missing"]);

function normalize(p: z.infer<typeof contactPreferencesSchema>): ContactPreferences {
  const tidy = (w: { days: number[]; start: string; end: string }): TimeWindow => ({
    days: [...w.days].sort((a, b) => a - b) as Weekday[],
    start: w.start,
    end: w.end,
  });
  return {
    callWindows: p.callWindows.map(tidy),
    timeZone: p.timeZone,
    outsideHours: p.outsideHours,
    // Unavailable times only mean something when chosen.
    unavailable: p.outsideHours === "unavailable" ? p.unavailable.map(tidy) : [],
    email: p.email,
    whatsapp: p.whatsapp,
  };
}

/** Validates input from the API. Refused, never silently fixed. */
export function parseContactPreferences(value: unknown): { ok: true; value: ContactPreferences } | { ok: false; error: ContactPreferencesError } {
  // Unavailable times only count while chosen: the editor hides them
  // otherwise, so a hidden, half-edited window must not block a save.
  const input =
    value && typeof value === "object" && !Array.isArray(value) && (value as { outsideHours?: unknown }).outsideHours !== "unavailable"
      ? { ...(value as object), unavailable: [] }
      : value;
  const parsed = contactPreferencesSchema.safeParse(input);
  if (parsed.success) return { ok: true, value: normalize(parsed.data) };
  const message = parsed.error.issues[0]?.message ?? "";
  return { ok: false, error: KNOWN_ERRORS.has(message) ? (message as ContactPreferencesError) : "invalid" };
}

/** Stored JSON read leniently: anything unreadable counts as none. */
export function readContactPreferences(value: unknown): ContactPreferences | null {
  const parsed = parseContactPreferences(value);
  return parsed.ok ? parsed.value : null;
}

export function isContactMode(value: unknown): value is ContactMode {
  return typeof value === "string" && (CONTACT_MODES as readonly string[]).includes(value);
}

/** Which preferences an email uses. */
export function resolveContactPreferences(
  mode: ContactMode,
  defaults: ContactPreferences | null,
  override: ContactPreferences | null,
): ContactPreferences | null {
  if (mode === "OMIT") return null;
  if (mode === "OVERRIDE") return override;
  return defaults;
}

// ─── Rendering ─────────────────────────────────────────────────────────────

interface Words {
  days: Record<Weekday, string>;
  /** "Monday to Friday" */
  range: (from: string, to: string) => string;
  /** "between 16:00 and 18:00" */
  between: (start: string, end: string) => string;
  time: (hhmm: string) => string;
  zone: (city: string) => string;
  calls: (windows: string, zone: string) => string;
  arrangeAfterCalls: string;
  arrangeOnly: string;
  unavailable: (windows: string, zone: string | null) => string;
  messages: (channels: "email" | "whatsapp" | "both") => string;
}

const WORDS: Record<OutputLanguage, Words> = {
  en: {
    days: { 1: "Monday", 2: "Tuesday", 3: "Wednesday", 4: "Thursday", 5: "Friday", 6: "Saturday", 7: "Sunday" },
    range: (a, b) => `${a} to ${b}`,
    between: (s, e) => `between ${s} and ${e}`,
    time: (t) => t,
    zone: (city) => `${city} time`,
    calls: (w, z) => `The best time to reach me by phone is ${w}, ${z}.`,
    arrangeAfterCalls: "Outside these hours, please arrange a call in advance.",
    arrangeOnly: "Please arrange phone calls with me in advance.",
    unavailable: (w, z) => `I'm not available for calls on ${w}${z ? `, ${z}` : ""}.`,
    messages: (c) =>
      `You're welcome to send me ${c === "both" ? "an email or WhatsApp message" : c === "email" ? "an email" : "a WhatsApp message"} at any time, and I'll respond when available.`,
  },
  nl: {
    days: { 1: "maandag", 2: "dinsdag", 3: "woensdag", 4: "donderdag", 5: "vrijdag", 6: "zaterdag", 7: "zondag" },
    range: (a, b) => `${a} tot en met ${b}`,
    between: (s, e) => `tussen ${s} en ${e}`,
    time: (t) => t,
    zone: (city) => `tijd in ${city}`,
    calls: (w, z) => `Telefonisch ben ik het best bereikbaar op ${w} (${z}).`,
    arrangeAfterCalls: "Buiten deze uren vraag ik u vooraf een belafspraak te maken.",
    arrangeOnly: "Ik vraag u telefoongesprekken vooraf met mij af te spreken.",
    unavailable: (w, z) => `Op ${w}${z ? ` (${z})` : ""} ben ik niet bereikbaar voor telefoongesprekken.`,
    messages: (c) =>
      `U kunt mij altijd ${c === "both" ? "een e-mail of WhatsApp-bericht" : c === "email" ? "een e-mail" : "een WhatsApp-bericht"} sturen; ik reageer zodra ik beschikbaar ben.`,
  },
  fr: {
    days: { 1: "lundi", 2: "mardi", 3: "mercredi", 4: "jeudi", 5: "vendredi", 6: "samedi", 7: "dimanche" },
    range: (a, b) => `du ${a} au ${b}`,
    between: (s, e) => `entre ${s} et ${e}`,
    time: (t) => t.replace(":", "h"),
    zone: (city) => `heure de ${city}`,
    calls: (w, z) => `Le meilleur moment pour me joindre par téléphone est ${w} (${z}).`,
    arrangeAfterCalls: "En dehors de ces horaires, merci de convenir d'un appel à l'avance.",
    arrangeOnly: "Merci de convenir des appels téléphoniques avec moi à l'avance.",
    unavailable: (w, z) => `Je ne suis pas disponible pour un appel ${w}${z ? ` (${z})` : ""}.`,
    messages: (c) =>
      `Vous pouvez m'envoyer ${c === "both" ? "un e-mail ou un message WhatsApp" : c === "email" ? "un e-mail" : "un message WhatsApp"} à tout moment ; je vous répondrai dès que je serai disponible.`,
  },
  de: {
    days: { 1: "Montag", 2: "Dienstag", 3: "Mittwoch", 4: "Donnerstag", 5: "Freitag", 6: "Samstag", 7: "Sonntag" },
    range: (a, b) => `${a} bis ${b}`,
    between: (s, e) => `zwischen ${s} und ${e} Uhr`,
    time: (t) => t,
    zone: (city) => `Zeitzone ${city}`,
    calls: (w, z) => `Telefonisch erreichen Sie mich am besten ${w} (${z}).`,
    arrangeAfterCalls: "Außerhalb dieser Zeiten vereinbaren Sie bitte vorab einen Telefontermin.",
    arrangeOnly: "Bitte vereinbaren Sie Telefonate mit mir vorab.",
    unavailable: (w, z) => `Telefonisch nicht erreichbar bin ich ${w}${z ? ` (${z})` : ""}.`,
    messages: (c) =>
      `${c === "both" ? "E-Mails und WhatsApp-Nachrichten" : c === "email" ? "E-Mails" : "WhatsApp-Nachrichten"} können Sie mir jederzeit senden; ich antworte, sobald ich verfügbar bin.`,
  },
};

/** City names for the zones candidates here use most; others fall back to
 *  the zone's own last part ("America/New_York" → "New York"). */
const CITY_NAMES: Record<string, Partial<Record<OutputLanguage, string>>> = {
  "Europe/Brussels": { en: "Brussels", nl: "Brussel", fr: "Bruxelles", de: "Brüssel" },
  "Europe/Amsterdam": { en: "Amsterdam", nl: "Amsterdam", fr: "Amsterdam", de: "Amsterdam" },
  "Europe/Paris": { en: "Paris", nl: "Parijs", fr: "Paris", de: "Paris" },
  "Europe/Luxembourg": { en: "Luxembourg", nl: "Luxemburg", fr: "Luxembourg", de: "Luxemburg" },
  "Europe/Berlin": { en: "Berlin", nl: "Berlijn", fr: "Berlin", de: "Berlin" },
  "Europe/London": { en: "London", nl: "Londen", fr: "Londres", de: "London" },
};

export function timeZoneCity(timeZone: string, language: OutputLanguage): string {
  const known = CITY_NAMES[timeZone]?.[language];
  if (known) return known;
  if (timeZone === "UTC") return "UTC";
  return (timeZone.split("/").pop() ?? timeZone).replace(/_/g, " ");
}

function joinList(items: string[], language: OutputLanguage): string {
  return new Intl.ListFormat(language, { style: "long", type: "conjunction" }).format(items);
}

/** "Monday to Friday", "Monday, Wednesday and Friday", "Monday to Wednesday and Friday". */
export function describeDays(days: Weekday[], language: OutputLanguage): string {
  const words = WORDS[language];
  const sorted = [...new Set(days)].sort((a, b) => a - b);
  const runs: Weekday[][] = [];
  for (const day of sorted) {
    const last = runs[runs.length - 1];
    if (last && day === last[last.length - 1]! + 1) last.push(day);
    else runs.push([day]);
  }
  const parts = runs.flatMap((run) =>
    run.length >= 3
      ? [words.range(words.days[run[0]!], words.days[run[run.length - 1]!])]
      : // French names a single weekday with "le": "le lundi et le jeudi".
        run.map((d) => (language === "fr" ? `le ${words.days[d]}` : words.days[d])),
  );
  return joinList(parts, language);
}

/** Joins windows with a comma before the last "and", so each window's own
 *  "and"s ("Monday and Friday between 9:00 and 12:00") stay readable. */
const WINDOW_JOIN: Record<OutputLanguage, string> = { en: ", and ", nl: ", en ", fr: ", et ", de: ", und " };

function describeWindows(windows: TimeWindow[], language: OutputLanguage): string {
  const words = WORDS[language];
  const parts = windows.map((w) => `${describeDays(w.days, language)} ${words.between(words.time(w.start), words.time(w.end))}`);
  if (parts.length <= 1) return parts.join("");
  return `${parts.slice(0, -1).join(", ")}${WINDOW_JOIN[language]}${parts[parts.length - 1]}`;
}

/**
 * The paragraph for one email, or null when there is nothing to say (no
 * preferences, or every option left empty). Never promises a fast reply.
 */
export function renderContactParagraph(prefs: ContactPreferences | null, language: OutputLanguage): string | null {
  if (!prefs) return null;
  const words = WORDS[language];
  const zone = words.zone(timeZoneCity(prefs.timeZone, language));
  const sentences: string[] = [];
  const hasCalls = prefs.callWindows.length > 0;
  if (hasCalls) sentences.push(words.calls(describeWindows(prefs.callWindows, language), zone));
  if (prefs.outsideHours === "arrange") sentences.push(hasCalls ? words.arrangeAfterCalls : words.arrangeOnly);
  if (prefs.outsideHours === "unavailable" && prefs.unavailable.length > 0) {
    sentences.push(words.unavailable(describeWindows(prefs.unavailable, language), hasCalls ? null : zone));
  }
  if (prefs.email || prefs.whatsapp) sentences.push(words.messages(prefs.email && prefs.whatsapp ? "both" : prefs.email ? "email" : "whatsapp"));
  return sentences.length > 0 ? sentences.join(" ") : null;
}

/**
 * Puts `next` where `previous` was in an email body, or before the closing
 * (the last block: sign-off and name) when it wasn't there, or removes it
 * when `next` is null. Returns null when the body doesn't hold `previous`
 * and so can't be changed safely.
 */
export function swapContactParagraph(body: string, previous: string | null, next: string | null): string | null {
  const blocks = body.split("\n\n");
  if (previous) {
    const index = blocks.indexOf(previous);
    if (index < 0) return null;
    if (next) blocks[index] = next;
    else blocks.splice(index, 1);
    return blocks.join("\n\n");
  }
  if (!next) return body;
  if (blocks.length < 2) return null;
  blocks.splice(blocks.length - 1, 0, next);
  return blocks.join("\n\n");
}
