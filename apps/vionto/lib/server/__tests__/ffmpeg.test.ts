import { describe, expect, it } from "vitest";
import { pickMotionPreset, pickTransitionPreset, buildRenderCommand, buildConcatListContent } from "../ffmpeg";
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
  mode: "cinematic",
  visualStyle: "clean_modern_slideshow",
  resolution: "1080p",
  aspectRatio: "16:9",
  frameRate: 30,
  assets: [
    { storageKey: "img1.jpg", durationSeconds: 5 },
    { storageKey: "img2.jpg", durationSeconds: 5 },
  ],
  audioTracks: [],
  burnSubtitles: false,
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

describe("pickMotionPreset", () => {
  it("cycles through cinematic motions", () => {
    const p0 = pickMotionPreset(0, "cinematic");
    const p1 = pickMotionPreset(1, "cinematic");
    expect(p0.name).toBe("ken_burns");
    expect(p1.name).toBe("pan_left");
  });

  it("returns static for slideshow mode", () => {
    const p = pickMotionPreset(0, "slideshow");
    expect(p.name).toBe("static");
  });

  it("returns zoom presets for social mode", () => {
    const p0 = pickMotionPreset(0, "social");
    expect(p0.name).toBe("zoom_in");
  });
});

describe("pickTransitionPreset", () => {
  it("cycles cinematic transitions", () => {
    const t0 = pickTransitionPreset(0, "cinematic");
    expect(t0.name).toBe("fade");
  });

  it("uses shorter duration for social mode", () => {
    const t = pickTransitionPreset(0, "social");
    expect(t.name).toBe("slide_left");
    expect(t.durationSeconds).toBe(0.3);
  });
});

