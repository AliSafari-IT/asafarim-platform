import { describe, expect, it, vi } from "vitest";
import {
  MAX_ACCOUNT_AVATAR_BYTES,
  googleAvatarAtSize,
  loadAccountAvatar,
  resolveAccountAvatar,
  sniffAvatarType,
} from "./accountAvatar";

const USER = "cmabc12345xyz";
const REMOTE = "https://asafarim.ams3.digitaloceanspaces.com/";
const LOCAL = "/api/storage/local?key=";
const UUID = "4f9c1d2e-8a7b-4c3d-9e0f-112233445566";

const JPEG = new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 0, 0x10]);
const PNG = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0]);
const WEBP = new TextEncoder().encode("RIFF\0\0\0\0WEBPVP8 ");
const SVG = new TextEncoder().encode('<svg xmlns="http://www.w3.org/2000/svg"/>');
const GIF = new TextEncoder().encode("GIF89a....");

describe("resolveAccountAvatar", () => {
  it("reads a Hub upload from storage by key, remote or local", () => {
    expect(
      resolveAccountAvatar(`${REMOTE}hub/avatars/cmabc123/${UUID}.png`, USER, REMOTE)
    ).toEqual({ kind: "storage", key: `hub/avatars/cmabc123/${UUID}.png` });
    expect(
      resolveAccountAvatar(
        `${LOCAL}${encodeURIComponent(`hub/avatars/cmabc123/${UUID}.jpg`)}`,
        USER,
        LOCAL
      )
    ).toEqual({ kind: "storage", key: `hub/avatars/cmabc123/${UUID}.jpg` });
  });

  it("refuses another user's avatar, other folders, traversal and SVG/GIF keys", () => {
    for (const key of [
      `hub/avatars/someone1/${UUID}.png`,
      `resumatch/profile-photos/ws1/${UUID}.jpg`,
      `hub/avatars/cmabc123/../../resumatch/x.jpg`,
      `hub/avatars/cmabc123/${UUID}.svg`,
      `hub/avatars/cmabc123/${UUID}.gif`,
    ]) {
      expect(resolveAccountAvatar(`${REMOTE}${key}`, USER, REMOTE)).toBeNull();
      expect(
        resolveAccountAvatar(`${LOCAL}${encodeURIComponent(key)}`, USER, LOCAL)
      ).toBeNull();
    }
  });

  it("fetches only Google profile pictures, at a croppable size", () => {
    expect(
      resolveAccountAvatar("https://lh3.googleusercontent.com/a/ACg8ocK=s96-c", USER, REMOTE)
    ).toEqual({
      kind: "google",
      url: "https://lh3.googleusercontent.com/a/ACg8ocK=s800-c",
    });
  });

  it("never fetches an arbitrary URL (SSRF)", () => {
    for (const url of [
      "http://lh3.googleusercontent.com/a/x=s96-c",
      "https://lh3.googleusercontent.com:8443/a/x",
      "https://user:pw@lh3.googleusercontent.com/a/x",
      "https://lh3.googleusercontent.com.evil.test/a/x",
      "https://evil.test/lh3.googleusercontent.com/a/x",
      "http://169.254.169.254/latest/meta-data/",
      "http://localhost:3012/api/profile/photo",
      "file:///etc/passwd",
      "data:image/png;base64,AAAA",
      "not a url",
      "",
    ]) {
      expect(resolveAccountAvatar(url, USER, REMOTE)).toBeNull();
    }
    expect(resolveAccountAvatar(null, USER, REMOTE)).toBeNull();
    expect(
      resolveAccountAvatar(`${REMOTE}hub/avatars/cmabc123/${UUID}.png`, "", REMOTE)
    ).toBeNull();
  });
});

describe("googleAvatarAtSize", () => {
  it("replaces or adds the size and drops the query", () => {
    expect(
      googleAvatarAtSize(new URL("https://lh3.googleusercontent.com/a/X=s96-c-mo?sz=50"))
    ).toBe("https://lh3.googleusercontent.com/a/X=s800-c");
    expect(googleAvatarAtSize(new URL("https://lh3.googleusercontent.com/a/X"))).toBe(
      "https://lh3.googleusercontent.com/a/X=s800-c"
    );
  });
});

describe("sniffAvatarType", () => {
  it("knows JPEG, PNG and WebP by their bytes and refuses SVG and GIF", () => {
    expect(sniffAvatarType(JPEG)).toBe("image/jpeg");
    expect(sniffAvatarType(PNG)).toBe("image/png");
    expect(sniffAvatarType(WEBP)).toBe("image/webp");
    expect(sniffAvatarType(SVG)).toBeNull();
    expect(sniffAvatarType(GIF)).toBeNull();
    expect(sniffAvatarType(new Uint8Array())).toBeNull();
  });
});

describe("loadAccountAvatar", () => {
  const noFetch = vi.fn(async () => {
    throw new Error("must not fetch");
  }) as unknown as typeof fetch;

  it("reads storage without any HTTP request", async () => {
    const result = await loadAccountAvatar(
      { kind: "storage", key: "hub/avatars/cmabc123/a.png" },
      { readObject: async () => ({ body: PNG }), fetch: noFetch }
    );
    expect(result).toEqual({ ok: true, bytes: PNG, contentType: "image/png" });
    expect(noFetch).not.toHaveBeenCalled();
  });

  it("reports a missing object and refuses an SVG stored under .png", async () => {
    expect(
      await loadAccountAvatar(
        { kind: "storage", key: "k" },
        { readObject: async () => null, fetch: noFetch }
      )
    ).toEqual({ ok: false, reason: "NOT_FOUND" });
    expect(
      await loadAccountAvatar(
        { kind: "storage", key: "k" },
        { readObject: async () => ({ body: SVG }), fetch: noFetch }
      )
    ).toEqual({ ok: false, reason: "UNSUPPORTED" });
  });

  it("fetches Google without following redirects", async () => {
    const fetchMock = vi.fn(async () => new Response(JPEG, { status: 200 }));
    const result = await loadAccountAvatar(
      { kind: "google", url: "https://lh3.googleusercontent.com/a/X=s800-c" },
      { readObject: async () => null, fetch: fetchMock as unknown as typeof fetch }
    );
    expect(result.ok).toBe(true);
    const init = (fetchMock.mock.calls[0] as unknown as [string, RequestInit])[1];
    expect(init.redirect).toBe("error");
    expect(init.signal).toBeDefined();
  });

  it("stops reading past the byte cap and maps failures", async () => {
    const big = new Uint8Array(MAX_ACCOUNT_AVATAR_BYTES + 1);
    big.set(JPEG);
    const deps = (response: Response | Error) => ({
      readObject: async () => null,
      fetch: (async () => {
        if (response instanceof Error) throw response;
        return response;
      }) as unknown as typeof fetch,
    });
    const source = { kind: "google" as const, url: "https://lh3.googleusercontent.com/a/X" };
    expect(await loadAccountAvatar(source, deps(new Response(big)))).toEqual({
      ok: false,
      reason: "TOO_LARGE",
    });
    expect(
      await loadAccountAvatar(source, deps(new Response("", { status: 404 })))
    ).toEqual({ ok: false, reason: "NOT_FOUND" });
    expect(
      await loadAccountAvatar(source, deps(new Response("", { status: 500 })))
    ).toEqual({ ok: false, reason: "UNAVAILABLE" });
    expect(await loadAccountAvatar(source, deps(new TypeError("redirect")))).toEqual({
      ok: false,
      reason: "UNAVAILABLE",
    });
  });
});
