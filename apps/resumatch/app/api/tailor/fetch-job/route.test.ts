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
const findRecentFetch = vi.fn();
const openDraft = vi.fn();

vi.mock("../../../../lib/workspace", () => ({
  getCurrentWorkspace: async () => ({ id: "ws_1" }),
}));
vi.mock("../../../../lib/db/client", () => ({
  getJobmatchDb: () => ({ targetJob: { create, update, findFirst } }),
}));
vi.mock("../../../../lib/tailoring/jobFetchAi/degraded", () => ({
  fetchJobWithFallback: (...args: unknown[]) => fetchJobWithFallback(...args),
}));

vi.mock("../../../../lib/tailoring/drafts/store", () => ({
  findRecentFetch: (...args: unknown[]) => findRecentFetch(...args),
  openDraft: (...args: unknown[]) => openDraft(...args),
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
    findRecentFetch.mockReset().mockResolvedValue(null);
    openDraft.mockReset().mockResolvedValue(undefined);
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

describe("Tailor drafts in fetch-job", () => {
  const earlier = {
    id: "tj_old",
    status: "FETCHED",
    title: "IT Functional Analyst",
    employer: "Kingfisher",
    rawText: "Als Functioneel Analist speel je een belangrijke rol. ".repeat(20),
    fetchedAt: new Date("2026-11-24T10:00:00Z"),
    fetchLooksIncomplete: false,
    fetchQualityReasons: [],
  };

  beforeEach(() => {
    create.mockReset().mockImplementation(async ({ data }: { data: Record<string, unknown> }) => ({
      id: data.id,
      status: data.status,
      title: data.title ?? null,
      employer: data.employer ?? null,
    }));
    fetchJobWithFallback.mockReset().mockResolvedValue(thin);
    findRecentFetch.mockReset().mockResolvedValue(null);
    openDraft.mockReset().mockResolvedValue(undefined);
  });

  it("opens a draft for a newly fetched job", async () => {
    const res = await fetchJob(post({ url: "https://jobs.example.test/1" }));
    const body = await res.json();
    expect(body.reused).toBeUndefined();
    expect(openDraft).toHaveBeenCalledWith("ws_1", body.id, null);
  });

  it("reuses a recent fetch of the same URL without fetching or paying again", async () => {
    findRecentFetch.mockResolvedValue(earlier);
    const res = await fetchJob(post({ url: "  https://jobs.example.test/1  " }));
    const body = await res.json();

    expect(findRecentFetch).toHaveBeenCalledWith("ws_1", "https://jobs.example.test/1");
    expect(fetchJobWithFallback).not.toHaveBeenCalled();
    expect(create).not.toHaveBeenCalled();
    expect(body).toMatchObject({
      id: "tj_old",
      status: "FETCHED",
      title: "IT Functional Analyst",
      reused: true,
      fetchedAt: "2026-11-24T10:00:00.000Z",
    });
    expect(body.snippet).toHaveLength(400);
    expect(openDraft).toHaveBeenCalledWith("ws_1", "tj_old");
  });

  it("fetches again on refresh and carries the old draft over", async () => {
    findRecentFetch.mockResolvedValue(earlier);
    const res = await fetchJob(post({ url: "https://jobs.example.test/1", refresh: true }));
    const body = await res.json();

    expect(fetchJobWithFallback).toHaveBeenCalledTimes(1);
    expect(body.id).not.toBe("tj_old");
    expect(body.reused).toBeUndefined();
    expect(openDraft).toHaveBeenCalledWith("ws_1", body.id, "tj_old");
  });

  it("opens no draft when the fetch fails", async () => {
    fetchJobWithFallback.mockResolvedValue({ ok: false, reasonCode: "TIMEOUT", degraded: true });
    await fetchJob(post({ url: "https://jobs.example.test/1" }));
    expect(openDraft).not.toHaveBeenCalled();
  });

  it("refuses a refresh flag that isn't a boolean", async () => {
    const res = await fetchJob(post({ url: "https://jobs.example.test/1", refresh: "yes" }));
    expect(res.status).toBe(400);
  });
});
