import { describe, expect, it } from "vitest";
import { routes } from "./routes";

describe("route contracts", () => {
  it("defines the M01 static routes", () => {
    expect(routes.home()).toBe("/");
    expect(routes.apps()).toBe("/apps");
    expect(routes.newApp()).toBe("/apps/new");
  });

  it("builds appId-scoped routes", () => {
    expect(routes.appDetail("app_123")).toBe("/apps/app_123");
    expect(routes.appPreview("app_123")).toBe("/apps/app_123/preview");
  });

  it("encodes appId segments to keep the route contract safe", () => {
    expect(routes.appDetail("weird id/slash")).toBe(
      "/apps/weird%20id%2Fslash"
    );
    expect(routes.appPreview("weird id/slash")).toBe(
      "/apps/weird%20id%2Fslash/preview"
    );
  });
});
