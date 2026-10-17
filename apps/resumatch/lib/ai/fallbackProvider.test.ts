import { afterEach, describe, expect, it, vi } from "vitest";

const env = { aiFallbackProvider: null as "openai" | "anthropic" | null };
vi.mock("../env", () => ({ getEnv: () => env }));

const { resolveFallbackProvider } = await import("./fallbackProvider");

afterEach(() => {
  env.aiFallbackProvider = null;
});

describe("resolveFallbackProvider (#511)", () => {
  it("has no fallback by default", () => {
    expect(resolveFallbackProvider("openai")).toBeNull();
  });

  it("reads RESUMATCH_AI_FALLBACK_PROVIDER for a real primary", () => {
    env.aiFallbackProvider = "anthropic";
    expect(resolveFallbackProvider("openai")).toBe("anthropic");
  });

  it("never falls back from the fixture provider", () => {
    env.aiFallbackProvider = "anthropic";
    expect(resolveFallbackProvider("fixture")).toBeNull();
    expect(resolveFallbackProvider("fixture", "anthropic")).toBeNull();
  });

  it("never falls back to the primary itself", () => {
    env.aiFallbackProvider = "openai";
    expect(resolveFallbackProvider("openai")).toBeNull();
    expect(resolveFallbackProvider("anthropic", "anthropic")).toBeNull();
  });

  it("lets a caller override the setting, or turn it off with null", () => {
    expect(resolveFallbackProvider("anthropic", "openai")).toBe("openai");
    env.aiFallbackProvider = "anthropic";
    expect(resolveFallbackProvider("openai", null)).toBeNull();
  });
});
