import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextResponse } from "next/server";
import type { AuthedUser } from "@/lib/server/auth";

function mockUser(roles: string[]): AuthedUser {
  return { id: "u1", email: "admin@example.com", tenantId: null, roles };
}

const mockGetAuthedUser = vi.fn<() => Promise<AuthedUser | null>>();

vi.mock("@asafarim/auth", () => ({
  auth: async () => {
    const user = await mockGetAuthedUser();
    if (!user) return null;
    return {
      user: {
        id: user.id,
        email: user.email,
        tenantId: user.tenantId,
        roles: user.roles,
      },
    };
  },
}));

vi.mock("@asafarim/db", () => ({
  prisma: {
    eduStudentProfile: { findUnique: vi.fn().mockResolvedValue(null), count: vi.fn().mockResolvedValue(0) },
    eduTutorProfile: { findUnique: vi.fn().mockResolvedValue(null), count: vi.fn().mockResolvedValue(0) },
    eduTutorVerification: { count: vi.fn().mockResolvedValue(0) },
    eduBooking: {
      findMany: vi.fn().mockResolvedValue([]),
      count: vi.fn().mockResolvedValue(0),
    },
    eduInquiry: {
      findMany: vi.fn().mockResolvedValue([]),
      count: vi.fn().mockResolvedValue(0),
    },
    eduTransaction: {
      findMany: vi.fn().mockResolvedValue([]),
      count: vi.fn().mockResolvedValue(0),
    },
    eduAuditEvent: {
      findMany: vi.fn().mockResolvedValue([]),
    },
    eduWallet: {
      findMany: vi.fn().mockResolvedValue([]),
      count: vi.fn().mockResolvedValue(0),
    },
    user: {
      findMany: vi.fn().mockResolvedValue([]),
      count: vi.fn().mockResolvedValue(0),
    },
  },
}));

vi.mock("@/lib/server/auth", () => ({
  getAuthedUser: () => mockGetAuthedUser(),
  unauthorized: () => NextResponse.json({ error: "Unauthorized" }, { status: 401 }),
  forbidden: (msg = "Forbidden") => NextResponse.json({ error: msg }, { status: 403 }),
  badRequest: (msg: string) => NextResponse.json({ error: msg }, { status: 400 }),
  serverError: (_scope: string, error: unknown) =>
    NextResponse.json({ error: error instanceof Error ? error.message : String(error) }, { status: 500 }),
}));

vi.mock("@/lib/server", () => ({
  handleEduError: vi.fn((_scope: string, error: Error & { status?: number }) => {
    const status = error.status ?? 500;
    return NextResponse.json({ error: error.message }, { status });
  }),
  getAuthedUser: () => mockGetAuthedUser(),
  badRequest: (msg: string) => NextResponse.json({ error: msg }, { status: 400 }),
  serverError: (_scope: string, error: unknown) =>
    NextResponse.json({ error: error instanceof Error ? error.message : String(error) }, { status: 500 }),
}));

beforeEach(() => {
  vi.clearAllMocks();
});

const adminRoutes = [
  { name: "overview", path: "@/app/api/admin/overview/route" },
  { name: "disputes", path: "@/app/api/admin/disputes/route" },
  { name: "bookings", path: "@/app/api/admin/bookings/route" },
  { name: "transactions", path: "@/app/api/admin/transactions/route" },
  { name: "users", path: "@/app/api/admin/users/route" },
  { name: "inquiries", path: "@/app/api/admin/inquiries/route" },
  { name: "audit", path: "@/app/api/admin/audit/route" },
];

for (const route of adminRoutes) {
  describe(`GET /api/admin/${route.name}`, () => {
    it("returns 401 for unauthenticated user", async () => {
      mockGetAuthedUser.mockResolvedValue(null);
      const mod = await import(route.path);
      const req = new Request("http://localhost") as never;
      const res = await mod.GET(req);
      expect(res.status).toBe(401);
    });

    it("returns 403 for student user", async () => {
      mockGetAuthedUser.mockResolvedValue(mockUser(["edumatch_student"]));
      const mod = await import(route.path);
      const req = new Request("http://localhost") as never;
      const res = await mod.GET(req);
      expect(res.status).toBe(403);
    });

    it("returns 200 for admin user", async () => {
      mockGetAuthedUser.mockResolvedValue(mockUser(["edumatch_admin"]));
      const mod = await import(route.path);
      const req = new Request("http://localhost") as never;
      const res = await mod.GET(req);
      expect(res.status).toBe(200);
    });
  });
}
