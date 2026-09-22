import { describe, expect, it } from "vitest";
import { formatSettingValue, isValidValue, type SettingDefinition } from "./settings";

const JSON_DEFINITION: SettingDefinition = {
  key: "test.jsonSetting",
  label: "Test JSON setting",
  description: "test",
  group: "operations",
  scope: "platform",
  type: "json",
  defaultValue: {},
};

describe("isValidValue — json type", () => {
  it("accepts a plain object", () => {
    expect(isValidValue(JSON_DEFINITION, { a: 1, b: [1, 2, 3] })).toBe(true);
  });

  it("accepts an array", () => {
    expect(isValidValue(JSON_DEFINITION, [1, 2, 3])).toBe(true);
  });

  it("rejects null", () => {
    expect(isValidValue(JSON_DEFINITION, null)).toBe(false);
  });

  it("rejects a bare primitive", () => {
    expect(isValidValue(JSON_DEFINITION, "just a string")).toBe(false);
    expect(isValidValue(JSON_DEFINITION, 42)).toBe(false);
    expect(isValidValue(JSON_DEFINITION, true)).toBe(false);
  });

  it("rejects undefined", () => {
    expect(isValidValue(JSON_DEFINITION, undefined)).toBe(false);
  });
});

describe("formatSettingValue — json type", () => {
  it("renders an object as JSON text", () => {
    expect(formatSettingValue({ locale: "en", subject: "Hi" })).toBe(
      JSON.stringify({ locale: "en", subject: "Hi" })
    );
  });

  it("renders an array of objects as JSON text, not [object Object]", () => {
    expect(formatSettingValue([{ id: 1 }, { id: 2 }])).toBe(
      JSON.stringify([{ id: 1 }, { id: 2 }])
    );
  });

  it("still renders a plain string[] as a comma-joined list", () => {
    expect(formatSettingValue(["a", "b", "c"])).toBe("a, b, c");
  });
});
