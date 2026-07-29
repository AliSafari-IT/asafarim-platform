import { describe, expect, it } from "vitest";
import { extractBoundedText } from "./extract";
import { ATTACHMENT_LIMITS } from "./limits";

describe("extractBoundedText", () => {
  it("decodes plain text under the bound without truncation", () => {
    const result = extractBoundedText(Buffer.from("hello, world", "utf8"), "text/plain");
    expect(result).toEqual({ kind: "plain_text", text: "hello, world", truncated: false });
  });

  it("supports markdown, json, and csv the same way", () => {
    expect(extractBoundedText(Buffer.from("# Title", "utf8"), "text/markdown")?.text).toBe("# Title");
    expect(extractBoundedText(Buffer.from('{"a":1}', "utf8"), "application/json")?.text).toBe('{"a":1}');
    expect(extractBoundedText(Buffer.from("a,b\n1,2", "utf8"), "text/csv")?.text).toBe("a,b\n1,2");
  });

  it("truncates content past MAX_EXTRACTED_TEXT_CHARS_PER_FILE and reports truncation", () => {
    const oversized = "x".repeat(ATTACHMENT_LIMITS.MAX_EXTRACTED_TEXT_CHARS_PER_FILE + 500);
    const result = extractBoundedText(Buffer.from(oversized, "utf8"), "text/plain");
    expect(result?.truncated).toBe(true);
    expect(result?.text.length).toBe(ATTACHMENT_LIMITS.MAX_EXTRACTED_TEXT_CHARS_PER_FILE);
  });

  it("returns null for image/pdf MIME types — extraction is an explicit deferral", () => {
    expect(extractBoundedText(Buffer.from("anything"), "image/png")).toBeNull();
    expect(extractBoundedText(Buffer.from("anything"), "application/pdf")).toBeNull();
  });
});
