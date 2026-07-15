import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { buildAuthUrl, exchangeCode, refreshAccessToken } from "../google-photos/oauth";

function setConfigEnv() {
  process.env.GOOGLE_PHOTOS_CLIENT_ID = "client-id";
  process.env.GOOGLE_PHOTOS_CLIENT_SECRET = "client-secret";
  process.env.GOOGLE_PHOTOS_REDIRECT_URI = "https://app/callback";
  process.env.GOOGLE_PHOTOS_SCOPES =
    "https://www.googleapis.com/auth/photospicker.mediaitems.readonly";
}

describe("google-photos oauth", () => {
  beforeEach(setConfigEnv);
  afterEach(() => vi.unstubAllGlobals());

  it("builds a consent URL with offline access + consent prompt", () => {
    const url = new URL(buildAuthUrl("signed-state"));
    expect(url.origin + url.pathname).toBe("https://accounts.google.com/o/oauth2/v2/auth");
    expect(url.searchParams.get("client_id")).toBe("client-id");
    expect(url.searchParams.get("redirect_uri")).toBe("https://app/callback");
    expect(url.searchParams.get("access_type")).toBe("offline");
    expect(url.searchParams.get("prompt")).toBe("consent");
    expect(url.searchParams.get("state")).toBe("signed-state");
    expect(url.searchParams.get("scope")).toContain("photospicker.mediaitems.readonly");
  });

  it("exchanges a code into normalized tokens with absolute expiry", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        new Response(
          JSON.stringify({
            access_token: "at",
            refresh_token: "rt",
            expires_in: 3600,
            scope: "openid email",
          }),
          { status: 200 },
        ),
      ),
    );
    const tokens = await exchangeCode("the-code");
    expect(tokens.accessToken).toBe("at");
    expect(tokens.refreshToken).toBe("rt");
    expect(tokens.scopes).toEqual(["openid", "email"]);
    expect(tokens.expiresAt.getTime()).toBeGreaterThan(Date.now());
  });

  it("refreshes an access token", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        new Response(JSON.stringify({ access_token: "new-at", expires_in: 3600 }), {
          status: 200,
        }),
      ),
    );
    const refreshed = await refreshAccessToken("rt");
    expect(refreshed.accessToken).toBe("new-at");
    expect(refreshed.expiresAt.getTime()).toBeGreaterThan(Date.now());
  });

  it("throws a clear error when config is missing", async () => {
    delete process.env.GOOGLE_PHOTOS_CLIENT_ID;
    await expect(exchangeCode("x")).rejects.toThrow(/not configured/i);
  });
});
