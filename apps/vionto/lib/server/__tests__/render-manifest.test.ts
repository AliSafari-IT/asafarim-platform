import { describe, expect, it } from "vitest";
import { parseManifest, safeParseManifest } from "../render-manifest";

describe("parseManifest", () => {
  it("accepts a minimal valid manifest", () => {
    const manifest = parseManifest({
      projectId: "proj-1",
      userId: "user-1",
      jobId: "job-1",
      assets: [{ storageKey: "s3://bucket/img1.jpg" }],
    });
    expect(manifest.projectId).toBe("proj-1");
    expect(manifest.mode).toBe("cinematic");
    expect(manifest.visualStyle).toBe("clean_modern_slideshow");
    expect(manifest.assets).toHaveLength(1);
  });

  it("defaults mode, resolution, and frameRate", () => {
    const manifest = parseManifest({
      projectId: "p",
      userId: "u",
      jobId: "j",
      assets: [{ storageKey: "k" }],
    });
    expect(manifest.mode).toBe("cinematic");
    expect(manifest.resolution).toBe("1080p");
    expect(manifest.frameRate).toBe(30);
    expect(manifest.videoCodec).toBe("libx264");
    expect(manifest.audioCodec).toBe("aac");
  });

  it("parses audio tracks with ducking", () => {
    const manifest = parseManifest({
      projectId: "p",
      userId: "u",
      jobId: "j",
      assets: [{ storageKey: "k" }],
      audioTracks: [
        { storageKey: "narr.mp3", type: "narration", volume: 1 },
        { storageKey: "bgm.mp3", type: "music", volume: 0.3, duckGainDuringNarration: 0.1 },
      ],
    });
    expect(manifest.audioTracks).toHaveLength(2);
    expect(manifest.audioTracks[1].duckGainDuringNarration).toBe(0.1);
  });

  it("accepts a generated narration voice preference without a stored audio file", () => {
    const manifest = parseManifest({
      projectId: "p",
      userId: "u",
      jobId: "j",
      assets: [{ storageKey: "k" }],
      narrationText: "Hello from the saved script.",
      audioTracks: [{ type: "narration", voiceId: "nova", voiceName: "Nova" }],
    });

    expect(manifest.audioTracks[0].voiceId).toBe("nova");
    expect(manifest.audioTracks[0].storageKey).toBeUndefined();
  });

  it("rejects empty assets array", () => {
    expect(() =>
      parseManifest({
        projectId: "p",
        userId: "u",
        jobId: "j",
        assets: [],
      })
    ).toThrow();
  });

  it("rejects too many assets", () => {
    expect(() =>
      parseManifest({
        projectId: "p",
        userId: "u",
        jobId: "j",
        assets: Array.from({ length: 201 }, (_, i) => ({ storageKey: `k${i}` })),
      })
    ).toThrow();
  });
});

describe("safeParseManifest", () => {
  it("returns error for missing projectId", () => {
    const result = safeParseManifest({
      userId: "u",
      jobId: "j",
      assets: [{ storageKey: "k" }],
    });
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues.some((i) => i.path.includes("projectId"))).toBe(true);
    }
  });
});
