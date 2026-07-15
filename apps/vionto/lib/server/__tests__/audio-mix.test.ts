import { describe, expect, it } from "vitest";
import { buildAudioMixFilter, buildNarrationOnlyFilter, estimateDurationFromText } from "../audio-mix";

describe("buildAudioMixFilter", () => {
  it("contains EBU R128 loudness normalization", () => {
    const filter = buildAudioMixFilter({ targetLoudness: -16 });
    expect(filter).toContain("aloudn=I=-16");
  });

  it("contains sidechain compressor for ducking", () => {
    const filter = buildAudioMixFilter({ duckGain: 0.15 });
    expect(filter).toContain("sidechaincompress");
    expect(filter).toContain("avolume=volume=0.15");
  });

  it("contains fade filters when specified", () => {
    const filter = buildAudioMixFilter({ fadeInSeconds: 2, fadeOutSeconds: 3 });
    expect(filter).toContain("afade=t=in:ss=0:d=2");
    expect(filter).toContain("afade=t=out:st=0:d=3");
  });
});

describe("buildNarrationOnlyFilter", () => {
  it("produces a valid single-stream filter", () => {
    const filter = buildNarrationOnlyFilter({ targetLoudness: -20, fadeInSeconds: 1 });
    expect(filter).toContain("aloudn=I=-20");
    expect(filter).toContain("afade=t=in:ss=0:d=1");
  });
});

describe("estimateDurationFromText", () => {
  it("estimates ~60s for 150 words at 150 WPM", () => {
    const text = Array.from({ length: 150 }, (_, i) => `word${i}`).join(" ");
    expect(estimateDurationFromText(text, 150)).toBe(60);
  });

  it("returns 0 for empty text", () => {
    expect(estimateDurationFromText("", 150)).toBe(0);
  });
});
