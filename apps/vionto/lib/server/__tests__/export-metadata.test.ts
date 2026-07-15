import { describe, expect, it } from "vitest";
import { aspectLabelForRatio, buildExportFilename, buildExportMetadata, extractStoryKeywords } from "../export-metadata";
import type { RenderManifest, SubtitleStyle } from "../render-manifest";

const BASE_SUBTITLE_STYLE: SubtitleStyle = {
  fontName: "Arial",
  fontSize: 24,
  fontWeight: "normal",
  color: "white",
  outlineColor: "black",
  outlineWidth: 2,
  backgroundColor: "transparent",
  backgroundOpacity: 0,
  borderRadius: 0,
  padding: 4,
  shadow: false,
  shadowColor: "#000000",
  shadowOffset: 2,
  position: "bottom",
  alignment: "center",
  marginV: 40,
  marginH: 40,
  maxLineWidth: 42,
  maxLines: 2,
  textTransform: "preserve",
};

const BASE_MANIFEST: RenderManifest = {
  projectId: "p1",
  userId: "u1",
  jobId: "j1",
  mode: "social",
  visualStyle: "clean_modern_slideshow",
  targetDurationSeconds: 10,
  aspectRatio: "1:1",
  resolution: "1080p",
  frameRate: 30,
  assets: [{ storageKey: "img.jpg", durationSeconds: 5 }],
  audioTracks: [],
  narrationText: "Focus on the targets, focus on every small victory, and keep the targets bright.",
  burnSubtitles: true,
  subtitleStyle: BASE_SUBTITLE_STYLE,
  subtitleTiming: {
    maxCharsPerSegment: 80,
    minDisplayMs: 1200,
    maxDisplayMs: 7000,
    gapMs: 100,
    splitOnPunctuation: true,
    splitLongSentences: true,
  },
  subtitleExport: {
    burnIn: true,
    exportSrt: false,
    exportVtt: false,
  },
  outputFormat: "mp4",
  videoCodec: "libx264",
  audioCodec: "aac",
  videoBitrate: "5000k",
  audioBitrate: "192k",
  maxRetries: 3,
  workerTimeoutSeconds: 600,
};

describe("export metadata helpers", () => {
  it("maps aspect labels", () => {
    expect(aspectLabelForRatio("16:9")).toBe("landscape");
    expect(aspectLabelForRatio("9:16")).toBe("portrait");
    expect(aspectLabelForRatio("1:1")).toBe("1by1");
  });

  it("extracts three story keywords", () => {
    expect(extractStoryKeywords(BASE_MANIFEST.narrationText)).toEqual(["targets", "focus", "victory"]);
  });

  it("builds predictable filenames", () => {
    const filename = buildExportFilename({
      mode: "social",
      aspectRatio: "1:1",
      keywords: ["targets", "focus", "victory"],
      date: new Date("2026-05-09T13:13:40Z"),
    });
    expect(filename).toBe("social_1by1_targets_focus_victory_20260509-151340.mp4");
  });

  it("builds preview copy with metadata", () => {
    const metadata = buildExportMetadata({
      manifest: BASE_MANIFEST,
      projectTitle: "May2026",
      date: new Date("2026-05-09T13:13:40Z"),
    });
    expect(metadata.filename).toBe("social_1by1_targets_focus_victory_20260509-151340.mp4");
    expect(metadata.previewTitle).toBe("May2026 social render");
    expect(metadata.previewSubtitle).toContain("Latest clean modern slideshow social 1:1 render");
  });
});
