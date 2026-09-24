import { describe, expect, it } from "vitest";
import { isSensitiveSetting, type SettingDefinition } from "./settings";

const base: Omit<SettingDefinition, "type" | "sensitive"> = {
  key: "test.key",
  label: "Test",
  description: "test",
  group: "operations",
  scope: "platform",
  defaultValue: "",
};

describe("isSensitiveSetting", () => {
  it("treats every secret-typed definition as sensitive, flag or not", () => {
    expect(isSensitiveSetting({ ...base, type: "secret" })).toBe(true);
  });

  it("treats a sensitive-flagged non-secret definition as sensitive", () => {
    expect(isSensitiveSetting({ ...base, type: "select", sensitive: true })).toBe(true);
  });

  it("treats an ordinary definition as not sensitive", () => {
    expect(isSensitiveSetting({ ...base, type: "string" })).toBe(false);
    expect(isSensitiveSetting({ ...base, type: "select", sensitive: false })).toBe(false);
  });
});
