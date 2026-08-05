import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextResponse } from "next/server";

vi.mock("@/lib/server/profiles", () => ({
  requireStudent: vi.fn(),
}));

vi.mock("@/lib/server", () => ({
  handleEduError: vi.fn((_scope: string, error: Error) =>
    NextResponse.json({ error: error.message }, { status: 401 }),
  ),
}));

vi.mock("@/lib/server/auth", () => ({
  badRequest: vi.fn((message: string) =>
    NextResponse.json({ error: message }, { status: 400 }),
  ),
  serverError: vi.fn((_scope: string, error: unknown) =>
    NextResponse.json(
      { error: error instanceof Error ? error.message : String(error) },
      { status: 500 },
    ),
  ),
}));

vi.mock("@/lib/server/inquiries", async () => {
  const actual = await vi.importActual<typeof import("@/lib/server/inquiries")>(
    "@/lib/server/inquiries",
  );
  return {
    InquiryValidationError: actual.InquiryValidationError,
    createInquiry: vi.fn(),
    listInquiriesForStudent: vi.fn(),
  };
});

vi.mock("@/lib/server/ai-orchestrator", () => ({
  orchestrateResponse: vi.fn(() => Promise.resolve()),
}));

import { POST as createInquiryRoute } from "@/app/api/inquiries/route";
import { requireStudent } from "@/lib/server/profiles";
import { createInquiry } from "@/lib/server/inquiries";
import { orchestrateResponse } from "@/lib/server/ai-orchestrator";

function jsonRequest(body: unknown): Request {
  return new Request("http://localhost:3005/api/inquiries", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}

beforeEach(() => {
  vi.mocked(requireStudent).mockReset();
  vi.mocked(createInquiry).mockReset();
  vi.mocked(orchestrateResponse).mockClear();
});

describe("Inquiries API", () => {
  it("creates an inquiry with valid data", async () => {
    vi.mocked(requireStudent).mockResolvedValue({
      user: { id: "student-1", email: "student@example.com", tenantId: null, roles: [] },
      profile: { userId: "student-1" },
    } as never);
    vi.mocked(createInquiry).mockResolvedValue({ id: "inq-1", status: "NEW" });

    const response = await createInquiryRoute(
      jsonRequest({
        subject: "Mathematics",
        gradeLevel: "K12",
        description: "Help with algebra equations",
      }),
    );

    expect(response.status).toBe(201);
    await expect(response.json()).resolves.toEqual({ id: "inq-1", status: "NEW" });
    expect(createInquiry).toHaveBeenCalledWith(
      "student-1",
      expect.objectContaining({
        subject: "Mathematics",
        gradeLevel: "K12",
        description: "Help with algebra equations",
        attachments: [],
      }),
    );
    expect(orchestrateResponse).toHaveBeenCalledWith("inq-1");
  });

  it("returns 400 for missing subject", async () => {
    vi.mocked(requireStudent).mockResolvedValue({
      user: { id: "student-1", email: "student@example.com", tenantId: null, roles: [] },
      profile: { userId: "student-1" },
    } as never);

    const response = await createInquiryRoute(
      jsonRequest({
        gradeLevel: "K12",
        description: "Help with algebra",
      }),
    );

    expect(response.status).toBe(400);
    expect(createInquiry).not.toHaveBeenCalled();
  });

  it("returns 401 for unauthenticated users", async () => {
    const error = new Error("Unauthorized");
    error.name = "EduAuthError";
    vi.mocked(requireStudent).mockRejectedValue(error);

    const response = await createInquiryRoute(
      jsonRequest({
        subject: "Mathematics",
        gradeLevel: "K12",
        description: "Help with algebra equations",
      }),
    );

    expect(response.status).toBe(401);
    expect(createInquiry).not.toHaveBeenCalled();
  });
});
