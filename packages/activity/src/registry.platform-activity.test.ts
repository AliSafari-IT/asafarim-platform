import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@asafarim/db", () => ({
  prisma: {
    viontoExport: { findMany: vi.fn() },
    user: { findMany: vi.fn() },
    timeline: { findMany: vi.fn() },
  },
}));

import { prisma } from "@asafarim/db";
import { getPlatformActivityApps, listPlatformActivity } from "./registry";

const mockPrisma = prisma as unknown as {
  viontoExport: { findMany: ReturnType<typeof vi.fn> };
  user: { findMany: ReturnType<typeof vi.fn> };
  timeline: { findMany: ReturnType<typeof vi.fn> };
};

beforeEach(() => {
  vi.clearAllMocks();
  mockPrisma.viontoExport.findMany.mockResolvedValue([]);
  mockPrisma.user.findMany.mockResolvedValue([]);
  mockPrisma.timeline.findMany.mockResolvedValue([]);
});

describe("getPlatformActivityApps", () => {
  it("lists only the direct-DB apps that implement listAll (vionto, timelineai), not the remote-adapter apps", () => {
    expect(getPlatformActivityApps().sort()).toEqual(["timelineai", "vionto"]);
  });
});

describe("listPlatformActivity", () => {
  it("returns an empty page with no next cursor when every app is empty", async () => {
    const result = await listPlatformActivity({ limit: 10 });
    expect(result).toEqual({ entries: [], nextCursor: null });
  });

  it("merges entries from every listAll-capable app, newest first", async () => {
    mockPrisma.viontoExport.findMany.mockResolvedValue([
      {
        id: "v-old",
        projectId: "p1",
        userId: "u1",
        format: "mp4",
        resolution: "1080p",
        durationSeconds: 10,
        fileSizeBytes: 100,
        filename: "a.mp4",
        createdAt: new Date("2026-01-01"),
        updatedAt: new Date("2026-01-01"),
      },
      {
        id: "v-new",
        projectId: "p1",
        userId: "u1",
        format: "mp4",
        resolution: "1080p",
        durationSeconds: 10,
        fileSizeBytes: 100,
        filename: "b.mp4",
        createdAt: new Date("2026-01-03"),
        updatedAt: new Date("2026-01-03"),
      },
    ]);
    mockPrisma.timeline.findMany.mockResolvedValue([
      {
        id: "t-mid",
        publicId: "pub-mid",
        title: "Trip",
        visibility: "public",
        editingState: "published",
        createdAt: new Date("2026-01-02"),
        updatedAt: new Date("2026-01-02"),
        ownerUserId: "u2",
        owner: { email: "b@c.com", name: "Bo" },
      },
    ]);

    const result = await listPlatformActivity({ limit: 10 });

    expect(result.entries.map((e) => e.id)).toEqual(["v-new", "t-mid", "v-old"]);
  });

  it("restricts to one app when `app` is given", async () => {
    mockPrisma.timeline.findMany.mockResolvedValue([
      {
        id: "t1",
        publicId: "pub-1",
        title: "Trip",
        visibility: "public",
        editingState: "published",
        createdAt: new Date(),
        updatedAt: new Date(),
        ownerUserId: "u2",
        owner: { email: "b@c.com", name: "Bo" },
      },
    ]);

    const result = await listPlatformActivity({ limit: 10, app: "timelineai" });

    expect(result.entries).toHaveLength(1);
    expect(mockPrisma.viontoExport.findMany).not.toHaveBeenCalled();
  });

  it("degrades gracefully when one app's query throws, keeping the other's entries", async () => {
    mockPrisma.viontoExport.findMany.mockRejectedValue(new Error("db down"));
    mockPrisma.timeline.findMany.mockResolvedValue([
      {
        id: "t1",
        publicId: "pub-1",
        title: "Trip",
        visibility: "public",
        editingState: "published",
        createdAt: new Date(),
        updatedAt: new Date(),
        ownerUserId: "u2",
        owner: { email: "b@c.com", name: "Bo" },
      },
    ]);

    const result = await listPlatformActivity({ limit: 10 });

    expect(result.entries).toHaveLength(1);
    expect(result.entries[0]!.id).toBe("t1");
  });

  it("combines per-app cursors into one opaque JSON cursor, and only for apps that still have more", async () => {
    const rows = Array.from({ length: 11 }, (_, i) => ({
      id: `v${i}`,
      projectId: "p1",
      userId: "u1",
      format: "mp4",
      resolution: "1080p",
      durationSeconds: 10,
      fileSizeBytes: 100,
      filename: `f${i}.mp4`,
      createdAt: new Date(Date.now() - i * 1000),
      updatedAt: new Date(),
    }));
    mockPrisma.viontoExport.findMany.mockResolvedValue(rows);
    mockPrisma.timeline.findMany.mockResolvedValue([]); // exhausted, no nextCursor

    const result = await listPlatformActivity({ limit: 10 });

    expect(result.nextCursor).not.toBeNull();
    const decoded = JSON.parse(result.nextCursor!);
    expect(Object.keys(decoded)).toEqual(["vionto"]);
  });
});
