import { describe, expect, it } from "vitest";
import {
  PROVIDER_REGISTRY,
  getProvider,
  getModel,
  providersFor,
  byokProviders,
} from "../ai/registry";

describe("AI provider registry", () => {
  it("looks up providers and models by id", () => {
    expect(getProvider("openai")?.label).toBe("OpenAI");
    expect(getProvider("kling")?.auth).toBe("key_secret");
    expect(getModel("fal", "fal-ai/ltx-video/image-to-video")?.tier).toBe("economy");
    expect(getModel("openai", "nope")).toBeUndefined();
  });

  it("lists only implemented providers for a capability, economy first", () => {
    const narrators = providersFor("narration");
    expect(narrators.every((p) => p.implemented)).toBe(true);
    expect(narrators.map((p) => p.id)).toContain("openai");
    // gemini/google_tts are registered but not implemented → excluded
    expect(narrators.map((p) => p.id)).not.toContain("google_tts");
  });

  it("only exposes generative video that is implemented", () => {
    const video = providersFor("generative_video");
    expect(video.map((p) => p.id)).toContain("kling");
    expect(video.map((p) => p.id)).not.toContain("fal"); // implemented=false until Phase G
  });

  it("byokProviders excludes local renderers", () => {
    const ids = byokProviders().map((p) => p.id);
    expect(ids).toContain("openai");
    expect(ids).not.toContain("ffmpeg");
    expect(ids).not.toContain("remotion");
  });

  it("every model's capability is declared on its provider", () => {
    for (const p of PROVIDER_REGISTRY) {
      for (const m of p.models) {
        expect(p.capabilities).toContain(m.capability);
      }
    }
  });
});
