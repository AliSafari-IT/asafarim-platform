import type { TemporalValue, Season } from "./temporal";

/**
 * Best-effort heuristic parser from a free-text date phrase to a
 * TemporalValue. Deliberately conservative: a phrase it doesn't recognize
 * becomes precision "unknown" with the original text preserved, never a
 * guessed exact date — the whole point of TLAI-004 is that approximate
 * input never becomes false-exact output. Recognizes English phrasing;
 * a bare 4-digit year or ISO date is recognized regardless of the
 * surrounding language, since that part isn't locale-specific.
 */

const SEASON_WORDS: Record<string, Season> = {
  spring: "spring",
  summer: "summer",
  autumn: "autumn",
  fall: "autumn",
  winter: "winter",
};

function unknown(text: string): TemporalValue {
  return { precision: "unknown", era: "CE", displayText: text.trim() };
}

function withEra(text: string, year: number): { era: "CE" | "BCE"; year: number } {
  const isBce = /\b(bce|bc)\b/i.test(text);
  return { era: isBce ? "BCE" : "CE", year };
}

export function parseTemporalPhrase(rawText: string): TemporalValue {
  const text = rawText.trim();
  if (!text) return unknown(rawText);

  // ISO date: 2021-06-15
  const iso = text.match(/\b(\d{4})-(\d{2})-(\d{2})\b/);
  if (iso) {
    const year = Number(iso[1]);
    const month = Number(iso[2]);
    const day = Number(iso[3]);
    if (month >= 1 && month <= 12 && day >= 1 && day <= 31) {
      return { precision: "day", era: "CE", year, month, day, displayText: text };
    }
  }

  // Century: "19th century", "5th century BCE"
  const century = text.match(/\b(\d{1,2})(?:st|nd|rd|th)\s+century\b/i);
  if (century) {
    const n = Number(century[1]);
    const { era, year } = withEra(text, (n - 1) * 100 + 1);
    return { precision: "century", era, year, displayText: text };
  }

  // Decade: "1920s" (4-digit), "the 90s" (2-digit — assumed 1900s, genuinely ambiguous, best-effort)
  const decade4 = text.match(/\b\d{3}0s\b/);
  const decade2 = !decade4 ? text.match(/\b\d0s\b/) : null;
  if (decade4 || decade2) {
    const raw = (decade4 ?? decade2)![0].replace(/0s$/, "0");
    const year = raw.length === 2 ? Number(`19${raw}`) : Number(raw);
    return { precision: "decade", era: "CE", year, displayText: text };
  }

  // Quarter: "Q1 2021", "Q3 1999"
  const quarter = text.match(/\bQ([1-4])\s+(\d{4})\b/i);
  if (quarter) {
    return {
      precision: "quarter",
      era: "CE",
      year: Number(quarter[2]),
      quarter: Number(quarter[1]) as 1 | 2 | 3 | 4,
      displayText: text,
    };
  }

  // Season: "summer 2019", "winter 1944"
  const seasonMatch = text.match(/\b(spring|summer|autumn|fall|winter)\s+(\d{4})\b/i);
  if (seasonMatch) {
    const season = SEASON_WORDS[seasonMatch[1]!.toLowerCase()]!;
    return { precision: "season", era: "CE", year: Number(seasonMatch[2]), season, displayText: text };
  }

  // Month + year: "June 2021", "Jun 2021"
  const monthNames = [
    "january", "february", "march", "april", "may", "june",
    "july", "august", "september", "october", "november", "december",
  ];
  const monthMatch = text.match(
    /\b(january|february|march|april|may|june|july|august|september|october|november|december|jan|feb|mar|apr|jun|jul|aug|sep|sept|oct|nov|dec)\.?\s+(\d{4})\b/i
  );
  if (monthMatch) {
    const word = monthMatch[1]!.toLowerCase();
    const monthIndex = monthNames.findIndex((m) => m.startsWith(word.replace(/\.$/, "").slice(0, 3)));
    if (monthIndex >= 0) {
      return { precision: "month", era: "CE", year: Number(monthMatch[2]), month: monthIndex + 1, displayText: text };
    }
  }

  // Range: "between 2020 and 2022", "2020-2022" (year range, distinct from an ISO date already matched above)
  const rangeWords = text.match(/\bbetween\s+(.+?)\s+and\s+(.+)/i);
  const rangeDash = !rangeWords ? text.match(/\b(\d{4})\s*[-–—]\s*(\d{4})\b/) : null;
  if (rangeWords || rangeDash) {
    const [startText, endText] = rangeWords ? [rangeWords[1]!, rangeWords[2]!] : [rangeDash![1]!, rangeDash![2]!];
    const rangeStart = parseTemporalPhrase(startText);
    const rangeEnd = parseTemporalPhrase(endText);
    if (rangeStart.precision !== "unknown" && rangeEnd.precision !== "unknown") {
      return { precision: "range", era: "CE", rangeStart, rangeEnd, displayText: text };
    }
  }

  // Bare 4-digit year, with optional "circa"/"c."/"~" approximation and BCE/BC suffix.
  const year = text.match(/\b(\d{3,4})\s*(bce|bc)\b/i) ?? text.match(/\b(\d{4})\b/);
  if (year) {
    const { era, year: y } = withEra(text, Number(year[1]));
    return { precision: "year", era, year: y, displayText: text };
  }

  return unknown(text);
}
