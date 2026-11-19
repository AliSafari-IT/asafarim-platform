import { beforeEach, describe, expect, it, vi } from "vitest";

const listApplicationPage = vi.fn();
const getCurrentWorkspace = vi.fn();

vi.mock("../../../lib/applications/service", async () => {
  class ApplicationNotFoundError extends Error {}
  return {
    ApplicationNotFoundError,
    createApplication: vi.fn(),
    listApplicationPage: (...a: unknown[]) => listApplicationPage(...a),
  };
});
vi.mock("../../../lib/workspace", () => ({ getCurrentWorkspace: () => getCurrentWorkspace() }));

import { DEFAULT_APPLICATION_LIST_QUERY } from "../../../lib/applications/listQuery";
import { GET } from "./route";

const get = (search = "") => GET(new Request(`http://localhost/api/applications${search}`));

beforeEach(() => {
  listApplicationPage.mockReset().mockResolvedValue({
    applications: [],
    total: 0,
    workspaceTotal: 0,
    page: 1,
    pageSize: 20,
    pageCount: 1,
  });
  getCurrentWorkspace.mockReset().mockResolvedValue({ id: "ws-1" });
});

describe("GET /api/applications", () => {
  it("401s without a workspace and reads nothing", async () => {
    getCurrentWorkspace.mockResolvedValue(null);
    const res = await get();
    expect(res.status).toBe(401);
    expect(listApplicationPage).not.toHaveBeenCalled();
  });

  it("lists the session's workspace with the bounded default query", async () => {
    const res = await get();
    expect(res.status).toBe(200);
    expect(listApplicationPage).toHaveBeenCalledWith("ws-1", DEFAULT_APPLICATION_LIST_QUERY);
    expect(await res.json()).toMatchObject({ applications: [], total: 0, pageSize: 20 });
  });

  it("passes a parsed query through and ignores a workspaceId parameter", async () => {
    await get("?q=acme&status=APPLIED&due=today&today=2026-11-19&sort=followUp&page=2&pageSize=100&workspaceId=ws-2");
    expect(listApplicationPage).toHaveBeenCalledWith("ws-1", {
      q: "acme",
      status: "APPLIED",
      due: "today",
      today: "2026-11-19",
      sort: "followUp",
      page: 2,
      pageSize: 100,
    });
  });

  it.each([
    ["?pageSize=101", ["pageSize"]],
    ["?page=0", ["page"]],
    ["?status=HIRED", ["status"]],
    ["?due=overdue", ["today"]],
    ["?sort=random&page=x", ["sort", "page"]],
  ])("400s on %s and names the parameters", async (search, invalid) => {
    const res = await get(search);
    expect(res.status).toBe(400);
    expect((await res.json()).invalid.sort()).toEqual([...invalid].sort());
    expect(listApplicationPage).not.toHaveBeenCalled();
  });
});
