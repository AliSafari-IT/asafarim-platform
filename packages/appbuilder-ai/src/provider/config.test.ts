import { describe, it, expect } from "vitest";
import { loadAiProviderConfig, safeConfigSummary, AiProviderConfigError } from "./config";

describe("loadAiProviderConfig", () => {
  it("defaults to the fake provider when APPBUILDER_AI_PROVIDER is unset", () => {
    const config = loadAiProviderConfig({});
    expect(config.provider).toBe("fake");
  });

  it("throws AiProviderConfigError when provider=openai but no API key is configured anywhere", () => {
    expect(() => loadAiProviderConfig({ APPBUILDER_AI_PROVIDER: "openai" })).toThrow(AiProviderConfigError);
  });

  it("accepts the shared reserved OPENAI_API_KEY as a fallback for APPBUILDER_AI_OPENAI_API_KEY", () => {
    const config = loadAiProviderConfig({ APPBUILDER_AI_PROVIDER: "openai", OPENAI_API_KEY: "sk-shared-key-value" });
    expect(config.openaiApiKey).toBe("sk-shared-key-value");
  });

  it("prefers the AppBuilder-specific key over the shared reserved one when both are set", () => {
    const config = loadAiProviderConfig({
      APPBUILDER_AI_PROVIDER: "openai",
      APPBUILDER_AI_OPENAI_API_KEY: "sk-appbuilder-specific",
      OPENAI_API_KEY: "sk-shared-key-value",
    });
    expect(config.openaiApiKey).toBe("sk-appbuilder-specific");
  });

  it("applies documented defaults for unset numeric bounds", () => {
    const config = loadAiProviderConfig({});
    expect(config.requestTimeoutMs).toBe(30_000);
    expect(config.maxRetries).toBe(2);
    expect(config.maxIterations).toBe(4);
  });
});

describe("safeConfigSummary", () => {
  it("never includes the raw API key, only whether one is configured", () => {
    const config = loadAiProviderConfig({ APPBUILDER_AI_PROVIDER: "openai", OPENAI_API_KEY: "sk-should-not-appear-anywhere" });
    const summary = JSON.stringify(safeConfigSummary(config));
    expect(summary).not.toContain("sk-should-not-appear-anywhere");
    expect(summary).toContain("openaiApiKeyConfigured");
  });
});
