import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * The fetch-quality signal (#520) reaches the TargetJob row and the API
 * response, on both the first fetch and a refresh. Database-free: the
 * workspace, the Prisma client and the fetch itself are stubs.
 */

const create = vi.fn();
const update = vi.fn();
const findFirst = vi.fn();
const fetchJobWithFallback = vi.fn();

vi.mock("../../../../lib/workspace", () => ({
  getCurrentWorkspace: async () => ({ id: "ws_1" }),
}));
vi.mock("../../../../lib/db/client", () => ({
  getJobmatchDb: () => ({ targetJob: { create, update, findFirst } }),
}));
vi.mock("../../../../lib/tailoring/jobFetchAi/degraded", () => ({
  fetchJobWithFallback: (...args: unknown[]) => fetchJobWithFallback(...args),
}));

const fetchJob = (await import("./route")).POST;
const refreshJob = (await import("../refresh-job/route")).POST;

const post = (body: unknown) =>
  new Request("http://localhost/api/tailor/fetch-job", {
    method: "POST",
    body: JSON.stringify(body),
  });

const thin = {
  ok: true,
  rawText:
    "Accept all cookies. Reject all. Manage cookie preferences. Subscribe to our newsletter.",
  title: "Careers",
  employer: "Tailspin",
  quality: { looksIncomplete: true, reasons: ["MOSTLY_BOILERPLATE"] },
  degraded: false,
};

describe("fetch-quality signal in the job routes (#520)", () => {
  beforeEach(() => {
    create
      .mockReset()
      .mockImplementation(
        async ({ data }: { data: Record<string, unknown> }) => ({
          id: data.id,
          status: data.status,
          title: data.title ?? null,
          employer: data.employer ?? null,
        })
      );
    update
      .mockReset()
      .mockResolvedValue({ title: thin.title, employer: thin.employer });
    findFirst
      .mockReset()
      .mockResolvedValue({ sourceUrl: "https://jobs.example.test/1" });
    fetchJobWithFallback.mockReset().mockResolvedValue(thin);
  });

  it("fetch-job stores the signal and returns it, without refusing the job", async () => {
    const res = await fetchJob(post({ url: "https://jobs.example.test/1" }));
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.status).toBe("FETCHED");
    expect(body.quality).toEqual({
      looksIncomplete: true,
      reasons: ["MOSTLY_BOILERPLATE"],
    });
    expect(create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          status: "FETCHED",
          fetchLooksIncomplete: true,
          fetchQualityReasons: ["MOSTLY_BOILERPLATE"],
        }),
      })
    );
  });

  it("fetch-job stores no signal on a failed fetch", async () => {
    fetchJobWithFallback.mockResolvedValue({
      ok: false,
      reasonCode: "NO_READABLE_TEXT",
      degraded: true,
    });
    const res = await fetchJob(post({ url: "https://jobs.example.test/1" }));
    const body = await res.json();

    expect(body.status).toBe("FETCH_FAILED");
    expect(body.quality).toBeUndefined();
    const { data } = create.mock.calls[0]![0] as {
      data: Record<string, unknown>;
    };
    expect(data).not.toHaveProperty("fetchLooksIncomplete");
    expect(data).not.toHaveProperty("fetchQualityReasons");
  });

  it("refresh-job overwrites the signal and returns it", async () => {
    fetchJobWithFallback.mockResolvedValue({
      ...thin,
      quality: { looksIncomplete: false, reasons: [] },
    });
    const res = await refreshJob(post({ targetJobId: "tj_1" }));
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.quality).toEqual({ looksIncomplete: false, reasons: [] });
    expect(update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: "tj_1" },
        data: expect.objectContaining({
          fetchLooksIncomplete: false,
          fetchQualityReasons: [],
        }),
      })
    );
  });
});
