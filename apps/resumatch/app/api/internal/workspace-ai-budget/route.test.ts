import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const getWorkspaceBudget = vi.fn();
const setWorkspaceBudget = vi.fn();
vi.mock("@/lib/ai/workspaceBudget", async () => {
  const actual = await vi.importActual<
    typeof import("../../../../lib/ai/workspaceBudget")
  >("../../../../lib/ai/workspaceBudget");
  return {
    workspaceBudgetUpdateSchema: actual.workspaceBudgetUpdateSchema,
    getWorkspaceBudget: (...a: unknown[]) => getWorkspaceBudget(...a),
    setWorkspaceBudget: (...a: unknown[]) => setWorkspaceBudget(...a),
  };
});
vi.mock("../../../../lib/db/client", () => ({ getJobmatchDb: () => ({}) }));
vi.mock("../../../../lib/workspace", () => ({ recordAuditEvent: vi.fn() }));

import { GET, PUT } from "./route";

const SECRET = "budget-route-secret";
const URL_BASE = "http://localhost/api/internal/workspace-ai-budget";
const view = {
  workspaceId: "ws-1",
  monthUsd: 1,
  budgetUsd: 10,
  budgetSource: "workspace",
  overrideUsd: 10,
};

const get = (query: string, auth?: string) =>
  GET(
    new Request(`${URL_BASE}${query}`, {
      headers: auth ? { authorization: auth } : {},
    })
  );
const put = (body: unknown, auth?: string) =>
  PUT(
    new Request(URL_BASE, {
      method: "PUT",
      headers: {
        "content-type": "application/json",
        ...(auth ? { authorization: auth } : {}),
      },
      body: typeof body === "string" ? body : JSON.stringify(body),
    })
  );

beforeEach(() => {
  vi.stubEnv("INTERNAL_API_SECRET", SECRET);
  getWorkspaceBudget.mockReset().mockResolvedValue(view);
  setWorkspaceBudget.mockReset().mockResolvedValue(view);
});
afterEach(() => vi.unstubAllEnvs());

describe("auth", () => {
  it("404s with no token, a wrong token, or no secret configured", async () => {
    expect((await get("?workspaceId=ws-1")).status).toBe(404);
    expect((await get("?workspaceId=ws-1", "Bearer wrong")).status).toBe(404);
    expect(
      (await put({ workspaceId: "ws-1", budgetUsd: 1 }, "Bearer wrong")).status
    ).toBe(404);
    vi.stubEnv("INTERNAL_API_SECRET", "");
    expect((await get("?workspaceId=ws-1", "Bearer ")).status).toBe(404);
    expect(getWorkspaceBudget).not.toHaveBeenCalled();
    expect(setWorkspaceBudget).not.toHaveBeenCalled();
  });
});

describe("GET", () => {
  it("returns the budget view", async () => {
    const res = await get("?workspaceId=ws-1", `Bearer ${SECRET}`);
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual(view);
    expect(getWorkspaceBudget).toHaveBeenCalledWith("ws-1");
  });

  it("400s without a workspaceId and 404s for an unknown workspace", async () => {
    expect((await get("", `Bearer ${SECRET}`)).status).toBe(400);
    getWorkspaceBudget.mockResolvedValue(null);
    expect((await get("?workspaceId=nope", `Bearer ${SECRET}`)).status).toBe(
      404
    );
  });
});

describe("PUT", () => {
  it("sets the override", async () => {
    const res = await put(
      { workspaceId: "ws-1", budgetUsd: 10 },
      `Bearer ${SECRET}`
    );
    expect(res.status).toBe(200);
    expect(setWorkspaceBudget).toHaveBeenCalledWith({
      workspaceId: "ws-1",
      budgetUsd: 10,
    });
  });

  it("clears the override with null", async () => {
    expect(
      (await put({ workspaceId: "ws-1", budgetUsd: null }, `Bearer ${SECRET}`))
        .status
    ).toBe(200);
    expect(setWorkspaceBudget).toHaveBeenCalledWith({
      workspaceId: "ws-1",
      budgetUsd: null,
    });
  });

  it("400s on bad JSON or an invalid budget, without writing", async () => {
    expect((await put("{not json", `Bearer ${SECRET}`)).status).toBe(400);
    expect(
      (await put({ workspaceId: "ws-1", budgetUsd: -5 }, `Bearer ${SECRET}`))
        .status
    ).toBe(400);
    expect(setWorkspaceBudget).not.toHaveBeenCalled();
  });

  it("404s for an unknown workspace", async () => {
    setWorkspaceBudget.mockResolvedValue(null);
    expect(
      (await put({ workspaceId: "nope", budgetUsd: 1 }, `Bearer ${SECRET}`))
        .status
    ).toBe(404);
  });
});
