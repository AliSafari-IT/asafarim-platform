import { describe, expect, it } from "vitest";
import { sanitizeUrl } from "./url";

describe("sanitizeUrl", () => {
  it("allows https and http URLs", () => {
    expect(sanitizeUrl("https://example.com/logo.png")).toBe("https://example.com/logo.png");
    expect(sanitizeUrl("http://example.com/logo.png")).toBe("http://example.com/logo.png");
  });

  it("allows same-origin relative paths", () => {
    expect(sanitizeUrl("/assets/logo.png")).toBe("/assets/logo.png");
  });

  it("rejects protocol-relative URLs", () => {
    expect(sanitizeUrl("//evil.example.com/x")).toBeNull();
  });

  it("rejects javascript: URLs", () => {
    expect(sanitizeUrl("javascript:alert(1)")).toBeNull();
  });

  it("rejects data:text/html URLs even for images", () => {
    expect(sanitizeUrl("data:text/html,<script>alert(1)</script>", "image")).toBeNull();
  });

  it("allows safe data:image URLs for images only", () => {
    const dataUrl = "data:image/png;base64,AAAA";
    expect(sanitizeUrl(dataUrl, "image")).toBe(dataUrl);
    expect(sanitizeUrl(dataUrl, "link")).toBeNull();
  });

  it("rejects vbscript: and file: URLs", () => {
    expect(sanitizeUrl("vbscript:msgbox(1)")).toBeNull();
    expect(sanitizeUrl("file:///etc/passwd")).toBeNull();
  });

  it("rejects non-string and oversized input", () => {
    expect(sanitizeUrl(undefined)).toBeNull();
    expect(sanitizeUrl(123)).toBeNull();
    expect(sanitizeUrl("https://example.com/" + "a".repeat(2100))).toBeNull();
  });
});
