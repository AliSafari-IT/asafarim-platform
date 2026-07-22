import { describe, expect, it } from "vitest";
import type { BrandingType } from "@asafarim/appbuilder-schema";
import { resolveBranding, SAFE_ACCENT_CHOICES } from "./branding";

const baseBranding: BrandingType = { theme: "system" };

describe("resolveBranding", () => {
  it("defaults to the violet accent when no primaryColor is set", () => {
    const result = resolveBranding(baseBranding, "My App");
    expect(result.accent).toBe("violet");
    expect(SAFE_ACCENT_CHOICES).toContain(result.accent);
  });

  it("maps a recognized safe hex to its accent name", () => {
    const result = resolveBranding({ ...baseBranding, primaryColor: "#10b981" }, "My App");
    expect(result.accent).toBe("emerald");
  });

  it("falls back to violet for an unrecognized hex — never passes an arbitrary color through", () => {
    const result = resolveBranding({ ...baseBranding, primaryColor: "#123456" }, "My App");
    expect(result.accent).toBe("violet");
    expect(result.accentHex).not.toBe("#123456");
  });

  it("uses the app name when no companyName is set", () => {
    const result = resolveBranding(baseBranding, "My App");
    expect(result.productName).toBe("My App");
  });

  it("prefers companyName over the app name", () => {
    const result = resolveBranding({ ...baseBranding, companyName: "Acme Co" }, "My App");
    expect(result.productName).toBe("Acme Co");
  });

  it("allows a safe https logoUrl", () => {
    const result = resolveBranding({ ...baseBranding, logoUrl: "https://example.com/logo.png" }, "My App");
    expect(result.logoUrl).toBe("https://example.com/logo.png");
  });

  it("rejects a javascript: logoUrl instead of passing it through", () => {
    const result = resolveBranding({ ...baseBranding, logoUrl: "javascript:alert(1)" }, "My App");
    expect(result.logoUrl).toBeNull();
  });
});
