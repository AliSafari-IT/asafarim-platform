import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@asafarim/db", () => ({
  prisma: { viontoExport: { findMany: vi.fn() } },
}));
vi.mock("@/lib/server/auth", () => ({
  getAuthedUser: vi.fn(),
  unauthorized: vi.fn(() => new Response("Unauthorized", { status: 401 })),
  serverError: vi.fn((_scope: string, error: unknown) => new Response(String(error), { status: 500 })),
}));
vi.mock("@/lib/server/storage", () => ({
  createPresignedDownloadUrl: vi.fn(async (key: string) => `https://signed.example/${key}`),
}));

import { prisma } from "@asafarim/db";
import { getAuthedUser } from "@/lib/server/auth";
import { GET } from "./route";

const mockPrisma = prisma as unknown as { viontoExport: { findMany: ReturnType<typeof vi.fn> } };
const mockGetAuthedUser = getAuthedUser as ReturnType<typeof vi.fn>;

const now = new Date("2026-01-01T00:00:00Z");

function row(overrides: Partial<Record<string, unknown>> = {}) {
  return {
    id: "e1",
    projectId: "p1",
    versionId: null,
    renderJobId: "j1",
    storageKey: "key/e1.mp4",
    filename: "e1.mp4",
    userMode: "cinematic",
    renderMode: "cinematic",
    aspectRatio: "16:9",
    aspectLabel: "Landscape",
    visualStyle: "film_grain",
    storyMode: null,
    emotionalTone: null,
    storyKeywords: ["birthday", "family"],
    previewTitle: "Birthday",
    previewSubtitle: null,
    format: "mp4",
    resolution: "1080p",
    durationSeconds: 30,
    fileSizeBytes: 1024,
    musicOption: null,
    musicTrackId: null,
    musicMetadata: null,
    createdAt: now,
    project: { title: "My Project", storyMode: "memory_film", emotionalTone: "nostalgic" },
    version: null,
    ...overrides,
  };
}

function request(qs = ""): Request {
  return new Request(`http://localhost:3004/api/exports/library${qs ? `?${qs}` : ""}`);
}

describe("GET /api/exports/library", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockGetAuthedUser.mockResolvedValue({ id: "u1", email: "u1@example.com" });
    mockPrisma.viontoExport.findMany.mockResolvedValue([]);
  });

  it("returns 401 when there is no authenticated user", async () => {
    mockGetAuthedUser.mockResolvedValue(null);

    const res = await GET(request());

    expect(res.status).toBe(401);
    expect(mockPrisma.viontoExport.findMany).not.toHaveBeenCalled();
  });

  it("scopes the query to the authenticated user's id — never a client-supplied one", async () => {
    await GET(request("userId=someone-else"));

    const call = mockPrisma.viontoExport.findMany.mock.calls[0]![0];
    expect(call.where.userId).toBe("u1");
  });

  it("only returns exports whose render job is completed", async () => {
    await GET(request());

    const call = mockPrisma.viontoExport.findMany.mock.calls[0]![0];
    expect(call.where.renderJob).toEqual({ is: { state: "completed" } });
  });

  it("maps a row to the documented response shape, including a presigned preview URL", async () => {
    mockPrisma.viontoExport.findMany.mockResolvedValue([row()]);

    const res = await GET(request());
    const json = await res.json();

    expect(json.data).toHaveLength(1);
    expect(json.data[0]).toMatchObject({
      id: "e1",
      projectTitle: "My Project",
      versionName: null,
      mode: "cinematic",
      keywords: ["birthday", "family"],
      previewUrl: "https://signed.example/key/e1.mp4",
    });
    expect(json.nextCursor).toBeNull();
  });

  it("falls back through export -> version -> project for storyMode/emotionalTone", async () => {
    mockPrisma.viontoExport.findMany.mockResolvedValue([
      row({ storyMode: null, emotionalTone: null, project: { title: "P", storyMode: "family_archive", emotionalTone: "epic" } }),
    ]);

    const res = await GET(request());
    const json = await res.json();

    expect(json.data[0]).toMatchObject({ storyMode: "family_archive", emotionalTone: "epic" });
  });

  it("filters out non-string entries from storyKeywords defensively", async () => {
    mockPrisma.viontoExport.findMany.mockResolvedValue([row({ storyKeywords: ["ok", 42, null, "also-ok"] })]);

    const res = await GET(request());
    const json = await res.json();

    expect(json.data[0].keywords).toEqual(["ok", "also-ok"]);
  });

  it("clamps the limit to [1, 50], defaulting to 20", async () => {
    await GET(request());
    expect(mockPrisma.viontoExport.findMany.mock.calls[0]![0].take).toBe(21);

    await GET(request("limit=500"));
    expect(mockPrisma.viontoExport.findMany.mock.calls[1]![0].take).toBe(51);

    await GET(request("limit=3"));
    expect(mockPrisma.viontoExport.findMany.mock.calls[2]![0].take).toBe(4);
  });

  it("treats limit=0 as falsy and falls back to the default of 20 (`0 || 20` in the route's own clamp)", async () => {
    await GET(request("limit=0"));
    expect(mockPrisma.viontoExport.findMany.mock.calls[0]![0].take).toBe(21);
  });

  it("requests one extra row to detect a next page, and reports nextCursor as that row's id", async () => {
    mockPrisma.viontoExport.findMany.mockResolvedValue([
      row({ id: "e1" }),
      row({ id: "e2" }),
      row({ id: "e3" }), // the (limit+1)th row — signals more pages, itself excluded from `data`
    ]);

    const res = await GET(request("limit=2"));
    const json = await res.json();

    expect(json.data).toHaveLength(2);
    expect(json.data.map((d: { id: string }) => d.id)).toEqual(["e1", "e2"]);
    expect(json.nextCursor).toBe("e3");
  });

  it("passes a cursor straight through to Prisma's cursor pagination", async () => {
    await GET(request("cursor=e5"));

    const call = mockPrisma.viontoExport.findMany.mock.calls[0]![0];
    expect(call.cursor).toEqual({ id: "e5" });
    expect(call.skip).toBe(1);
  });

  it("orders by the requested sort, defaulting to newest first", async () => {
    await GET(request());
    expect(mockPrisma.viontoExport.findMany.mock.calls[0]![0].orderBy).toEqual([
      { createdAt: "desc" },
      { id: "asc" },
    ]);

    await GET(request("sort=size_desc"));
    expect(mockPrisma.viontoExport.findMany.mock.calls[1]![0].orderBy).toEqual([
      { fileSizeBytes: "desc" },
      { id: "asc" },
    ]);
  });

  it("degrades to a 500 rather than leaking an unhandled exception when the query fails", async () => {
    mockPrisma.viontoExport.findMany.mockRejectedValue(new Error("db down"));

    const res = await GET(request());

    expect(res.status).toBe(500);
  });
});
