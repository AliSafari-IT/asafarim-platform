import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextResponse } from "next/server";
import type { AuthedUser } from "@/lib/server/auth";

function mockUser(roles: string[]): AuthedUser {
  return { id: "u1", email: "test@example.com", tenantId: null, roles };
}

const mockGetAuthedUser = vi.fn<() => Promise<AuthedUser | null>>();

vi.mock("@/lib/server/auth", () => ({
  getAuthedUser: () => mockGetAuthedUser(),
  requireAuth: async () => {
    const user = await mockGetAuthedUser();
    if (!user) throw new Error("Unauthorized");
    return user;
  },
  unauthorized: () => NextResponse.json({ error: "Unauthorized" }, { status: 401 }),
  forbidden: (msg = "Forbidden") => NextResponse.json({ error: msg }, { status: 403 }),
  badRequest: (msg: string) => NextResponse.json({ error: msg }, { status: 400 }),
  serverError: (_scope: string, error: unknown) =>
    NextResponse.json(
      { error: error instanceof Error ? error.message : String(error) },
      { status: 500 },
    ),
}));

vi.mock("@/lib/server", () => ({
  handleEduError: vi.fn((_scope: string, error: Error & { status?: number }) => {
    const status = error.status ?? 500;
    return NextResponse.json({ error: error.message }, { status });
  }),
  getAuthedUser: () => mockGetAuthedUser(),
  badRequest: (msg: string) => NextResponse.json({ error: msg }, { status: 400 }),
  serverError: (_scope: string, error: unknown) =>
    NextResponse.json(
      { error: error instanceof Error ? error.message : String(error) },
      { status: 500 },
    ),
}));

vi.mock("@asafarim/db", () => ({
  prisma: {
    eduStudentProfile: { findUnique: vi.fn().mockResolvedValue(null) },
    eduTutorProfile: { findUnique: vi.fn().mockResolvedValue(null) },
  },
}));

vi.mock("@asafarim/auth", () => ({
  auth: () => Promise.resolve(null),
}));

vi.mock("@/lib/server/tutor-verification", () => ({
  listAdminVerificationQueue: vi.fn().mockResolvedValue([]),
}));

vi.mock("@/lib/server/tutor-matching", () => ({
  findBestTutors: vi.fn().mockResolvedValue([]),
}));

beforeEach(() => {
  vi.clearAllMocks();

  vi.doMock("@asafarim/auth", () => ({
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
});

describe("GET /api/admin/tutor-verifications", () => {
  it("returns 401 for unauthenticated user", async () => {
    mockGetAuthedUser.mockResolvedValue(null);
    const { GET } = await import("@/app/api/admin/tutor-verifications/route");
    const res = await GET(new Request("http://localhost") as never);
    expect(res.status).toBe(401);
  });

  it("returns 403 for student-only user", async () => {
    mockGetAuthedUser.mockResolvedValue(mockUser(["edumatch_student"]));
    const { GET } = await import("@/app/api/admin/tutor-verifications/route");
    const res = await GET(new Request("http://localhost") as never);
    expect(res.status).toBe(403);
  });

  it("returns 200 for edumatch_admin user", async () => {
    mockGetAuthedUser.mockResolvedValue(mockUser(["edumatch_admin"]));
    const { GET } = await import("@/app/api/admin/tutor-verifications/route");
    const res = await GET(new Request("http://localhost") as never);
    expect(res.status).toBe(200);
  });

  it("returns 200 for superadmin user", async () => {
    mockGetAuthedUser.mockResolvedValue(mockUser(["superadmin"]));
    const { GET } = await import("@/app/api/admin/tutor-verifications/route");
    const res = await GET(new Request("http://localhost") as never);
    expect(res.status).toBe(200);
  });
});

describe("POST /api/admin/tutor-matching/debug", () => {
  const validBody = {
    lat: 51.5074,
    lng: -0.1278,
    subject: "Math",
    gradeLevel: "K12",
  };

  it("returns 401 for unauthenticated user", async () => {
    mockGetAuthedUser.mockResolvedValue(null);
    const { POST } = await import("@/app/api/admin/tutor-matching/debug/route");
    const req = new Request("http://localhost", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(validBody),
    });
    const res = await POST(req);
    expect(res.status).toBe(401);
  });

  it("returns 403 for tutor-only user", async () => {
    mockGetAuthedUser.mockResolvedValue(mockUser(["edumatch_tutor"]));
    const { POST } = await import("@/app/api/admin/tutor-matching/debug/route");
    const req = new Request("http://localhost", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(validBody),
    });
    const res = await POST(req);
    expect(res.status).toBe(403);
  });

  it("returns 200 for edumatch_admin user", async () => {
    mockGetAuthedUser.mockResolvedValue(mockUser(["edumatch_admin"]));
    const { POST } = await import("@/app/api/admin/tutor-matching/debug/route");
    const req = new Request("http://localhost", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(validBody),
    });
    const res = await POST(req);
    expect(res.status).toBe(200);
  });

  it("returns 200 for global admin user", async () => {
    mockGetAuthedUser.mockResolvedValue(mockUser(["admin"]));
    const { POST } = await import("@/app/api/admin/tutor-matching/debug/route");
    const req = new Request("http://localhost", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(validBody),
    });
    const res = await POST(req);
    expect(res.status).toBe(200);
  });
});
