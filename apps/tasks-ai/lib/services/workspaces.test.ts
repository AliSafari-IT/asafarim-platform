import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../db/client", () => ({
  getTasksAiDb: vi.fn(),
}));
vi.mock("../session", () => ({
  getViewer: vi.fn(),
}));
// Not exercised by listMyWorkspaces, but imported by the module under test.
vi.mock("../events/emit", () => ({ emitActivity: vi.fn() }));

import { getTasksAiDb } from "../db/client";
import { getViewer } from "../session";
import { listMyWorkspaces } from "./workspaces";

const mockDb = { membership: { findMany: vi.fn() } };
const mockGetTasksAiDb = getTasksAiDb as unknown as ReturnType<typeof vi.fn>;
const mockGetViewer = getViewer as unknown as ReturnType<typeof vi.fn>;

const now = new Date("2026-01-01T00:00:00Z");

describe("listMyWorkspaces", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockGetTasksAiDb.mockReturnValue(mockDb);
    mockGetViewer.mockResolvedValue({ id: "u1", roles: [] });
    mockDb.membership.findMany.mockResolvedValue([]);
  });

  it("rejects when there is no viewer — the /workspace page never actually reaches this, but the function must not silently return an empty list for an unauthenticated caller", async () => {
    mockGetViewer.mockResolvedValue(null);

    await expect(listMyWorkspaces()).rejects.toThrow();
  });

  it("returns an empty array for an authenticated user with zero workspaces", async () => {
    const result = await listMyWorkspaces();
    expect(result).toEqual([]);
  });

  it("returns exactly one workspace, with its role attached", async () => {
    mockDb.membership.findMany.mockResolvedValue([
      { role: "owner", workspace: { id: "w1", name: "Acme", slug: "acme", createdAt: now } },
    ]);

    const result = await listMyWorkspaces();

    expect(result).toEqual([{ id: "w1", name: "Acme", slug: "acme", createdAt: now, role: "owner" }]);
  });

  it("returns every workspace when the user belongs to more than one", async () => {
    mockDb.membership.findMany.mockResolvedValue([
      { role: "owner", workspace: { id: "w1", name: "Acme", slug: "acme", createdAt: now } },
      { role: "member", workspace: { id: "w2", name: "Globex", slug: "globex", createdAt: now } },
    ]);

    const result = await listMyWorkspaces();

    expect(result).toHaveLength(2);
    expect(result.map((w) => w.slug)).toEqual(["acme", "globex"]);
  });

  it("scopes the query to the authenticated user, excluding archived memberships and archived workspaces", async () => {
    await listMyWorkspaces();

    expect(mockDb.membership.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { platformUserId: "u1", archivedAt: null, workspace: { archivedAt: null } },
      })
    );
  });

  it("propagates a DB failure rather than swallowing it — Next.js turns this into a controlled 500, not a silently empty list", async () => {
    mockDb.membership.findMany.mockRejectedValue(new Error("connection refused"));

    await expect(listMyWorkspaces()).rejects.toThrow("connection refused");
  });
});
