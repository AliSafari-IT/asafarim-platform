import { describe, expect, it } from "vitest";
import {
  createProjectSchema,
  updateProjectSchema,
  presignRequestSchema,
  uploadCompleteSchema,
  zipImportSchema,
  promoteSessionSchema,
  storyGenerateSchema,
  storyUpdateSchema,
  renderManifestSchema,
  safeParseManifest,
  paginationQuerySchema,
  jobPollResponseSchema,
  sseEventSchema,
  audioTrackCreateSchema,
  ttsPreviewSchema,
  shareExportSchema,
  formatZodError,
} from "@asafarim/vionto-schemas";

describe("createProjectSchema", () => {
  it("accepts a minimal valid project", () => {
    const result = createProjectSchema.safeParse({
      title: "My Video",
      mode: "story",
      locale: "en",
      aspectRatio: "16:9",
      resolution: "1080p",
    });
    expect(result.success).toBe(true);
    if (result.success) expect(result.data.title).toBe("My Video");
  });

  it("rejects empty title", () => {
    const result = createProjectSchema.safeParse({ title: "" });
    expect(result.success).toBe(false);
  });

  it("rejects overly long title", () => {
    const result = createProjectSchema.safeParse({ title: "a".repeat(121) });
    expect(result.success).toBe(false);
  });
});

describe("updateProjectSchema", () => {
  it("accepts partial updates", () => {
    const result = updateProjectSchema.safeParse({ locale: "nl" });
    expect(result.success).toBe(true);
  });
});

describe("paginationQuerySchema", () => {
  it("defaults page and pageSize", () => {
    const result = paginationQuerySchema.safeParse({});
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.page).toBe(1);
      expect(result.data.pageSize).toBe(20);
    }
  });

  it("coerces string numbers", () => {
    const result = paginationQuerySchema.safeParse({ page: "3", pageSize: "50" });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.page).toBe(3);
      expect(result.data.pageSize).toBe(50);
    }
  });
});

describe("presignRequestSchema", () => {
  it("requires valid mime type and size", () => {
    const result = presignRequestSchema.safeParse({
      filename: "photo.jpg",
      contentType: "image/jpeg",
      sizeBytes: 1024,
    });
    expect(result.success).toBe(true);
  });

  it("rejects unknown mime type", () => {
    const result = presignRequestSchema.safeParse({
      filename: "file.exe",
      contentType: "application/octet-stream",
      sizeBytes: 1024,
    });
    expect(result.success).toBe(false);
  });
});

describe("promoteSessionSchema", () => {
  it("accepts minimal payload with sessionId", () => {
    const result = promoteSessionSchema.safeParse({
      sessionId: "sess-123",
    });
    expect(result.success).toBe(true);
  });

  it("accepts orderedKeys array", () => {
    const result = promoteSessionSchema.safeParse({
      sessionId: "sess-123",
      orderedKeys: ["key1", "key2", "key3"],
    });
    expect(result.success).toBe(true);
  });

  it("accepts clearSession flag", () => {
    const result = promoteSessionSchema.safeParse({
      sessionId: "sess-123",
      clearSession: false,
    });
    expect(result.success).toBe(true);
  });

  it("rejects too many orderedKeys", () => {
    const result = promoteSessionSchema.safeParse({
      sessionId: "sess-123",
      orderedKeys: Array.from({ length: 201 }, (_, i) => `key${i}`),
    });
    expect(result.success).toBe(false);
  });
});

describe("storyGenerateSchema", () => {
  it("requires projectId", () => {
    const result = storyGenerateSchema.safeParse({});
    expect(result.success).toBe(false);
  });

  it("accepts full payload", () => {
    const result = storyGenerateSchema.safeParse({
      projectId: "proj-1",
      locale: "en-US",
      mode: "story",
      userNotes: "Make it dramatic",
      totalDurationMs: 60_000,
    });
    expect(result.success).toBe(true);
  });
});

