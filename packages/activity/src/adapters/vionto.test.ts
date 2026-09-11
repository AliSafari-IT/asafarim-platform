import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@asafarim/db", () => ({
  prisma: {
    viontoProject: { findMany: vi.fn() },
    viontoRenderJob: { findMany: vi.fn() },
    viontoExport: { findMany: vi.fn() },
    viontoAlbum: { findMany: vi.fn() },
    viontoUsageMetric: { findMany: vi.fn() },
  },
}));

import { prisma } from "@asafarim/db";
import { viontoActivityAdapter } from "./vionto";

const mockPrisma = prisma as unknown as {
  viontoProject: { findMany: ReturnType<typeof vi.fn> };
  viontoRenderJob: { findMany: ReturnType<typeof vi.fn> };
  viontoExport: { findMany: ReturnType<typeof vi.fn> };
  viontoAlbum: { findMany: ReturnType<typeof vi.fn> };
  viontoUsageMetric: { findMany: ReturnType<typeof vi.fn> };
};

const now = new Date("2026-01-01T00:00:00Z");

beforeEach(() => {
  vi.clearAllMocks();
  mockPrisma.viontoProject.findMany.mockResolvedValue([]);
  mockPrisma.viontoRenderJob.findMany.mockResolvedValue([]);
  mockPrisma.viontoExport.findMany.mockResolvedValue([]);
  mockPrisma.viontoAlbum.findMany.mockResolvedValue([]);
  mockPrisma.viontoUsageMetric.findMany.mockResolvedValue([]);
});

describe("viontoActivityAdapter", () => {
  it("reports app, supported and available even with no data", async () => {
    const section = await viontoActivityAdapter.getActivity({ userId: "u1" });

    expect(section.app).toBe("vionto");
    expect(section.supported).toBe(true);
    expect(section.available).toBe(true);
    expect(section.entries).toEqual([]);
  });

  it("scopes every query to the given userId", async () => {
    await viontoActivityAdapter.getActivity({ userId: "u1" });

    expect(mockPrisma.viontoProject.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { userId: "u1" } })
    );
    expect(mockPrisma.viontoRenderJob.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { userId: "u1" } })
    );
  });

  it("maps a render job with progress and error into an entry", async () => {
    mockPrisma.viontoRenderJob.findMany.mockResolvedValue([
      {
        id: "job1",
        projectId: "p1",
        state: "failed",
        progressPercent: 42,
        errorSummary: "ffmpeg crashed",
        retryCount: 1,
        startedAt: now,
        completedAt: null,
        createdAt: now,
        updatedAt: now,
      },
    ]);

    const section = await viontoActivityAdapter.getActivity({ userId: "u1" });

    expect(section.entries).toHaveLength(1);
    expect(section.entries[0]).toMatchObject({
      id: "job1",
      app: "vionto",
      type: "render_job",
      status: "failed",
      href: expect.stringContaining("/projects/p1"),
      metadata: expect.objectContaining({ progressPercent: 42, errorSummary: "ffmpeg crashed" }),
    });
  });

  it("surfaces the most recent storage_mb usage metric as a summary", async () => {
    mockPrisma.viontoUsageMetric.findMany.mockResolvedValue([
      { value: 512, periodStart: now, periodEnd: null },
    ]);

    const section = await viontoActivityAdapter.getActivity({ userId: "u1" });

    expect(section.summary).toEqual({ storageMb: 512, periodStart: now, periodEnd: null });
  });

  it("propagates a query failure so runAdapter can turn it into available:false", async () => {
    mockPrisma.viontoProject.findMany.mockRejectedValue(new Error("db down"));

    await expect(viontoActivityAdapter.getActivity({ userId: "u1" })).rejects.toThrow("db down");
  });
});
