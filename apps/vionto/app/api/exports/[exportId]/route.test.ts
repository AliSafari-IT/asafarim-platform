import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@asafarim/db", () => ({
  prisma: {
    viontoExport: { findFirst: vi.fn(), delete: vi.fn() },
  },
}));
vi.mock("@/lib/server/auth", () => ({
  getAuthedUser: vi.fn(),
  unauthorized: vi.fn(() => new Response("Unauthorized", { status: 401 })),
  badRequest: vi.fn((message: string) => new Response(message, { status: 400 })),
  serverError: vi.fn((_scope: string, error: unknown) => new Response(String(error), { status: 500 })),
}));
vi.mock("@/lib/server/storage", () => ({
  deleteObject: vi.fn(async () => {}),
}));

import { prisma } from "@asafarim/db";
import { getAuthedUser } from "@/lib/server/auth";
import { deleteObject } from "@/lib/server/storage";
import { DELETE } from "./route";

const mockPrisma = prisma as unknown as {
  viontoExport: { findFirst: ReturnType<typeof vi.fn>; delete: ReturnType<typeof vi.fn> };
};
const mockGetAuthedUser = getAuthedUser as ReturnType<typeof vi.fn>;
const mockDeleteObject = deleteObject as ReturnType<typeof vi.fn>;

function call(exportId: string) {
  return DELETE(new Request(`http://localhost:3004/api/exports/${exportId}`, { method: "DELETE" }), {
    params: Promise.resolve({ exportId }),
  });
}

describe("DELETE /api/exports/[exportId]", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockGetAuthedUser.mockResolvedValue({ id: "u1", email: "u1@example.com" });
    mockPrisma.viontoExport.findFirst.mockResolvedValue({ id: "e1", storageKey: "key/e1.mp4" });
    mockPrisma.viontoExport.delete.mockResolvedValue({});
  });

  it("returns 401 when there is no authenticated user", async () => {
    mockGetAuthedUser.mockResolvedValue(null);

    const res = await call("e1");

    expect(res.status).toBe(401);
    expect(mockPrisma.viontoExport.delete).not.toHaveBeenCalled();
  });

  it("looks the export up scoped to the authenticated user's id — never a caller-supplied one", async () => {
    await call("e1");

    expect(mockPrisma.viontoExport.findFirst).toHaveBeenCalledWith({
      where: { id: "e1", userId: "u1" },
      select: { id: true, storageKey: true },
    });
  });

  it("returns 404 for an export that doesn't exist or isn't owned by the caller", async () => {
    mockPrisma.viontoExport.findFirst.mockResolvedValue(null);

    const res = await call("not-mine");

    expect(res.status).toBe(404);
    expect(mockPrisma.viontoExport.delete).not.toHaveBeenCalled();
    expect(mockDeleteObject).not.toHaveBeenCalled();
  });

  it("deletes the database row and the underlying storage object", async () => {
    const res = await call("e1");

    expect(res.status).toBe(200);
    expect(mockPrisma.viontoExport.delete).toHaveBeenCalledWith({ where: { id: "e1" } });
    expect(mockDeleteObject).toHaveBeenCalledWith("key/e1.mp4");
  });

  it("deletes the DB row before attempting storage cleanup", async () => {
    const order: string[] = [];
    mockPrisma.viontoExport.delete.mockImplementation(async () => {
      order.push("db");
    });
    mockDeleteObject.mockImplementation(async () => {
      order.push("storage");
    });

    await call("e1");

    expect(order).toEqual(["db", "storage"]);
  });

  it("still succeeds — and still removed the DB row — even if storage cleanup throws", async () => {
    mockDeleteObject.mockRejectedValue(new Error("storage backend unreachable"));

    const res = await call("e1");

    expect(res.status).toBe(200);
    expect(mockPrisma.viontoExport.delete).toHaveBeenCalledWith({ where: { id: "e1" } });
  });

  it("degrades to a 500 rather than leaking an unhandled exception when the DB delete itself fails", async () => {
    mockPrisma.viontoExport.delete.mockRejectedValue(new Error("db down"));

    const res = await call("e1");

    expect(res.status).toBe(500);
    // The row delete never committed, so storage must not be touched either.
    expect(mockDeleteObject).not.toHaveBeenCalled();
  });
});
