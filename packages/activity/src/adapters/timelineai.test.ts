import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@asafarim/db", () => ({
  prisma: {
    timeline: { findMany: vi.fn() },
  },
}));

import { prisma } from "@asafarim/db";
import { timelineaiActivityAdapter } from "./timelineai";

const mockPrisma = prisma as unknown as {
  timeline: { findMany: ReturnType<typeof vi.fn> };
};

const now = new Date("2026-01-01T00:00:00Z");

beforeEach(() => {
  vi.clearAllMocks();
});

describe("timelineaiActivityAdapter", () => {
  it("returns an empty, available section when the user owns no timelines", async () => {
    mockPrisma.timeline.findMany.mockResolvedValue([]);

    const section = await timelineaiActivityAdapter.getActivity({ userId: "u1" });

    expect(section).toMatchObject({ app: "timelineai", supported: true, available: true, entries: [] });
  });

  it("scopes the query to ownerUserId", async () => {
    mockPrisma.timeline.findMany.mockResolvedValue([]);

    await timelineaiActivityAdapter.getActivity({ userId: "u1" });

    expect(mockPrisma.timeline.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { ownerUserId: "u1" } })
    );
  });

  it("expands a timeline and its moderation history into separate entries", async () => {
    mockPrisma.timeline.findMany.mockResolvedValue([
      {
        id: "t1",
        publicId: "pub-t1",
        title: "My trip",
        visibility: "public",
        moderationStatus: "approved",
        editingState: "published",
        createdAt: now,
        updatedAt: now,
        submittedAt: now,
        approvedAt: now,
        publishedAt: now,
        moderationEvents: [
          { id: "m1", action: "APPROVED", reason: null, createdAt: now },
        ],
      },
    ]);

    const section = await timelineaiActivityAdapter.getActivity({ userId: "u1" });

    expect(section.entries).toHaveLength(2);
    expect(section.entries[0]).toMatchObject({ id: "t1", type: "timeline", status: "published" });
    expect(section.entries[1]).toMatchObject({ id: "m1", type: "moderation_event", status: "APPROVED" });
  });
});

describe("timelineaiActivityAdapter.listAll", () => {
  it("excludes guest-submitted timelines (ownerUserId null) via the where clause", async () => {
    mockPrisma.timeline.findMany.mockResolvedValue([]);

    await timelineaiActivityAdapter.listAll!({ limit: 10 });

    expect(mockPrisma.timeline.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { ownerUserId: { not: null } } })
    );
  });

  it("maps a timeline with its owner from the relation", async () => {
    mockPrisma.timeline.findMany.mockResolvedValue([
      {
        id: "t1",
        publicId: "pub-t1",
        title: "My trip",
        visibility: "public",
        editingState: "published",
        createdAt: now,
        updatedAt: now,
        ownerUserId: "u1",
        owner: { email: "a@b.com", name: "Ada" },
      },
    ]);

    const result = await timelineaiActivityAdapter.listAll!({ limit: 10 });

    expect(result.entries).toHaveLength(1);
    expect(result.entries[0]).toMatchObject({
      id: "t1",
      app: "timelineai",
      type: "timeline",
      owner: { userId: "u1", email: "a@b.com", name: "Ada" },
    });
  });

  it("passes the cursor through combined with the ownerUserId filter", async () => {
    mockPrisma.timeline.findMany.mockResolvedValue([]);
    const cursor = now.toISOString();

    await timelineaiActivityAdapter.listAll!({ limit: 10, cursor });

    expect(mockPrisma.timeline.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { ownerUserId: { not: null }, createdAt: { lt: new Date(cursor) } },
      })
    );
  });

  it("sets nextCursor only when there's an extra row beyond the limit", async () => {
    const rows = Array.from({ length: 3 }, (_, i) => ({
      id: `t${i}`,
      publicId: `pub-${i}`,
      title: "Trip",
      visibility: "public",
      editingState: "published",
      createdAt: new Date(now.getTime() - i * 1000),
      updatedAt: now,
      ownerUserId: "u1",
      owner: { email: "a@b.com", name: "Ada" },
    }));
    mockPrisma.timeline.findMany.mockResolvedValue(rows);

    const result = await timelineaiActivityAdapter.listAll!({ limit: 2 });

    expect(result.entries).toHaveLength(2);
    expect(result.nextCursor).toBe(rows[1]!.createdAt.toISOString());
  });
});
