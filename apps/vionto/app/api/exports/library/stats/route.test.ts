import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@asafarim/db", () => ({
  prisma: {
    viontoExport: { aggregate: vi.fn(), findMany: vi.fn() },
  },
}));
vi.mock("@/lib/server/auth", () => ({
  getAuthedUser: vi.fn(),
  unauthorized: vi.fn(() => new Response("Unauthorized", { status: 401 })),
  serverError: vi.fn((_scope: string, error: unknown) => new Response(String(error), { status: 500 })),
}));

import { prisma } from "@asafarim/db";
import { getAuthedUser } from "@/lib/server/auth";
import { GET } from "./route";

const mockPrisma = prisma as unknown as {
  viontoExport: { aggregate: ReturnType<typeof vi.fn>; findMany: ReturnType<typeof vi.fn> };
};
const mockGetAuthedUser = getAuthedUser as ReturnType<typeof vi.fn>;

function request(qs = ""): Request {
  return new Request(`http://localhost:3004/api/exports/library/stats${qs ? `?${qs}` : ""}`);
}

describe("GET /api/exports/library/stats", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockGetAuthedUser.mockResolvedValue({ id: "u1", email: "u1@example.com" });
    mockPrisma.viontoExport.aggregate.mockResolvedValue({
      _count: { _all: 0 },
      _sum: { durationSeconds: null, fileSizeBytes: null },
    });
    mockPrisma.viontoExport.findMany.mockResolvedValue([]);
  });

  it("returns 401 when there is no authenticated user", async () => {
    mockGetAuthedUser.mockResolvedValue(null);

    const res = await GET(request());

    expect(res.status).toBe(401);
    expect(mockPrisma.viontoExport.aggregate).not.toHaveBeenCalled();
  });

  it("scopes both the aggregate and the distinct-project lookup to the authenticated user", async () => {
    await GET(request());

    expect(mockPrisma.viontoExport.aggregate.mock.calls[0]![0].where).toMatchObject({ userId: "u1" });
    expect(mockPrisma.viontoExport.findMany.mock.calls[0]![0].where).toMatchObject({ userId: "u1" });
  });

  it("applies the same filters to the aggregate as the list endpoint would", async () => {
    await GET(request("projectId=p1&mode=cinematic"));

    const where = mockPrisma.viontoExport.aggregate.mock.calls[0]![0].where;
    expect(where).toMatchObject({ projectId: "p1", userMode: "cinematic" });
  });

  it("returns zeroed totals for a user with no exports, never null", async () => {
    const res = await GET(request());
    const json = await res.json();

    expect(json).toEqual({
      totalVideos: 0,
      totalDurationSeconds: 0,
      totalOutputBytes: 0,
      uniqueProjectCount: 0,
    });
  });

  it("maps a real aggregate result to the documented response shape", async () => {
    mockPrisma.viontoExport.aggregate.mockResolvedValue({
      _count: { _all: 5 },
      _sum: { durationSeconds: 120, fileSizeBytes: 5_000_000 },
    });
    mockPrisma.viontoExport.findMany.mockResolvedValue([{ projectId: "p1" }, { projectId: "p2" }]);

    const res = await GET(request());
    const json = await res.json();

    expect(json).toEqual({
      totalVideos: 5,
      totalDurationSeconds: 120,
      totalOutputBytes: 5_000_000,
      uniqueProjectCount: 2,
    });
  });

  it("counts distinct projects via a distinct query, not by counting every export row", async () => {
    await GET(request());

    expect(mockPrisma.viontoExport.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ distinct: ["projectId"], select: { projectId: true } })
    );
  });

  it("degrades to a 500 rather than leaking an unhandled exception when the aggregate fails", async () => {
    mockPrisma.viontoExport.aggregate.mockRejectedValue(new Error("db down"));

    const res = await GET(request());

    expect(res.status).toBe(500);
  });
});
