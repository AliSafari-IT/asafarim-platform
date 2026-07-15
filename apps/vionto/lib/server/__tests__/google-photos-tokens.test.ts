import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const { mocks } = vi.hoisted(() => ({
  mocks: {
    getGooglePhotosConnection: vi.fn(),
    updateGooglePhotosAccessToken: vi.fn(),
    markGooglePhotosConnectionError: vi.fn(),
    refreshAccessToken: vi.fn(),
  },
}));

vi.mock("../google-photos/connection", () => ({
  getGooglePhotosConnection: mocks.getGooglePhotosConnection,
  updateGooglePhotosAccessToken: mocks.updateGooglePhotosAccessToken,
  markGooglePhotosConnectionError: mocks.markGooglePhotosConnectionError,
}));
vi.mock("../google-photos/oauth", () => ({
  refreshAccessToken: mocks.refreshAccessToken,
}));

import {
  GooglePhotosAuthError,
  getValidGooglePhotosAccessToken,
} from "../google-photos/tokens";

const future = () => new Date(Date.now() + 60 * 60 * 1000);
const past = () => new Date(Date.now() - 60 * 1000);

describe("getValidGooglePhotosAccessToken", () => {
  beforeEach(() => vi.clearAllMocks());
  afterEach(() => vi.clearAllMocks());

  it("returns the stored token when it is still valid", async () => {
    mocks.getGooglePhotosConnection.mockResolvedValue({
      accessToken: "valid-token",
      refreshToken: "rt",
      expiresAt: future(),
      status: "active",
    });
    expect(await getValidGooglePhotosAccessToken("u1")).toBe("valid-token");
    expect(mocks.refreshAccessToken).not.toHaveBeenCalled();
  });

  it("refreshes and persists when the token is expired", async () => {
    mocks.getGooglePhotosConnection.mockResolvedValue({
      accessToken: "old",
      refreshToken: "rt",
      expiresAt: past(),
      status: "active",
    });
    mocks.refreshAccessToken.mockResolvedValue({
      accessToken: "fresh",
      expiresAt: future(),
      scopes: null,
    });
    const token = await getValidGooglePhotosAccessToken("u1");
    expect(token).toBe("fresh");
    expect(mocks.updateGooglePhotosAccessToken).toHaveBeenCalledWith(
      "u1",
      "fresh",
      expect.any(Date),
    );
  });

  it("throws not_connected when there is no connection", async () => {
    mocks.getGooglePhotosConnection.mockResolvedValue(null);
    await expect(getValidGooglePhotosAccessToken("u1")).rejects.toMatchObject({
      code: "not_connected",
    });
  });

  it("throws no_refresh_token when expired without a refresh token", async () => {
    mocks.getGooglePhotosConnection.mockResolvedValue({
      accessToken: "old",
      refreshToken: null,
      expiresAt: past(),
      status: "active",
    });
    await expect(getValidGooglePhotosAccessToken("u1")).rejects.toMatchObject({
      code: "no_refresh_token",
    });
  });

  it("marks revoked when refresh returns invalid_grant", async () => {
    mocks.getGooglePhotosConnection.mockResolvedValue({
      accessToken: "old",
      refreshToken: "rt",
      expiresAt: past(),
      status: "active",
    });
    mocks.refreshAccessToken.mockRejectedValue(new Error("400 invalid_grant"));
    const err = await getValidGooglePhotosAccessToken("u1").catch((e) => e);
    expect(err).toBeInstanceOf(GooglePhotosAuthError);
    expect(err.code).toBe("revoked");
    expect(mocks.markGooglePhotosConnectionError).toHaveBeenCalled();
  });
});
