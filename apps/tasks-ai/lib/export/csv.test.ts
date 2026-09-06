import { describe, expect, it } from "vitest";
import { escapeCell, parseCsv, toCsv } from "./csv";

describe("escapeCell — formula injection", () => {
  it("neutralizes a leading = + - @ with a single quote", () => {
    expect(escapeCell("=SUM(A1:A9)")).toBe("'=SUM(A1:A9)");
    expect(escapeCell("+1")).toBe("'+1");
    expect(escapeCell("-cmd")).toBe("'-cmd");
    expect(escapeCell("@import")).toBe("'@import");
  });
  it("quotes cells with commas, quotes, newlines", () => {
    expect(escapeCell('a,b')).toBe('"a,b"');
    expect(escapeCell('she said "hi"')).toBe('"she said ""hi"""');
  });
  it("leaves ordinary text alone", () => {
    expect(escapeCell("Draft the brief")).toBe("Draft the brief");
  });
});

describe("toCsv / parseCsv round trip", () => {
  it("emits a header even with no rows", () => {
    expect(toCsv([], ["a", "b"])).toBe("a,b\r\n");
  });
  it("round-trips ordinary rows", () => {
    const rows = [
      { title: "One", note: "a,b" },
      { title: "Two", note: 'has "quote"' },
    ];
    const csv = toCsv(rows, ["title", "note"]);
    const parsed = parseCsv(csv);
    expect(parsed[0]).toEqual(["title", "note"]);
    expect(parsed[1]).toEqual(["One", "a,b"]);
    expect(parsed[2]).toEqual(["Two", 'has "quote"']);
  });
});
