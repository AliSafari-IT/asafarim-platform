import { beforeEach, describe, expect, it, vi } from "vitest";
import { parseProfileContent } from "../../../../lib/profile/contract";

/** #964: the recheck route. Database-free: workspace, profile version and
 *  Prisma are stubs; the check itself is the real one. */

const previewFindFirst = vi.fn();
const jobFindFirst = vi.fn();
const profile = parseProfileContent({
  skills: [{ name: "Go" }],
  experience: [{ title: "Backend Engineer", employer: "Contoso", summary: "Built Go services that handle 2 million payments a month." }],
});

vi.mock("../../../../lib/workspace", () => ({ getCurrentWorkspace: async () => ({ id: "ws_1" }) }));
vi.mock("../../../../lib/profile/versions", () => ({ getVersion: async () => ({ content: profile }) }));
vi.mock("../../../../lib/db/client", () => ({
  getJobmatchDb: () => ({
    tailorPreview: { findFirst: previewFindFirst },
    targetJob: { findFirst: jobFindFirst },
    candidateEvidence: { findMany: async () => [] },
  }),
}));

const { POST } = await import("./route");
const post = (body: unknown) => POST(new Request("http://localhost/api/tailor/check-claims", { method: "POST", body: JSON.stringify(body) }));

describe("POST /api/tailor/check-claims", () => {
  beforeEach(() => {
    previewFindFirst.mockReset().mockResolvedValue({ profileVersionId: "v1", targetJobId: "j1", context: null });
    jobFindFirst.mockReset().mockResolvedValue({ rawText: "Backend Engineer\nRequirements:\n- Experience with Go" });
  });

  it("checks each edited text against the preview's own sources", async () => {
    const res = await post({
      previewId: "p1",
      items: [
        { field: "bullet", experienceIndex: 0, text: "Built Go services handling 2 million payments a month" },
        { field: "bullet", experienceIndex: 0, text: "Built Go services handling 9 million payments a month" },
      ],
    });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.issues[0]).toEqual([]);
    expect(body.issues[1]).toMatchObject([{ reason: "number_not_found", text: "9" }]);
    expect(previewFindFirst).toHaveBeenCalledWith(expect.objectContaining({ where: { id: "p1", workspaceId: "ws_1" } }));
  });

  it("reads another workspace's preview as missing", async () => {
    previewFindFirst.mockResolvedValue(null);
    expect((await post({ previewId: "p2", items: [{ field: "headline", experienceIndex: null, text: "x" }] })).status).toBe(404);
  });

  it("refuses a malformed or oversized body", async () => {
    expect((await post({ previewId: "p1", items: [] })).status).toBe(400);
    expect((await post({ previewId: "p1", items: [{ field: "letter", experienceIndex: null, text: "x" }] })).status).toBe(400);
    expect((await post({ previewId: "p1", items: Array.from({ length: 81 }, () => ({ field: "headline", experienceIndex: null, text: "x" })) })).status).toBe(400);
  });
});
