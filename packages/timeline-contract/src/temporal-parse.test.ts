import { describe, expect, it } from "vitest";
import { parseTemporalPhrase } from "./temporal-parse";

describe("parseTemporalPhrase — written day dates", () => {
  it.each([
    ["15 June 2021", 2021, 6, 15],
    ["on the 3rd of October 1990", 1990, 10, 3],
    ["June 15, 2021", 2021, 6, 15],
    ["Sept. 1 1939", 1939, 9, 1],
  ])("%j is day precision", (text, year, month, day) => {
    expect(parseTemporalPhrase(text)).toMatchObject({ precision: "day", year, month, day, displayText: text });
  });

  it.each(["31 February 2021", "2021-02-30", "30 Feb 2023"])("an impossible day (%j) never becomes day precision", (text) => {
    expect(parseTemporalPhrase(text).precision).not.toBe("day");
  });

  it("keeps a month and year at month precision", () => {
    expect(parseTemporalPhrase("June 2021")).toMatchObject({ precision: "month", year: 2021, month: 6 });
  });

  it("accepts 29 February only in a leap year", () => {
    expect(parseTemporalPhrase("29 February 2024").precision).toBe("day");
    expect(parseTemporalPhrase("29 February 2023").precision).toBe("month");
  });
});

describe("parseTemporalPhrase — ranges", () => {
  it.each(["between 2021-01-04 and 2021-03-01", "from 2021-01-04 to 2021-03-01", "2021-01-04 – 2021-03-01", "from March 1990 until 1994"])(
    "%j stays a range instead of collapsing to its first date",
    (text) => {
      const value = parseTemporalPhrase(text);
      expect(value.precision).toBe("range");
      expect(value.rangeStart?.precision).not.toBe("unknown");
    }
  );

  it("does not treat a lone ISO date as a range", () => {
    expect(parseTemporalPhrase("2021-06-15").precision).toBe("day");
  });
});

describe("parseTemporalPhrase — seasons", () => {
  it("reads 'the spring of 1893' as a season, not a bare year", () => {
    expect(parseTemporalPhrase("the spring of 1893")).toMatchObject({ precision: "season", season: "spring", year: 1893 });
  });
});
