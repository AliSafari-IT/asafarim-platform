import { afterEach, beforeEach, describe, expect, it } from "vitest";

import {
  SharedAlbumError,
  parseSharedAlbumUrl,
  resolveSharedAlbum,
} from "../google-photos/shared-album";

describe("parseSharedAlbumUrl", () => {
  it("parses a short app.goo.gl link", () => {
    const parsed = parseSharedAlbumUrl("https://photos.app.goo.gl/AbCdEf123");
    expect(parsed.shareToken).toBe("AbCdEf123");
  });

  it("parses a photos.google.com/share link", () => {
    const parsed = parseSharedAlbumUrl(
      "https://photos.google.com/share/AF1QipMexample?key=abc",
    );
    expect(parsed.shareToken).toBe("AF1QipMexample");
  });

  it("rejects non-Google hosts", () => {
    expect(() => parseSharedAlbumUrl("https://evil.example.com/share/x")).toThrow(
      SharedAlbumError,
    );
  });

  it("rejects http (non-https) links", () => {
    expect(() => parseSharedAlbumUrl("http://photos.app.goo.gl/x")).toThrow(SharedAlbumError);
  });

  it("rejects garbage input", () => {
    expect(() => parseSharedAlbumUrl("not a url")).toThrow(SharedAlbumError);
  });
});

describe("resolveSharedAlbum", () => {
  const original = process.env.GOOGLE_PHOTOS_SHARING_ENABLED;
  beforeEach(() => {
    delete process.env.GOOGLE_PHOTOS_SHARING_ENABLED;
  });
  afterEach(() => {
    process.env.GOOGLE_PHOTOS_SHARING_ENABLED = original;
  });

  it("falls back to the picker when sharing is not enabled", async () => {
    const result = await resolveSharedAlbum(
      "https://photos.app.goo.gl/AbCdEf123",
      "access-token",
    );
    expect(result.mode).toBe("fallback");
    if (result.mode === "fallback") {
      expect(result.reason).toBe("not_enabled");
      expect(result.parsed.shareToken).toBe("AbCdEf123");
    }
  });
});
