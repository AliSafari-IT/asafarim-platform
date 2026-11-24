import { beforeEach, describe, expect, it, vi } from "vitest";
import { candidateProfileSchema } from "../../../../lib/profile/contract";

const getCurrentWorkspace = vi.fn();
const recordAuditEvent = vi.fn();
const getLatestVersion = vi.fn();
const createVersion = vi.fn();
const confirmVersion = vi.fn();
vi.mock("../../../../lib/workspace", () => ({
  getCurrentWorkspace: () => getCurrentWorkspace(),
  recordAuditEvent: (...a: unknown[]) => recordAuditEvent(...a),
}));
vi.mock("../../../../lib/profile/versions", () => ({
  getLatestVersion: (...a: unknown[]) => getLatestVersion(...a),
  createVersion: (...a: unknown[]) => createVersion(...a),
  confirmVersion: (...a: unknown[]) => confirmVersion(...a),
}));
vi.mock("../../../../lib/observability/logger", () => ({ logError: vi.fn() }));

import { POST } from "./route";

/** #942: the profile import route. Synthetic data only. */

const imported = candidateProfileSchema.parse({
  headline: "Developer",
  experience: [{ title: "Engineer", employer: "Example Co", startedOn: "2020-01" }],
  skills: [{ name: "TypeScript" }],
});
const exportFile = (confirmedVersionId: string | null = "src-2") =>
  JSON.stringify({
    format: "resumatch-candidate-export",
    formatVersion: "1.0.0",
    exportedAt: "2026-11-24T09:00:00.000Z",
    workspace: { id: "source-ws", createdAt: "2026-01-01T00:00:00.000Z" },
    profile: {
      confirmedVersionId,
      versions: [
        { id: "src-1", versionNumber: 1, createdAt: "2026-11-01T00:00:00.000Z", content: { headline: "Old" } },
        { id: "src-2", versionNumber: 2, createdAt: "2026-11-02T00:00:00.000Z", content: imported },
        { id: "src-3", versionNumber: 3, createdAt: "2026-11-03T00:00:00.000Z", content: { headline: "Newer draft" } },
      ],
    },
    targetJobs: [{ id: "j1" }],
  });

function post(fields: Record<string, string>, file = exportFile()) {
  const form = new FormData();
  form.set("file", new File([file], "resumatch-export.json", { type: "application/json" }));
  for (const [k, v] of Object.entries(fields)) form.set(k, v);
  return POST(new Request("http://localhost/api/profile/import", { method: "POST", body: form }));
}

beforeEach(() => {
  getCurrentWorkspace.mockReset().mockResolvedValue({ id: "dest-ws" });
  getLatestVersion.mockReset().mockResolvedValue(null);
  createVersion.mockReset().mockResolvedValue({ id: "dest-v1", versionNumber: 1 });
  confirmVersion.mockReset();
  recordAuditEvent.mockReset();
});

describe("POST /api/profile/import", () => {
  it("refuses without a session", async () => {
    getCurrentWorkspace.mockResolvedValue(null);
    expect((await post({})).status).toBe(401);
  });

  it("previews without writing anything", async () => {
    const response = await post({ mode: "preview" });
    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.preview.source).toMatchObject({ id: "src-2", confirmed: true });
    expect(body.preview.counts.experience).toEqual({ inExport: 1, imported: 1 });
    expect(body.destination).toEqual({ hasProfile: false, latestVersionNumber: null, latestIsConfirmed: false });
    expect(createVersion).not.toHaveBeenCalled();
  });

  it("imports the confirmed version as a new, unconfirmed version of this workspace", async () => {
    const response = await post({ mode: "import" });
    expect(await response.json()).toEqual({ versionId: "dest-v1", versionNumber: 1, unchanged: false });
    expect(createVersion).toHaveBeenCalledWith({
      workspaceId: "dest-ws",
      content: imported,
      origin: "MANUAL",
      extractorName: "resumatch-export-import",
      extractorVersion: "1.0.0",
      parentVersionId: null,
    });
    // Never confirmed by the import, whatever the source said.
    expect(confirmVersion).not.toHaveBeenCalled();
    expect(recordAuditEvent).toHaveBeenCalledWith("dest-ws", "profile.imported", { outcome: "confirmed_version", count: 1 });
  });

  it("never overwrites an existing profile without an explicit yes", async () => {
    getLatestVersion.mockResolvedValue({ id: "d3", versionNumber: 3, isConfirmed: true, content: candidateProfileSchema.parse({ headline: "Mine" }) });
    const refused = await post({ mode: "import" });
    expect(refused.status).toBe(409);
    expect((await refused.json()).code).toBe("DESTINATION_HAS_PROFILE");
    expect(createVersion).not.toHaveBeenCalled();

    const accepted = await post({ mode: "import", replaceExisting: "true" });
    expect(accepted.status).toBe(200);
    expect(createVersion).toHaveBeenCalledOnce();
  });

  it("writes nothing when the profile already matches", async () => {
    getLatestVersion.mockResolvedValue({ id: "d3", versionNumber: 3, isConfirmed: false, content: imported });
    const response = await post({ mode: "import", replaceExisting: "true" });
    expect(await response.json()).toEqual({ versionId: "d3", versionNumber: 3, unchanged: true });
    expect(createVersion).not.toHaveBeenCalled();
  });

  it("asks for a choice when the export has no confirmed version, then imports the chosen one", async () => {
    const response = await post({ mode: "preview" }, exportFile(null));
    expect(response.status).toBe(422);
    const body = await response.json();
    expect(body.code).toBe("NO_CONFIRMED_VERSION");
    expect(body.versions.map((v: { id: string }) => v.id)).toEqual(["src-3", "src-2", "src-1"]);

    await post({ mode: "import", versionId: "src-1" }, exportFile(null));
    expect(createVersion).toHaveBeenCalledWith(expect.objectContaining({ content: candidateProfileSchema.parse({ headline: "Old" }) }));
    expect(recordAuditEvent).toHaveBeenCalledWith("dest-ws", "profile.imported", { outcome: "selected_version", count: 1 });
  });

  it("rejects a file that is not an export", async () => {
    const response = await post({ mode: "preview" }, "Jordan Example\nDeveloper");
    expect(response.status).toBe(422);
    expect((await response.json()).code).toBe("INVALID_JSON");
  });
});
