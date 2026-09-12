import { describe, expect, it } from "vitest";
import { parseTemporalPhrase } from "../temporal-parse";

describe("parseTemporalPhrase — golden cases", () => {
  it("parses an ISO date as day precision", () => {
    expect(parseTemporalPhrase("2021-06-15")).toMatchObject({ precision: "day", year: 2021, month: 6, day: 15 });
  });

  it("parses a century phrase", () => {
    expect(parseTemporalPhrase("19th century")).toMatchObject({ precision: "century", era: "CE", year: 1801 });
  });

  it("parses a BCE century phrase", () => {
    expect(parseTemporalPhrase("5th century BCE")).toMatchObject({ precision: "century", era: "BCE" });
  });

  it("parses a 4-digit decade", () => {
    expect(parseTemporalPhrase("1920s")).toMatchObject({ precision: "decade", year: 1920 });
  });

  it("parses a 2-digit decade as 19xx (best-effort, documented ambiguity)", () => {
    expect(parseTemporalPhrase("the 90s")).toMatchObject({ precision: "decade", year: 1990 });
  });

  it("parses a quarter", () => {
    expect(parseTemporalPhrase("Q1 2021")).toMatchObject({ precision: "quarter", year: 2021, quarter: 1 });
  });

  it("parses a season", () => {
    expect(parseTemporalPhrase("summer 2019")).toMatchObject({ precision: "season", year: 2019, season: "summer" });
  });

  it("parses a month + year", () => {
    expect(parseTemporalPhrase("June 2021")).toMatchObject({ precision: "month", year: 2021, month: 6 });
  });

  it("parses a BCE year with 'circa', keeping year precision (not day)", () => {
    const value = parseTemporalPhrase("circa 1200 BCE");
    expect(value.precision).toBe("year");
    expect(value.era).toBe("BCE");
    expect(value.year).toBe(1200);
  });

  it("parses an explicit range", () => {
    const value = parseTemporalPhrase("between 2020 and 2022");
    expect(value.precision).toBe("range");
    expect(value.rangeStart).toMatchObject({ year: 2020 });
    expect(value.rangeEnd).toMatchObject({ year: 2022 });
  });

  it("parses a dash year range", () => {
    const value = parseTemporalPhrase("2020-2022");
    expect(value.precision).toBe("range");
  });
});

describe("parseTemporalPhrase — ambiguous/adversarial cases never invent false precision", () => {
  it("falls back to 'unknown' for unrecognized text, preserving the original phrase", () => {
    const value = parseTemporalPhrase("sometime last summer, I think");
    expect(value.precision).toBe("unknown");
    expect(value.displayText).toBe("sometime last summer, I think");
  });

  it("never assigns day precision to a bare year", () => {
    const value = parseTemporalPhrase("1969");
    expect(value.precision).toBe("year");
    expect(value.day).toBeUndefined();
    expect(value.month).toBeUndefined();
  });

  it("does not misparse an out-of-range ISO-shaped date as a valid day", () => {
    // month 13 is not a real month — must not silently produce a "day"-precision value.
    const value = parseTemporalPhrase("the 2021-13-40 incident report");
    expect(value.precision).not.toBe("day");
  });

  it("handles empty input as unknown rather than throwing", () => {
    expect(parseTemporalPhrase("").precision).toBe("unknown");
    expect(parseTemporalPhrase("   ").precision).toBe("unknown");
  });
});

describe("parseTemporalPhrase — multilingual phrases stay honest about precision", () => {
  it("still recognizes a bare year inside a French sentence", () => {
    const value = parseTemporalPhrase("L'entreprise a été fondée en 2019.");
    expect(value.precision).toBe("year");
    expect(value.year).toBe(2019);
  });

  it("does not invent day precision for a German month name it doesn't recognize", () => {
    // "Frühling 2020" (German for "spring 2020") isn't in the English season
    // word list — falls back to the bare year rather than guessing a season
    // or a day, which is the honest behavior this issue requires.
    const value = parseTemporalPhrase("Frühling 2020");
    expect(value.precision).toBe("year");
    expect(value.year).toBe(2020);
    expect(value.day).toBeUndefined();
  });

  it("falls back to unknown for text with no recognizable numeric year at all", () => {
    const value = parseTemporalPhrase("вчера" /* "yesterday" in Russian, no year present */);
    expect(value.precision).toBe("unknown");
  });
});
