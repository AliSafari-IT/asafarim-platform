import { describe, expect, it } from "vitest";
import { TimelineEventInputSchema } from "../schemas";

function eventWith(overrides: Partial<{ imageUrl: string; link: string }>) {
  return {
    title: "Test event",
    sortOrder: 0,
    ...overrides,
  };
}

describe("safeExternalUrl (via TimelineEventInputSchema.imageUrl/link)", () => {
  it("accepts a normal public https image URL", () => {
    const result = TimelineEventInputSchema.safeParse(eventWith({ imageUrl: "https://example.com/photo.jpg" }));
    expect(result.success).toBe(true);
  });

  it("rejects http:// (non-https)", () => {
    const result = TimelineEventInputSchema.safeParse(eventWith({ imageUrl: "http://example.com/photo.jpg" }));
    expect(result.success).toBe(false);
  });

  it("rejects localhost", () => {
    const result = TimelineEventInputSchema.safeParse(eventWith({ link: "https://localhost/admin" }));
    expect(result.success).toBe(false);
  });

  it("rejects loopback IP literal", () => {
    const result = TimelineEventInputSchema.safeParse(eventWith({ imageUrl: "https://127.0.0.1/secret.png" }));
    expect(result.success).toBe(false);
  });

  it("rejects RFC1918 private ranges", () => {
    expect(TimelineEventInputSchema.safeParse(eventWith({ link: "https://10.0.0.5/" })).success).toBe(false);
    expect(TimelineEventInputSchema.safeParse(eventWith({ link: "https://192.168.1.1/" })).success).toBe(false);
    expect(TimelineEventInputSchema.safeParse(eventWith({ link: "https://172.20.0.1/" })).success).toBe(false);
  });

  it("rejects the cloud-metadata / link-local range", () => {
    const result = TimelineEventInputSchema.safeParse(eventWith({ link: "https://169.254.169.254/latest/meta-data" }));
    expect(result.success).toBe(false);
  });

  it("rejects a non-url scheme like javascript:", () => {
    const result = TimelineEventInputSchema.safeParse(eventWith({ link: "javascript:alert(1)" }));
    expect(result.success).toBe(false);
  });

  it("still allows a normal public https link", () => {
    const result = TimelineEventInputSchema.safeParse(eventWith({ link: "https://en.wikipedia.org/wiki/Timeline" }));
    expect(result.success).toBe(true);
  });
});
