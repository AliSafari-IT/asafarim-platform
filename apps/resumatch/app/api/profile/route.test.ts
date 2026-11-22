import { beforeEach, describe, expect, it, vi } from "vitest";
import { candidateProfileSchema } from "../../../lib/profile/contract";

const getCurrentWorkspace = vi.fn();
const getLatestVersion = vi.fn();
const createVersion = vi.fn();
const confirmVersion = vi.fn();
vi.mock("../../../lib/workspace", () => ({ getCurrentWorkspace: () => getCurrentWorkspace() }));
vi.mock("../../../lib/profile/versions", () => ({
  getLatestVersion: (...a: unknown[]) => getLatestVersion(...a),
  createVersion: (...a: unknown[]) => createVersion(...a),
  confirmVersion: (...a: unknown[]) => confirmVersion(...a),
  listVersions: vi.fn(),
}));
vi.mock("../../../lib/observability/logger", () => ({ logError: vi.fn() }));

import { POST } from "./route";

const content = candidateProfileSchema.parse({ fullName: "Ali Safari", headline: "Developer" });
const latest = { id: "v3", versionNumber: 3, isConfirmed: false, content };

const post = (body: unknown) =>
  POST(new Request("http://localhost/api/profile", { method: "POST", body: JSON.stringify(body) }));

beforeEach(() => {
  getCurrentWorkspace.mockReset().mockResolvedValue({ id: "ws-1" });
  getLatestVersion.mockReset().mockResolvedValue(latest);
  createVersion.mockReset().mockResolvedValue({ id: "v4", versionNumber: 4 });
  confirmVersion.mockReset().mockResolvedValue(true);
});

describe("POST /api/profile", () => {
  it("writes no version when nothing changed, and confirms the latest when asked", async () => {
    const response = await post({ content: { ...content, fullName: " Ali  Safari " }, parentVersionId: "v3", confirm: true });
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ versionId: "v3", versionNumber: 3, unchanged: true, confirmed: true });
    expect(createVersion).not.toHaveBeenCalled();
    expect(confirmVersion).toHaveBeenCalledWith("ws-1", "v3");
  });

  it("does nothing at all for an unchanged draft save", async () => {
    const response = await post({ content, parentVersionId: "v3", confirm: false });
    expect(await response.json()).toMatchObject({ versionId: "v3", unchanged: true, confirmed: false });
    expect(createVersion).not.toHaveBeenCalled();
    expect(confirmVersion).not.toHaveBeenCalled();
  });

  it("does not re-confirm an already confirmed version", async () => {
    getLatestVersion.mockResolvedValue({ ...latest, isConfirmed: true });
    const response = await post({ content, parentVersionId: "v3", confirm: true });
    expect(await response.json()).toMatchObject({ unchanged: true, confirmed: true });
    expect(confirmVersion).not.toHaveBeenCalled();
  });

  it("compares with the latest version, not a stale parent", async () => {
    // A stale tab still pointing at v2 whose content equals v3 changes nothing.
    await post({ content, parentVersionId: "v2", confirm: false });
    expect(createVersion).not.toHaveBeenCalled();
  });

  it("writes a new version when something changed", async () => {
    const response = await post({ content: { ...content, headline: "Tester" }, parentVersionId: "v3", confirm: true });
    expect(await response.json()).toEqual({ versionId: "v4", versionNumber: 4, unchanged: false, confirmed: true });
    expect(createVersion).toHaveBeenCalledOnce();
    expect(confirmVersion).toHaveBeenCalledWith("ws-1", "v4");
  });

  it("writes the first version of a new profile", async () => {
    getLatestVersion.mockResolvedValue(null);
    await post({ content, parentVersionId: null, confirm: true });
    expect(createVersion).toHaveBeenCalledOnce();
  });
});