describe("buildRenderCommand", () => {
  it("returns steps for each asset plus final encode", () => {
    const { steps, concatListPath } = buildRenderCommand(BASE_MANIFEST, "/tmp/work", {
      outputPath: "/tmp/work/out.mp4",
    });
    expect(steps.length).toBe(BASE_MANIFEST.assets.length + 1);
    expect(concatListPath).toBeDefined();
  });

  it("includes subtitle burn-in when requested", () => {
    const manifest = { ...BASE_MANIFEST, burnSubtitles: true };
    const { steps } = buildRenderCommand(manifest, "/tmp/work", {
      outputPath: "/tmp/work/out.mp4",
      srtPath: "/tmp/work/sub.srt",
    });
    const final = steps[steps.length - 1];
    expect(final.some((a) => a.includes("subtitles="))).toBe(true);
  });

  it("escapes Windows subtitle paths for FFmpeg filters", () => {
    const manifest = { ...BASE_MANIFEST, burnSubtitles: true };
    const { steps } = buildRenderCommand(manifest, "C:\\Temp\\work", {
      outputPath: "C:\\Temp\\work\\out.mp4",
      srtPath: "C:\\Users\\saal\\AppData\\Local\\Temp\\vionto-renders\\job\\subtitles.srt",
    });
    const final = steps[steps.length - 1];
    const vfIndex = final.indexOf("-vf");
    expect(vfIndex).toBeGreaterThan(-1);
    expect(final[vfIndex + 1]).toContain("subtitles=filename='C\\:/Users/saal/AppData/Local/Temp/vionto-renders/job/subtitles.srt':original_size=1920x1080");
  });

  it("uses the correct video codec and bitrate", () => {
    const { steps } = buildRenderCommand(BASE_MANIFEST, "/tmp/work", {
      outputPath: "/tmp/work/out.mp4",
    });
    const final = steps[steps.length - 1];
    expect(final).toContain("-c:v");
    expect(final).toContain("libx264");
    expect(final).toContain("-b:v");
    expect(final).toContain("5000k");
  });

  it("renders portrait 1080p as a 9:16 canvas", () => {
    const manifest: RenderManifest = { ...BASE_MANIFEST, aspectRatio: "9:16" };
    const { steps } = buildRenderCommand(manifest, "/tmp/work", {
      outputPath: "/tmp/work/out.mp4",
    });
    const firstSegment = steps[0];
    const final = steps[steps.length - 1];
    const segmentVf = firstSegment[firstSegment.indexOf("-vf") + 1];
    const finalVf = final[final.indexOf("-vf") + 1];

    expect(segmentVf).toContain("scale=1080:1920");
    expect(segmentVf).toContain("pad=1080:1920");
    expect(segmentVf).toContain("s=1080x1920");
    expect(finalVf).toContain("scale=1080:1920");
    expect(finalVf).toContain("pad=1080:1920");
  });

  it("uses portrait dimensions when burning subtitles into a portrait render", () => {
    const manifest: RenderManifest = { ...BASE_MANIFEST, aspectRatio: "9:16", burnSubtitles: true };
    const { steps } = buildRenderCommand(manifest, "/tmp/work", {
      outputPath: "/tmp/work/out.mp4",
      srtPath: "/tmp/work/sub.srt",
    });
    const final = steps[steps.length - 1];
    const vfIndex = final.indexOf("-vf");

    expect(vfIndex).toBeGreaterThan(-1);
    expect(final[vfIndex + 1]).toContain("original_size=1080x1920");
    expect(final[vfIndex + 1]).toContain("Alignment=2");
  });

  it("uses top-center alignment (SSA v4 =6) when subtitle position is top", () => {
    const topStyle: SubtitleStyle = { ...BASE_SUBTITLE_STYLE, position: "top", marginV: 40 };
    const manifest: RenderManifest = { ...BASE_MANIFEST, aspectRatio: "1:1", burnSubtitles: true, subtitleStyle: topStyle };
    const { steps } = buildRenderCommand(manifest, "/tmp/work", {
      outputPath: "/tmp/work/out.mp4",
      srtPath: "/tmp/work/sub.srt",
    });
    const final = steps[steps.length - 1];
    expect(final[final.indexOf("-vf") + 1]).toContain("Alignment=6");
    expect(final[final.indexOf("-vf") + 1]).toContain("MarginV=40");
  });

  it("uses center alignment (SSA v4 =10) when subtitle position is center", () => {
    const centerStyle: SubtitleStyle = { ...BASE_SUBTITLE_STYLE, position: "center", marginV: 0 };
    const manifest: RenderManifest = { ...BASE_MANIFEST, aspectRatio: "1:1", burnSubtitles: true, subtitleStyle: centerStyle };
    const { steps } = buildRenderCommand(manifest, "/tmp/work", {
      outputPath: "/tmp/work/out.mp4",
      srtPath: "/tmp/work/sub.srt",
    });
    const final = steps[steps.length - 1];
    expect(final[final.indexOf("-vf") + 1]).toContain("Alignment=10");
  });

  it("renders square 1080p as a 1:1 canvas", () => {
    const manifest: RenderManifest = { ...BASE_MANIFEST, aspectRatio: "1:1" };
    const { steps } = buildRenderCommand(manifest, "/tmp/work", {
      outputPath: "/tmp/work/out.mp4",
    });
    const firstSegment = steps[0];
    const segmentVf = firstSegment[firstSegment.indexOf("-vf") + 1];

    expect(segmentVf).toContain("scale=1080:1080");
    expect(segmentVf).toContain("pad=1080:1080");
    expect(segmentVf).toContain("s=1080x1080");
  });

  it("includes narration and music inputs when both are materialized", () => {
    const { steps } = buildRenderCommand(BASE_MANIFEST, "/tmp/work", {
      outputPath: "/tmp/work/out.mp4",
      narrationWavPath: "/tmp/work/narration.mp3",
      musicPath: "/tmp/work/music.mp3",
    });
    const final = steps[steps.length - 1];
    expect(final).toContain("/tmp/work/narration.mp3");
    expect(final).toContain("/tmp/work/music.mp3");
    expect(final).toContain("-filter_complex");
    expect(final).toContain("[1:a]volume=1.0[narration];[2:a]volume=0.06[music];[narration][music]amix=inputs=2:duration=first:dropout_transition=3:normalize=0[aout]");
    expect(final).toContain("-map");
    expect(final).toContain("[aout]");
  });

  it("adds visual style filters for selected presets", () => {
    const manifest: RenderManifest = { ...BASE_MANIFEST, visualStyle: "film_grain" };
    const { steps } = buildRenderCommand(manifest, "/tmp/work", {
      outputPath: "/tmp/work/out.mp4",
    });
    const final = steps[steps.length - 1];
    const vfIndex = final.indexOf("-vf");
    expect(vfIndex).toBeGreaterThan(-1);
    expect(final[vfIndex + 1]).toContain("noise=alls=8");
  });
});

describe("buildConcatListContent", () => {
  it("formats paths with single-quoting", () => {
    const content = buildConcatListContent(["/tmp/seg_0000.mp4", "/tmp/seg_0001.mp4"]);
    expect(content).toContain("file '/tmp/seg_0000.mp4'");
    expect(content).toContain("file '/tmp/seg_0001.mp4'");
  });
});
