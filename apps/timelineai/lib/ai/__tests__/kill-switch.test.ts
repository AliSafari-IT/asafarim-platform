import { afterEach, describe, expect, it } from "vitest";
import { isAiEnabled } from "../kill-switch";

describe("isAiEnabled", () => {
  afterEach(() => {
    delete process.env.TIMELINEAI_AI_ENABLED;
  });

  it("fails closed when unset", () => {
    delete process.env.TIMELINEAI_AI_ENABLED;
    expect(isAiEnabled()).toBe(false);
  });

  it("fails closed on any value other than exactly 'true'", () => {
    process.env.TIMELINEAI_AI_ENABLED = "1";
    expect(isAiEnabled()).toBe(false);
    process.env.TIMELINEAI_AI_ENABLED = "TRUE";
    expect(isAiEnabled()).toBe(false);
  });

  it("is enabled only when exactly 'true'", () => {
    process.env.TIMELINEAI_AI_ENABLED = "true";
    expect(isAiEnabled()).toBe(true);
  });
});
