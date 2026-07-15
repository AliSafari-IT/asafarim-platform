import { describe, expect, it } from "vitest";

import {
  buildSrt,
  formatSrtCue,
  generateSrtFromText,
  isValidSrt,
  parseSrt,
} from "../srt";

describe("formatSrtCue", () => {
  it("formats a single cue with index, timing, and text", () => {
    const cue = { index: 1, startMs: 1234, endMs: 5678, text: "Hello world." };
    const formatted = formatSrtCue(cue);
    expect(formatted).toBe("1\n00:00:01,234 --> 00:00:05,678\nHello world.");
  });
});

describe("buildSrt", () => {
  it("concatenates multiple cues with blank lines between", () => {
    const cues = [
      { index: 1, startMs: 0, endMs: 3000, text: "First." },
      { index: 2, startMs: 4000, endMs: 7000, text: "Second." },
    ];
    const srt = buildSrt(cues);
    expect(srt).toBe("1\n00:00:00,000 --> 00:00:03,000\nFirst.\n\n2\n00:00:04,000 --> 00:00:07,000\nSecond.\n");
  });
});

describe("parseSrt", () => {
  it("round-trips buildSrt output", () => {
    const original = [
      { index: 1, startMs: 0, endMs: 2000, text: "One." },
      { index: 2, startMs: 3000, endMs: 5000, text: "Two." },
    ];
    const srt = buildSrt(original);
    const parsed = parseSrt(srt);
    expect(parsed).toHaveLength(2);
    expect(parsed[0]).toMatchObject({ index: 1, startMs: 0, endMs: 2000, text: "One." });
    expect(parsed[1]).toMatchObject({ index: 2, startMs: 3000, endMs: 5000, text: "Two." });
  });

  it("handles Windows-style line endings", () => {
    const srt = "1\r\n00:00:01,000 --> 00:00:03,000\r\nHello.\r\n\r\n2\r\n00:00:04,000 --> 00:00:06,000\r\nWorld.";
    const parsed = parseSrt(srt);
    expect(parsed).toHaveLength(2);
    expect(parsed[0].text).toBe("Hello.");
    expect(parsed[1].text).toBe("World.");
  });
});

describe("generateSrtFromText", () => {
  it("creates cues proportional to word counts", () => {
    const text = "Short. A much longer sentence with many words here.";
    const cues = generateSrtFromText(text, 0, 10_000);
    expect(cues.length).toBe(2);
    expect(cues[0].index).toBe(1);
    expect(cues[0].startMs).toBe(0);
    expect(cues[0].endMs).toBeGreaterThan(cues[0].startMs);
    expect(cues[1].startMs).toBe(cues[0].endMs);
    expect(cues[1].endMs).toBeGreaterThan(cues[1].startMs);
  });

  it("respects start offset", () => {
    const text = "One. Two.";
    const cues = generateSrtFromText(text, 5000, 10_000);
    expect(cues[0].startMs).toBe(5000);
  });

  it("returns empty array for empty text", () => {
    expect(generateSrtFromText("")).toEqual([]);
  });
});

describe("isValidSrt", () => {
  it("accepts well-formed SRT", () => {
    const srt = buildSrt([{ index: 1, startMs: 0, endMs: 1000, text: "Ok." }]);
    expect(isValidSrt(srt)).toBe(true);
  });

  it("rejects empty string", () => {
    expect(isValidSrt("")).toBe(false);
  });

  it("rejects cues with negative timing", () => {
    const srt = buildSrt([{ index: 1, startMs: -100, endMs: 1000, text: "Bad." }]);
    expect(isValidSrt(srt)).toBe(false);
  });

  it("rejects cues where end <= start", () => {
    const srt = buildSrt([{ index: 1, startMs: 1000, endMs: 1000, text: "Bad." }]);
    expect(isValidSrt(srt)).toBe(false);
  });

  it("rejects empty cue text", () => {
    const srt = buildSrt([{ index: 1, startMs: 0, endMs: 1000, text: "" }]);
    expect(isValidSrt(srt)).toBe(false);
  });
});
