import { beforeEach, describe, expect, it, vi } from "vitest";

const getSentEmail = vi.fn();
const getCurrentWorkspace = vi.fn();
vi.mock("../../../../lib/applicationEmail/sentList", () => ({ getSentEmail: (...a: unknown[]) => getSentEmail(...a) }));
vi.mock("../../../../lib/workspace", () => ({ getCurrentWorkspace: () => getCurrentWorkspace() }));

import * as route from "./route";

const get = (sentId = "sent-1") => route.GET(new Request(`http://localhost/api/sent-applications/${sentId}`), { params: Promise.resolve({ sentId }) });

beforeEach(() => {
  getSentEmail.mockReset();
  getCurrentWorkspace.mockReset().mockResolvedValue({ id: "ws-1" });
});

describe("/api/sent-applications/[sentId]", () => {
  it("401s without a workspace", async () => {
    getCurrentWorkspace.mockResolvedValue(null);
    expect((await get()).status).toBe(401);
  });
  it("404s for another workspace's email", async () => {
    getSentEmail.mockResolvedValue(null);
    expect((await get()).status).toBe(404);
    expect(getSentEmail).toHaveBeenCalledWith("ws-1", "sent-1");
  });
  it("has no way to edit or delete a sent email", () => {
    expect(Object.keys(route).filter((name) => ["PUT", "PATCH", "DELETE", "POST"].includes(name))).toEqual([]);
  });
});
