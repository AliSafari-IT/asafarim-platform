import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@asafarim/db", () => ({
  prisma: {
    viontoExport: { aggregate: vi.fn(), findMany: vi.fn() },
    viontoAiClip: { aggregate: vi.fn(), count: vi.fn() },
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
  viontoAiClip: { aggregate: ReturnType<typeof vi.fn>; count: ReturnType<typeof vi.fn> };
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
    mockPrisma.viontoAiClip.aggregate.mockResolvedValue({
      _count: { _all: 0 },
      _sum: { outputDurationSeconds: null, estimatedCostUsdMicros: null },
    });
    mockPrisma.viontoAiClip.count.mockResolvedValue(0);
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

  it("returns zeroed totals for a user with no exports or AI clips, never null", async () => {
    const res = await GET(request());
    const json = await res.json();

    expect(json).toEqual({
      totalVideos: 0,
      totalDurationSeconds: 0,
      totalOutputBytes: 0,
      uniqueProjectCount: 0,
      aiMotion: {
        succeededClips: 0,
        acceptedClips: 0,
        durationSeconds: 0,
        estimatedCostUsd: 0,
        unknownCostCount: 0,
      },
    });
  });

  it("maps a real export aggregate result to the documented response shape", async () => {
    mockPrisma.viontoExport.aggregate.mockResolvedValue({
      _count: { _all: 5 },
      _sum: { durationSeconds: 120, fileSizeBytes: 5_000_000 },
    });
    mockPrisma.viontoExport.findMany.mockResolvedValue([{ projectId: "p1" }, { projectId: "p2" }]);

    const res = await GET(request());
    const json = await res.json();

    expect(json).toMatchObject({
      totalVideos: 5,
      totalDurationSeconds: 120,
      totalOutputBytes: 5_000_000,
      uniqueProjectCount: 2,
    });
  });

  it("counts distinct projects via a distinct query, not by counting every row", async () => {
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

  describe("aiMotion", () => {
    it("only counts succeeded AI clips, scoped to the authenticated user", async () => {
      await GET(request());

      expect(mockPrisma.viontoAiClip.aggregate.mock.calls[0]![0].where).toEqual({
        userId: "u1",
        status: "succeeded",
      });
    });

    it("converts the summed cost from integer micros to a USD float", async () => {
      mockPrisma.viontoAiClip.aggregate.mockResolvedValue({
        _count: { _all: 3 },
        _sum: { outputDurationSeconds: 15, estimatedCostUsdMicros: BigInt(840_000) }, // $0.84
      });
      mockPrisma.viontoAiClip.count.mockResolvedValue(0); // unknownCostCount

      const res = await GET(request());
      const json = await res.json();

      expect(json.aiMotion).toMatchObject({
        succeededClips: 3,
        durationSeconds: 15,
        estimatedCostUsd: 0.84,
        unknownCostCount: 0,
      });
    });

    it("reports estimatedCostUsd: null (not 0) when every succeeded clip predates cost tracking", async () => {
      mockPrisma.viontoAiClip.aggregate.mockResolvedValue({
        _count: { _all: 2 },
        _sum: { outputDurationSeconds: 10, estimatedCostUsdMicros: null },
      });
      // Both the accepted-count query and the unknown-cost-count query use
      // the same mock — both apply here since every clip is unpriced.
      mockPrisma.viontoAiClip.count.mockResolvedValue(2);

      const res = await GET(request());
      const json = await res.json();

      expect(json.aiMotion.estimatedCostUsd).toBeNull();
      expect(json.aiMotion.unknownCostCount).toBe(2);
    });

    it("reports estimatedCostUsd: 0 (not null) when there are zero succeeded clips at all", async () => {
      const res = await GET(request());
      const json = await res.json();

      expect(json.aiMotion.estimatedCostUsd).toBe(0);
    });

    it("counts accepted clips with a direct query rather than a non-null field count", async () => {
      mockPrisma.viontoAiClip.aggregate.mockResolvedValue({
        _count: { _all: 4 },
        _sum: { outputDurationSeconds: 20, estimatedCostUsdMicros: BigInt(0) },
      });
      // Call order: unknownCostCount is queried first (inside the initial
      // Promise.all), acceptedAiClips second (after it resolves).
      mockPrisma.viontoAiClip.count.mockResolvedValueOnce(0); // unknownCostCount
      mockPrisma.viontoAiClip.count.mockResolvedValueOnce(3); // acceptedAiClips

      const res = await GET(request());
      const json = await res.json();

      expect(mockPrisma.viontoAiClip.count).toHaveBeenCalledWith({
        where: { userId: "u1", status: "succeeded", accepted: true },
      });
      expect(json.aiMotion.acceptedClips).toBe(3);
    });

    it("skips the accepted-count query entirely when there are zero succeeded clips", async () => {
      await GET(request());

      expect(mockPrisma.viontoAiClip.count).toHaveBeenCalledTimes(1); // only the unknown-cost-count query
    });
  });
});
