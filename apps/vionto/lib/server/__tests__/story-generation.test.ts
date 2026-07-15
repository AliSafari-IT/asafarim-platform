import { describe, expect, it } from "vitest";

import {
  buildStorySystemPrompt,
  buildStoryUserPrompt,
} from "../story-generation";

describe("buildStorySystemPrompt", () => {
  it("mentions JSON-only output and locale", () => {
    const prompt = buildStorySystemPrompt("nl-BE");
    expect(prompt).toContain("JSON");
    expect(prompt).toContain("narration");
    expect(prompt).toContain("srt");
  });
});

describe("buildStoryUserPrompt snapshots", () => {
  it("matches snapshot for cinematic story with captions and exif", () => {
    const prompt = buildStoryUserPrompt({
      locale: "en",
      mode: "story",
      userNotes: "Make it nostalgic.",
      captions: ["Sunset over the canal", "Family dinner"],
      exifSummary: "Canon EOS R5, 2023-07-14, Amsterdam",
    });
    expect(prompt).toMatchInlineSnapshot(`
      "Locale: en
      Mode: story
      User notes: Make it nostalgic.
      Image captions: Sunset over the canal; Family dinner
      Photo metadata: Canon EOS R5, 2023-07-14, Amsterdam

      Instructions:
      - Write a cohesive narration that flows across the provided images.
      - Target video duration: 30 seconds. Write narration of approximately 75 words so the spoken voiceover fits within that duration.
      - The SRT output should have one cue per sentence, with timing that spans the full 30 seconds. Do not exceed 30 seconds in total SRT duration.
      - Escape angle brackets in SRT text as &lt; and &gt;.
      - Do not include empty lines inside a cue text block.
      - Output JSON only."
    `);
  });

  it("matches snapshot for minimal slideshow without extras", () => {
    const prompt = buildStoryUserPrompt({
      locale: "fr",
      mode: "slideshow",
    });
    expect(prompt).toMatchInlineSnapshot(`
      "Locale: fr
      Mode: slideshow

      Instructions:
      - Write a cohesive narration that flows across the provided images.
      - Target video duration: 30 seconds. Write narration of approximately 75 words so the spoken voiceover fits within that duration.
      - The SRT output should have one cue per sentence, with timing that spans the full 30 seconds. Do not exceed 30 seconds in total SRT duration.
      - Escape angle brackets in SRT text as &lt; and &gt;.
      - Do not include empty lines inside a cue text block.
      - Output JSON only."
    `);
  });
});
