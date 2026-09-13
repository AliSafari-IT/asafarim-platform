import { describe, expect, it } from "vitest";
import { estimateClipCostUsdMicros, getModel } from "./registry";

describe("estimateClipCostUsdMicros", () => {
  it("scales the registry's per-5-second rate to the requested duration", () => {
    // kling / kling-v1-6: $0.28 per 5s clip (verified against the registry below).
    const model = getModel("kling", "kling-v1-6");
    expect(model?.approxCost).toEqual({ amount: 0.28, unit: "per_5s_clip" });

    const estimate = estimateClipCostUsdMicros("kling", "kling-v1-6", 5);
    expect(estimate?.amountMicros).toBe(280_000); // $0.28 in micros
  });

  it("scales proportionally for a 10-second clip", () => {
    const estimate = estimateClipCostUsdMicros("kling", "kling-v1-6", 10);
    expect(estimate?.amountMicros).toBe(560_000); // 2x the 5s rate
  });

  it("returns integer micros, never a float, even for a rate that doesn't divide evenly", () => {
    // fal / fal-ai/ltx-video/image-to-video: $0.02 per 5s clip.
    const estimate = estimateClipCostUsdMicros("fal", "fal-ai/ltx-video/image-to-video", 3);
    expect(estimate?.amountMicros).toBe(Math.round(0.02 * (3 / 5) * 1_000_000));
    expect(Number.isInteger(estimate?.amountMicros)).toBe(true);
  });

  it("returns null — not a fabricated $0 — for a model with no approxCost entry", () => {
    // openai's story models have no approxCost (video-only pricing exists today).
    const estimate = estimateClipCostUsdMicros("openai", "gpt-4.1-mini", 5);
    expect(estimate).toBeNull();
  });

  it("returns null for an unknown provider/model pair", () => {
    expect(estimateClipCostUsdMicros("kling", "not-a-real-model", 5)).toBeNull();
  });

  it("labels the source as registry_estimate and captures a reproducible snapshot", () => {
    const estimate = estimateClipCostUsdMicros("kling", "kling-v1-6", 5);

    expect(estimate?.source).toBe("registry_estimate");
    expect(estimate?.snapshot).toEqual({
      provider: "kling",
      modelId: "kling-v1-6",
      amount: 0.28,
      unit: "per_5s_clip",
      durationSeconds: 5,
    });
  });
});
