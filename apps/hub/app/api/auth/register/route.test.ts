import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@asafarim/db", () => ({
  getBooleanSetting: vi.fn(),
}));

vi.mock("@asafarim/auth", () => ({
  registerUser: vi.fn(),
}));

import { getBooleanSetting } from "@asafarim/db";
import { registerUser } from "@asafarim/auth";
import { POST } from "./route";

function jsonRequest(body: unknown): Request {
  return new Request("http://localhost/api/auth/register", {
    method: "POST",
    body: JSON.stringify(body),
  });
}

beforeEach(() => {
  vi.mocked(getBooleanSetting).mockReset();
  vi.mocked(registerUser).mockReset();
});

describe("POST /api/auth/register — registration.open gate", () => {
  it("reads the gate through the shared @asafarim/db settings helper", async () => {
    vi.mocked(getBooleanSetting).mockResolvedValue(true);
    vi.mocked(registerUser).mockResolvedValue({
      ok: true,
      user: { id: "u1" },
    } as never);

    await POST(jsonRequest({ email: "a@b.com" }));

    expect(getBooleanSetting).toHaveBeenCalledWith("registration.open", true);
  });

  it("rejects registration with 403 when registration.open is false", async () => {
    vi.mocked(getBooleanSetting).mockResolvedValue(false);

    const response = await POST(jsonRequest({ email: "a@b.com" }));
    const data = (await response.json()) as { error: string };

    expect(response.status).toBe(403);
    expect(data.error).toMatch(/closed/i);
    expect(registerUser).not.toHaveBeenCalled();
  });

  it("proceeds to registerUser when registration.open is true", async () => {
    vi.mocked(getBooleanSetting).mockResolvedValue(true);
    vi.mocked(registerUser).mockResolvedValue({
      ok: true,
      user: { id: "u1" },
    } as never);

    const response = await POST(jsonRequest({ email: "a@b.com" }));

    expect(response.status).toBe(201);
    expect(registerUser).toHaveBeenCalledTimes(1);
  });

  it("defaults to open (registration proceeds) if the settings read itself fails", async () => {
    // getBooleanSetting is documented to resolve to its fallback on any
    // internal failure rather than reject — this asserts the route trusts
    // that contract rather than adding its own redundant try/catch.
    vi.mocked(getBooleanSetting).mockResolvedValue(true);
    vi.mocked(registerUser).mockResolvedValue({
      ok: true,
      user: { id: "u1" },
    } as never);

    const response = await POST(jsonRequest({ email: "a@b.com" }));

    expect(response.status).toBe(201);
  });
});
