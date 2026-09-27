import { parseTemporalPhrase, type TemporalValue } from "@asafarim/timeline-contract";

/**
 * Finds the date phrase in a sentence, for the rule-based fixture and for
 * re-reading a date the user edits. The phrase is then handed to TimelineAI's
 * own parser, so precision is decided in one place. Patterns run from the
 * most specific (ranges, exact days) to the least, and the phrase returned
 * is always a verbatim slice of the sentence.
 */
const MONTH = "(?:jan(?:uary)?|feb(?:ruary)?|mar(?:ch)?|apr(?:il)?|may|jun(?:e)?|jul(?:y)?|aug(?:ust)?|sep(?:t(?:ember)?)?|oct(?:ober)?|nov(?:ember)?|dec(?:ember)?)\\.?";
const DAY = "\\d{1,2}(?:st|nd|rd|th)?";
const YEAR = "\\d{4}";
const APPROX = "(?:(?:circa|c\\.|ca\\.|about|around|approximately|early|mid|late)\\s+)?";
const SINGLE = [
  `${YEAR}-\\d{2}-\\d{2}`,
  `${DAY}\\s+(?:of\\s+)?${MONTH},?\\s+${YEAR}`,
  `${MONTH}\\s+${DAY},?\\s+${YEAR}`,
  `${MONTH}\\s+${YEAR}`,
  `(?:spring|summer|autumn|fall|winter)\\s+(?:of\\s+)?${YEAR}`,
  `Q[1-4]\\s+${YEAR}`,
  `\\d{1,2}(?:st|nd|rd|th)\\s+century(?:\\s+(?:BCE|BC|CE|AD))?`,
  `(?:the\\s+)?\\d{3}0s`,
  `\\d{3,4}\\s*(?:BCE|BC)`,
  YEAR,
].map((p) => `${APPROX}(?:the\\s+)?${p}`);

const PATTERNS: RegExp[] = [
  new RegExp(`\\bbetween\\s+(?:${SINGLE.join("|")})\\s+and\\s+(?:${SINGLE.join("|")})`, "i"),
  new RegExp(`\\bfrom\\s+(?:${SINGLE.join("|")})\\s+(?:to|until|till|through)\\s+(?:${SINGLE.join("|")})`, "i"),
  new RegExp(`\\b${YEAR}\\s*[–—-]\\s*${YEAR}\\b`, "i"),
  ...SINGLE.map((p) => new RegExp(`\\b${p}\\b`, "i")),
];

export function findDatePhrase(sentence: string): string | null {
  for (const pattern of PATTERNS) {
    const match = sentence.match(pattern);
    if (match) return match[0].trim();
  }
  return null;
}

export const UNDATED: TemporalValue = { precision: "unknown", era: "CE", displayText: "Undated" };

/** TimelineAI's parser, or the undated value for an empty phrase. */
export function readDate(phrase: string): TemporalValue {
  const text = phrase.trim().slice(0, 120);
  return text ? parseTemporalPhrase(text) : UNDATED;
}

/** "the 90s" is parsed as the 1990s but could be any century: say so. */
export function precisionCaveat(value: TemporalValue): string | null {
  if (value.precision === "unknown" && value.displayText !== UNDATED.displayText) return "This date couldn't be read precisely, so it's shown as written.";
  if (value.precision === "decade" && /\b\d0s\b/.test(value.displayText) && !/\b\d{3}0s\b/.test(value.displayText)) {
    return "A two-digit decade could be in any century; it's placed in the 1900s as a guess.";
  }
  return null;
}
