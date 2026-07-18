import { describe, it, expect } from "vitest";
import { buildDefaultPublicUrl } from "./index";

describe("buildDefaultPublicUrl", () => {
  it("inserts the bucket as a subdomain for a region-only endpoint", () => {
    const url = buildDefaultPublicUrl(
      "https://fra1.digitaloceanspaces.com",
      "asafarim-platform"
    );
    expect(url).toBe("https://asafarim-platform.fra1.digitaloceanspaces.com");
  });

  it("keeps the bucket subdomain when endpoint already includes it", () => {
    const url = buildDefaultPublicUrl(
      "https://asafarim-platform.fra1.digitaloceanspaces.com",
      "asafarim-platform"
    );
    expect(url).toBe("https://asafarim-platform.fra1.digitaloceanspaces.com");
  });

  it("trailing slashes are stripped from the result", () => {
    const url = buildDefaultPublicUrl(
      "https://fra1.digitaloceanspaces.com/",
      "asafarim-platform"
    );
    expect(url).toBe("https://asafarim-platform.fra1.digitaloceanspaces.com");
  });

  it("falls back to path-style when the endpoint is not a valid URL", () => {
    const url = buildDefaultPublicUrl("not-a-url", "asafarim-platform");
    expect(url).toBe("not-a-url/asafarim-platform");
  });
});
