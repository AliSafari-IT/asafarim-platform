import { describe, expect, it } from "vitest";
import { redact, redactForAudit } from "../redact";

describe("redact", () => {
  it("redacts API-key-shaped strings", () => {
    expect(redact("key is sk-abcdefghijklmnopqrstuvwxyz")).toBe("key is [redacted]");
  });

  it("redacts email addresses", () => {
    expect(redact("contact me at person@example.com please")).toBe("contact me at [redacted] please");
  });

  it("redacts bearer tokens", () => {
    expect(redact("Authorization: Bearer abc123.def456")).toBe("Authorization: [redacted]");
  });

  it("leaves ordinary text untouched", () => {
    expect(redact("The company launched its product in 2021.")).toBe(
      "The company launched its product in 2021."
    );
  });
});

describe("redactForAudit", () => {
  it("truncates long text", () => {
    const long = "a".repeat(300);
    expect(redactForAudit(long, 50)).toBe(`${"a".repeat(50)}…`);
  });
});
