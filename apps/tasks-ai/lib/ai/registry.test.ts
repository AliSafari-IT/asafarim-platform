import { describe, expect, it } from "vitest";
import { fallbackProviderFor, isProviderConfigured } from "./registry";

describe("provider fallback selection (#537)", () => {
  it("a provider counts as configured only when its key is set", () => {
    expect(isProviderConfigured("anthropic", { ANTHROPIC_API_KEY: "k" })).toBe(true);
    expect(isProviderConfigured("anthropic", { ANTHROPIC_API_KEY: "" })).toBe(false);
    expect(isProviderConfigured("openai", {})).toBe(false);
    expect(isProviderConfigured("fixture", { ANTHROPIC_API_KEY: "k" })).toBe(false);
  });

  it("picks the other configured real provider", () => {
    const env = { ANTHROPIC_API_KEY: "a", OPENAI_API_KEY: "o" };
    expect(fallbackProviderFor("openai", env)).toBe("anthropic");
    expect(fallbackProviderFor("anthropic", env)).toBe("openai");
  });

  it("never falls back to the primary itself or to an unconfigured provider", () => {
    expect(fallbackProviderFor("openai", { OPENAI_API_KEY: "o" })).toBeNull();
    expect(fallbackProviderFor("anthropic", { ANTHROPIC_API_KEY: "a" })).toBeNull();
    expect(fallbackProviderFor("openai", {})).toBeNull();
  });

  it("a fixture workspace never gets a real fallback", () => {
    expect(fallbackProviderFor("fixture", { ANTHROPIC_API_KEY: "a", OPENAI_API_KEY: "o" })).toBeNull();
  });
});
