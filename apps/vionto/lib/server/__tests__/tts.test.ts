import { describe, expect, it } from "vitest";
import {
  getVoiceById,
  listVoicesForLocale,
  listVoicesByTag,
  VOICE_CATALOG,
} from "../tts";

describe("Voice catalog", () => {
  it("has unique voice IDs", () => {
    const ids = VOICE_CATALOG.map((v) => v.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it("finds a known voice", () => {
    const voice = getVoiceById("nova");
    expect(voice?.name).toBe("Nova");
    expect(voice?.provider).toBe("openai");
  });

  it("returns undefined for unknown voice", () => {
    expect(getVoiceById("nonexistent")).toBeUndefined();
  });

  it("filters voices by locale base language", () => {
    const en = listVoicesForLocale("en-US");
    expect(en.length).toBeGreaterThan(0);
    expect(en.every((v) => v.locale.startsWith("en"))).toBe(true);
  });

  it("offers localized multilingual voice IDs for non-English locales", () => {
    const nl = listVoicesForLocale("nl-NL");
    expect(nl.length).toBeGreaterThan(0);
    expect(nl.every((v) => v.locale.startsWith("nl"))).toBe(true);
    expect(nl.some((v) => v.id === "nl-nova" && v.providerVoiceId === "nova")).toBe(true);
  });

  it("filters voices by tag", () => {
    const warm = listVoicesByTag("warm");
    expect(warm.length).toBeGreaterThan(0);
    expect(warm.some((v) => v.id === "nova")).toBe(true);
  });
});
