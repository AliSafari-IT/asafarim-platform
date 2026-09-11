import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createRemoteAdapter } from "./remote";

const ORIGINAL_SECRET = process.env.INTERNAL_API_SECRET;

beforeEach(() => {
  process.env.INTERNAL_API_SECRET = "test-secret";
  vi.stubGlobal("fetch", vi.fn());
});

afterEach(() => {
  if (ORIGINAL_SECRET === undefined) delete process.env.INTERNAL_API_SECRET;
  else process.env.INTERNAL_API_SECRET = ORIGINAL_SECRET;
  vi.unstubAllGlobals();
});

function adapter() {
  return createRemoteAdapter({ app: "appbuilder", baseUrl: () => "http://localhost:3006" });
}

describe("createRemoteAdapter", () => {
  it("is unavailable when the shared secret is not configured", async () => {
    delete process.env.INTERNAL_API_SECRET;

    const section = await adapter().getActivity({ userId: "u1" });

    expect(section).toMatchObject({ app: "appbuilder", supported: true, available: false });
    expect(section.error).toContain("INTERNAL_API_SECRET");
    expect(fetch).not.toHaveBeenCalled();
  });

  it("sends the bearer secret and userId/email as query params", async () => {
    vi.mocked(fetch).mockResolvedValue(
      new Response(JSON.stringify({ entries: [] }), { status: 200 })
    );

    await adapter().getActivity({ userId: "u1", email: "a@b.com" });

    const [url, init] = vi.mocked(fetch).mock.calls[0]!;
    expect(String(url)).toContain("/api/internal/user-activity?userId=u1&email=a%40b.com");
    expect((init?.headers as Record<string, string>).authorization).toBe("Bearer test-secret");
  });

  it("maps a successful response's entries, reviving date strings", async () => {
    vi.mocked(fetch).mockResolvedValue(
      new Response(
        JSON.stringify({
          entries: [
            {
              id: "a1",
              type: "app",
              title: "My App",
              status: "active",
              createdAt: "2026-01-01T00:00:00.000Z",
              updatedAt: "2026-01-02T00:00:00.000Z",
              href: "http://localhost:3006/apps/a1",
              metadata: {},
            },
          ],
          summary: { note: "ok" },
        }),
        { status: 200 }
      )
    );

    const section = await adapter().getActivity({ userId: "u1" });

    expect(section.available).toBe(true);
    expect(section.entries).toHaveLength(1);
    expect(section.entries[0]!.app).toBe("appbuilder");
    expect(section.entries[0]!.createdAt).toEqual(new Date("2026-01-01T00:00:00.000Z"));
    expect(section.summary).toEqual({ note: "ok" });
  });

  it("degrades to available:false on a non-2xx response", async () => {
    vi.mocked(fetch).mockResolvedValue(new Response("nope", { status: 500 }));

    const section = await adapter().getActivity({ userId: "u1" });

    expect(section).toMatchObject({ available: false, error: "HTTP 500", entries: [] });
  });

  it("degrades to available:false when the request throws (network error)", async () => {
    vi.mocked(fetch).mockRejectedValue(new Error("connection refused"));

    const section = await adapter().getActivity({ userId: "u1" });

    expect(section).toMatchObject({ available: false, error: "connection refused", entries: [] });
  });
});
