import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@asafarim/db", () => ({
  prisma: {
    viontoProject: { findMany: vi.fn() },
    viontoRenderJob: { findMany: vi.fn() },
    viontoExport: { findMany: vi.fn() },
    viontoAlbum: { findMany: vi.fn() },
    viontoUsageMetric: { findMany: vi.fn() },
    user: { findMany: vi.fn() },
  },
}));

import { prisma } from "@asafarim/db";
import { viontoActivityAdapter } from "./vionto";

const mockPrisma = prisma as unknown as {
  viontoProject: { findMany: ReturnType<typeof vi.fn> };
  viontoRenderJob: { findMany: ReturnType<typeof vi.fn> };
  viontoExport: { findMany: ReturnType<typeof vi.fn> };
  viontoAlbum: { findMany: ReturnType<typeof vi.fn> };
  user: { findMany: ReturnType<typeof vi.fn> };
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

describe("viontoActivityAdapter.listAll", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockPrisma.user.findMany.mockResolvedValue([]);
  });

  it("maps exports across users, attaching each owner from a batch lookup", async () => {
    mockPrisma.viontoExport.findMany.mockResolvedValue([
      {
        id: "e1",
        projectId: "p1",
        userId: "u1",
        format: "mp4",
        resolution: "1080p",
        durationSeconds: 30,
        fileSizeBytes: 1000,
        filename: "clip.mp4",
        createdAt: now,
        updatedAt: now,
      },
    ]);
    mockPrisma.user.findMany.mockResolvedValue([{ id: "u1", email: "a@b.com", name: "Ada" }]);

    const result = await viontoActivityAdapter.listAll!({ limit: 10 });

    expect(result.entries).toHaveLength(1);
    expect(result.entries[0]).toMatchObject({
      id: "e1",
      app: "vionto",
      type: "export",
      owner: { userId: "u1", email: "a@b.com", name: "Ada" },
    });
    expect(result.nextCursor).toBeNull();
  });

  it("sets nextCursor to the last row's createdAt when there's another page", async () => {
    const rows = Array.from({ length: 11 }, (_, i) => ({
      id: `e${i}`,
      projectId: "p1",
      userId: "u1",
      format: "mp4",
      resolution: "1080p",
      durationSeconds: 30,
      fileSizeBytes: 1000,
      filename: `clip-${i}.mp4`,
      createdAt: new Date(now.getTime() - i * 1000),
      updatedAt: now,
    }));
    mockPrisma.viontoExport.findMany.mockResolvedValue(rows);

    const result = await viontoActivityAdapter.listAll!({ limit: 10 });

    expect(result.entries).toHaveLength(10);
    expect(result.nextCursor).toBe(rows[9]!.createdAt.toISOString());
  });

  it("passes the cursor through as a createdAt < filter", async () => {
    mockPrisma.viontoExport.findMany.mockResolvedValue([]);
    const cursor = now.toISOString();

    await viontoActivityAdapter.listAll!({ limit: 10, cursor });

    expect(mockPrisma.viontoExport.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { createdAt: { lt: new Date(cursor) } } })
    );
  });

  it("falls back to null email/name when the owner lookup misses", async () => {
    mockPrisma.viontoExport.findMany.mockResolvedValue([
      {
        id: "e1",
        projectId: "p1",
        userId: "deleted-user",
        format: "mp4",
        resolution: null,
        durationSeconds: null,
        fileSizeBytes: null,
        filename: null,
        createdAt: now,
        updatedAt: now,
      },
    ]);

    const result = await viontoActivityAdapter.listAll!({ limit: 10 });

    expect(result.entries[0]!.owner).toEqual({ userId: "deleted-user", email: null, name: null });
  });
});
