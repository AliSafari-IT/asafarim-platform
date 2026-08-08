import { describe, expect, it, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";

const { getToken } = vi.hoisted(() => ({ getToken: vi.fn() }));
vi.mock("next-auth/jwt", () => ({ getToken }));

// Imported after the mock so createAuthProxy picks up the mocked getToken.
const { createAuthProxy } = await import("./proxy");

function req(path: string, init?: { headers?: Record<string, string> }) {
  return new NextRequest(new URL(path, "https://edumatch.asafarim.com"), {
    headers: init?.headers,
  });
}

beforeEach(() => {
  getToken.mockReset();
});

describe("createAuthProxy — public routes", () => {
  // Mirrors apps/edumatch/proxy.ts's actual config, so this doubles as a
  // regression test for EduMatch's own public/private split (#87 AC2).
  const proxy = createAuthProxy({
    publicRoutes: ["/", "/privacy", "/terms", "/cookies", "/help", "/api/health"],
    signInUrl: "https://hub.asafarim.com/sign-in",
  });

  it("lets an anonymous visitor through to public/legal surfaces", async () => {
    getToken.mockResolvedValue(null);
    for (const path of ["/", "/privacy", "/terms", "/cookies"]) {
      const res = await proxy(req(path));
      expect(res.status).toBe(200); // NextResponse.next()
    }
  });

  it("lets an anonymous visitor through to the help center and its sub-pages", async () => {
    getToken.mockResolvedValue(null);
    for (const path of ["/help", "/help/students", "/help/students/getting-started"]) {
      const res = await proxy(req(path));
      expect(res.status).toBe(200);
    }
  });

  it("redirects an anonymous visitor away from a private page", async () => {
    getToken.mockResolvedValue(null);
    const res = await proxy(req("/tutor/requests"));
    expect(res.status).toBe(307); // NextResponse.redirect default
    expect(res.headers.get("location")).toContain("hub.asafarim.com/sign-in");
  });

  it("does not redirect an authenticated visitor away from a private page", async () => {
    getToken.mockResolvedValue({ sub: "user-1", isActive: true, roles: [] });
    const res = await proxy(req("/tutor/requests"));
    expect(res.status).toBe(200);
  });
});

describe("createAuthProxy — cross-domain sign-in callback (#87 AC4)", () => {
  const proxy = createAuthProxy({
    publicRoutes: ["/"],
    signInUrl: "https://hub.asafarim.com/sign-in",
  });

  it("sends an absolute callbackUrl back to the originating app when the sign-in page is on a different origin", async () => {
    getToken.mockResolvedValue(null);
    const res = await proxy(req("/tutor/requests"));
    const location = new URL(res.headers.get("location")!);
    expect(location.origin).toBe("https://hub.asafarim.com");
    expect(location.searchParams.get("callbackUrl")).toBe(
      "https://edumatch.asafarim.com/tutor/requests",
    );
  });

  it("prefers the forwarded host over the request origin (reverse-proxy safe)", async () => {
    getToken.mockResolvedValue(null);
    const res = await proxy(
      req("/tutor/requests", {
        headers: { "x-forwarded-host": "edumatch.asafarim.com", "x-forwarded-proto": "https" },
      }),
    );
    const location = new URL(res.headers.get("location")!);
    expect(location.searchParams.get("callbackUrl")).toBe(
      "https://edumatch.asafarim.com/tutor/requests",
    );
  });

  it("keeps the callbackUrl relative when sign-in and the app share an origin", async () => {
    const sameOriginProxy = createAuthProxy({
      publicRoutes: ["/"],
      signInUrl: "https://edumatch.asafarim.com/sign-in",
    });
    getToken.mockResolvedValue(null);
    const res = await sameOriginProxy(req("/tutor/requests"));
    const location = new URL(res.headers.get("location")!);
    expect(location.searchParams.get("callbackUrl")).toBe("/tutor/requests");
  });
});

describe("createAuthProxy — API vs page requests", () => {
  const proxy = createAuthProxy({ publicRoutes: ["/"] });

  it("returns 401 JSON for an unauthenticated API call instead of redirecting", async () => {
    getToken.mockResolvedValue(null);
    const res = await proxy(req("/api/tutors/wallet"));
    expect(res.status).toBe(401);
    expect(await res.json()).toEqual({ error: "Unauthorized" });
  });

  it("blocks a deactivated user's session", async () => {
    getToken.mockResolvedValue({ sub: "user-1", isActive: false, roles: [] });
    const res = await proxy(req("/tutor/requests"));
    expect(res.status).toBe(403);
  });
});