describe("storyUpdateSchema", () => {
  it("accepts partial updates", () => {
    const result = storyUpdateSchema.safeParse({ narrationText: "Hello world" });
    expect(result.success).toBe(true);
  });
});

describe("renderManifestSchema", () => {
  it("accepts minimal manifest with defaults", () => {
    const result = safeParseManifest({
      projectId: "p1",
      userId: "u1",
      jobId: "j1",
      assets: [{ storageKey: "img.jpg" }],
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.mode).toBe("cinematic");
      expect(result.data.frameRate).toBe(30);
      expect(result.data.videoCodec).toBe("libx264");
    }
  });

  it("rejects missing projectId", () => {
    const result = safeParseManifest({ userId: "u1", jobId: "j1", assets: [{ storageKey: "k" }] });
    expect(result.success).toBe(false);
  });

  it("rejects too many assets", () => {
    const result = safeParseManifest({
      projectId: "p1",
      userId: "u1",
      jobId: "j1",
      assets: Array.from({ length: 201 }, (_, i) => ({ storageKey: `k${i}` })),
    });
    expect(result.success).toBe(false);
  });
});

describe("jobPollResponseSchema", () => {
  it("validates a completed job response", () => {
    const result = jobPollResponseSchema.safeParse({
      jobId: "j1",
      state: "completed",
      progressPercent: 100,
      retryCount: 0,
      errorSummary: null,
      logs: null,
      startedAt: new Date().toISOString(),
      completedAt: new Date().toISOString(),
      exports: [],
    });
    expect(result.success).toBe(true);
  });

  it("rejects invalid state", () => {
    const result = jobPollResponseSchema.safeParse({
      jobId: "j1",
      state: "done",
      progressPercent: 100,
      retryCount: 0,
      errorSummary: null,
      logs: null,
      startedAt: null,
      completedAt: null,
      exports: [],
    });
    expect(result.success).toBe(false);
  });
});

describe("sseEventSchema", () => {
  it("validates a progress event", () => {
    const result = sseEventSchema.safeParse({
      event: "progress",
      jobId: "j1",
      data: { percent: 50 },
      timestamp: new Date().toISOString(),
    });
    expect(result.success).toBe(true);
  });
});

describe("audioTrackCreateSchema", () => {
  it("requires projectId and storageKey", () => {
    const result = audioTrackCreateSchema.safeParse({
      projectId: "p1",
      type: "music",
      storageKey: "music.mp3",
    });
    expect(result.success).toBe(true);
  });

  it("defaults volume to 1", () => {
    const result = audioTrackCreateSchema.safeParse({
      projectId: "p1",
      type: "narration",
      storageKey: "narr.mp3",
    });
    expect(result.success).toBe(true);
    if (result.success) expect(result.data.volume).toBe(1);
  });
});

describe("ttsPreviewSchema", () => {
  it("requires text and voiceId", () => {
    const result = ttsPreviewSchema.safeParse({
      text: "Hello world",
      voiceId: "alloy",
    });
    expect(result.success).toBe(true);
  });

  it("rejects empty text", () => {
    const result = ttsPreviewSchema.safeParse({ text: "", voiceId: "alloy" });
    expect(result.success).toBe(false);
  });
});

describe("shareExportSchema", () => {
  it("defaults expiryHours to 24", () => {
    const result = shareExportSchema.safeParse({});
    expect(result.success).toBe(true);
    if (result.success) expect(result.data.expiryHours).toBe(24);
  });

  it("rejects too many hours", () => {
    const result = shareExportSchema.safeParse({ expiryHours: 200 });
    expect(result.success).toBe(false);
  });
});

describe("formatZodError", () => {
  it("returns semicolon-separated issue messages", () => {
    const result = createProjectSchema.safeParse({ description: "x".repeat(2001) });
    expect(result.success).toBe(false);
    if (!result.success) {
      const msg = formatZodError(result.error);
      expect(msg).toContain("title:");
      expect(msg).toContain("description:");
      expect(msg).toContain(";");
    }
  });
});
