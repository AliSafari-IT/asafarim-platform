import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/server/auth", () => ({
  getAuthedUser: vi.fn(),
  unauthorized: vi.fn(() => new Response("Unauthorized", { status: 401 })),
  serverError: vi.fn((_s: string, e: unknown) => new Response(String(e), { status: 500 })),
}));
vi.mock("@/lib/server/ai/cost-read", () => ({
  CostRangeTooLargeError: class extends Error {},
  buildViontoCostTimeline: vi.fn(async () => ({ summary: {}, projects: [], items: [], nextCursor: null })),
}));

import { getAuthedUser } from "@/lib/server/auth";
import { buildViontoCostTimeline } from "@/lib/server/ai/cost-read";
import { GET } from "./route";

describe("GET /api/usage/ai", () => {
  beforeEach(() => vi.clearAllMocks());

  it("401s without a session and never reads the ledger", async () => {
    (getAuthedUser as ReturnType<typeof vi.fn>).mockResolvedValue(null);
    const res = await GET(new Request("http://localhost/api/usage/ai"));
    expect(res.status).toBe(401);
    expect(buildViontoCostTimeline).not.toHaveBeenCalled();
  });

  it("scopes to the session user — a userId in the query is ignored", async () => {
    (getAuthedUser as ReturnType<typeof vi.fn>).mockResolvedValue({ id: "u1" });
    const res = await GET(new Request("http://localhost/api/usage/ai?userId=someone-else&projectId=p1"));
    expect(res.status).toBe(200);
    const [userId, filter] = (buildViontoCostTimeline as ReturnType<typeof vi.fn>).mock.calls[0]!;
    expect(userId).toBe("u1");
    expect(filter.projectId).toBe("p1");
    expect(res.headers.get("cache-control")).toContain("no-store");
  });
});
