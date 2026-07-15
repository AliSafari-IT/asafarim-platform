import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { NormalizedMediaItem } from "../google-photos/types";

// ── Mock the storage / session / exif boundaries ────────────────────────────
const { state, mocks } = vi.hoisted(() => {
  const state = {
    session: { assets: [] as Array<Record<string, unknown>> },
  };
  const mocks = {
    getSessionForUser: vi.fn(() => state.session),
    addAssetToSession: vi.fn((_id: string, asset: Record<string, unknown>) => {
      state.session.assets.push(asset);
      return state.session;
    }),
    buildKey: vi.fn(
      (userId: string, _cat: string, sessionId: string, filename: string) =>
        `vionto/${userId}/sessions/${sessionId}/uuid/${filename}`,
    ),
    putObjectBytes: vi.fn(async (key: string) => `https://cdn/${key}`),
    extractDimensions: vi.fn(() => ({ width: 100, height: 80 })),
    extractExif: vi.fn(() => ({ Make: "Canon" })),
  };
  return { state, mocks };
});

vi.mock("../upload-session", () => ({
  getSessionForUser: mocks.getSessionForUser,
  addAssetToSession: mocks.addAssetToSession,
}));
vi.mock("../storage", () => ({
  buildKey: mocks.buildKey,
  putObjectBytes: mocks.putObjectBytes,
}));
vi.mock("../exif", () => ({
  extractDimensions: mocks.extractDimensions,
  extractExif: mocks.extractExif,
}));

import { importMediaItems } from "../google-photos/ingest";

function item(overrides: Partial<NormalizedMediaItem> = {}): NormalizedMediaItem {
  return {
    googleId: "g1",
    baseUrl: "https://lh3.google/photo1",
    mimeType: "image/jpeg",
    filename: "photo1.jpg",
    ...overrides,
  };
}

describe("importMediaItems", () => {
  beforeEach(() => {
    state.session.assets = [];
    vi.clearAllMocks();
    mocks.getSessionForUser.mockReturnValue(state.session);
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        new Response(new Uint8Array([1, 2, 3, 4]), {
          status: 200,
          headers: { "content-type": "image/jpeg" },
        }),
      ),
    );
  });
  afterEach(() => vi.unstubAllGlobals());

  it("downloads, stores, and stages a supported image", async () => {
    const summary = await importMediaItems("u1", "sess1", [item()], { concurrency: 1 });
    expect(summary.imported).toBe(1);
    expect(mocks.putObjectBytes).toHaveBeenCalledOnce();
    const staged = state.session.assets[0];
    expect(staged.key).toContain("vionto/u1/sessions/sess1/");
    expect((staged.exif as Record<string, unknown>).googlePhotosId).toBe("g1");
    expect((staged.exif as Record<string, unknown>).source).toBe("google_photos");
  });

  it("appends =d to a base URL without size params", async () => {
    await importMediaItems("u1", "sess1", [item()], { concurrency: 1 });
    const calledUrl = (globalThis.fetch as ReturnType<typeof vi.fn>).mock.calls[0][0];
    expect(calledUrl).toBe("https://lh3.google/photo1=d");
  });

  it("skips unsupported mime types", async () => {
    const summary = await importMediaItems(
      "u1",
      "sess1",
      [item({ mimeType: "video/mp4", filename: "clip.mp4" })],
      { concurrency: 1 },
    );
    expect(summary.skipped).toBe(1);
    expect(summary.results[0]).toMatchObject({ status: "skipped", reason: "unsupported_type" });
    expect(mocks.putObjectBytes).not.toHaveBeenCalled();
  });

  it("dedupes items already imported in the session", async () => {
    state.session.assets.push({ exif: { googlePhotosId: "g1" } });
    const summary = await importMediaItems("u1", "sess1", [item()], { concurrency: 1 });
    expect(summary.skipped).toBe(1);
    expect(summary.results[0]).toMatchObject({ status: "skipped", reason: "duplicate" });
  });

  it("dedupes duplicates within the same batch", async () => {
    const summary = await importMediaItems(
      "u1",
      "sess1",
      [item(), item()],
      { concurrency: 1 },
    );
    expect(summary.imported).toBe(1);
    expect(summary.skipped).toBe(1);
  });

  it("records a per-item failure on download error without throwing", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(new Response("nope", { status: 404 })),
    );
    const summary = await importMediaItems("u1", "sess1", [item()], { concurrency: 1 });
    expect(summary.failed).toBe(1);
    expect(summary.results[0].status).toBe("failed");
  });

  it("throws when the upload session is missing", async () => {
    mocks.getSessionForUser.mockReturnValue(undefined as unknown as typeof state.session);
    await expect(importMediaItems("u1", "missing", [item()])).rejects.toThrow(/session/i);
  });
});
