import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createRenderGrant, verifyRenderGrant } from "../render-grant";

describe("render grant", () => {
  beforeEach(() => {
    process.env.TIMELINEAI_RENDER_GRANT_SECRET = "test-secret";
  });

  afterEach(() => {
    vi.useRealTimers();
    delete process.env.TIMELINEAI_RENDER_GRANT_SECRET;
  });

  it("verifies a freshly minted grant for the same publicId", () => {
    const grant = createRenderGrant("abc123", "pdf");
    expect(verifyRenderGrant(grant, "abc123")).toBe(true);
  });

  it("rejects a grant checked against a different publicId", () => {
    const grant = createRenderGrant("abc123", "pdf");
    expect(verifyRenderGrant(grant, "other-id")).toBe(false);
  });

  it("rejects a tampered signature", () => {
    const grant = createRenderGrant("abc123", "pdf");
    const tampered = grant.slice(0, -2) + "xx";
    expect(verifyRenderGrant(tampered, "abc123")).toBe(false);
  });

  it("rejects a tampered payload (e.g. swapping the publicId while keeping a valid-looking signature)", () => {
    const grant = createRenderGrant("abc123", "pdf");
    const parts = grant.split(".");
    const forged = ["someone-elses-id", parts[1], parts[2], parts[3]].join(".");
    expect(verifyRenderGrant(forged, "someone-elses-id")).toBe(false);
  });

  it("rejects an expired grant", () => {
    vi.useFakeTimers();
    vi.setSystemTime(0);
    const grant = createRenderGrant("abc123", "pdf");
    vi.setSystemTime(60_000);
    expect(verifyRenderGrant(grant, "abc123")).toBe(false);
  });

  it("rejects a missing or malformed token", () => {
    expect(verifyRenderGrant(null, "abc123")).toBe(false);
    expect(verifyRenderGrant("not-a-grant", "abc123")).toBe(false);
  });

  it("throws when the secret is not configured", () => {
    delete process.env.TIMELINEAI_RENDER_GRANT_SECRET;
    expect(() => createRenderGrant("abc123", "pdf")).toThrow();
  });
});
