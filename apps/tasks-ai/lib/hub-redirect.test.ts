import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { buildHubSignInRedirect } from "./hub-redirect";

const ORIGINAL_ENV = { ...process.env };

afterEach(() => {
  process.env = { ...ORIGINAL_ENV };
});

describe("buildHubSignInRedirect", () => {
  beforeEach(() => {
    delete process.env.NEXT_PUBLIC_TASKSAI_URL;
    delete process.env.NEXT_PUBLIC_HUB_URL;
  });

  it("points at the Hub sign-in path with a callback back to the given TasksAI path", () => {
    process.env.NEXT_PUBLIC_TASKSAI_URL = "https://tasks-ai.asafarim.com";
    process.env.NEXT_PUBLIC_HUB_URL = "https://hub.asafarim.com";

    const url = buildHubSignInRedirect("/workspace");

    expect(url).toBe(
      "https://hub.asafarim.com/sign-in?callbackUrl=" +
        encodeURIComponent("https://tasks-ai.asafarim.com/workspace")
    );
  });

  it("resolves to the production origins at runtime — never hardcodes or falls back to localhost when the env vars are set", () => {
    process.env.NEXT_PUBLIC_TASKSAI_URL = "https://tasks-ai.asafarim.com";
    process.env.NEXT_PUBLIC_HUB_URL = "https://hub.asafarim.com";

    const url = buildHubSignInRedirect("/workspace");

    expect(url).not.toContain("localhost");
  });

  it("falls back to localhost only when the env vars are genuinely unset (local dev)", () => {
    const url = buildHubSignInRedirect("/workspace");

    expect(url.startsWith("http://localhost:3001/sign-in")).toBe(true);
    expect(url).toContain(encodeURIComponent("http://localhost:3013/workspace"));
  });

  it("builds a workspace-specific callback path for requireMembership's redirect", () => {
    process.env.NEXT_PUBLIC_TASKSAI_URL = "https://tasks-ai.asafarim.com";
    process.env.NEXT_PUBLIC_HUB_URL = "https://hub.asafarim.com";

    const url = buildHubSignInRedirect("/w/acme");

    expect(url).toContain(encodeURIComponent("https://tasks-ai.asafarim.com/w/acme"));
  });

  it("URL-encodes the callback so it survives as a single query parameter", () => {
    const url = buildHubSignInRedirect("/workspace");
    const parsed = new URL(url);

    // If encoding were wrong, the callback path would fragment into its own
    // top-level query params instead of staying inside callbackUrl's value.
    expect([...parsed.searchParams.keys()]).toEqual(["callbackUrl"]);
  });
});
