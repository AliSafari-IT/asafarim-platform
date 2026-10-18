/**
 * Issue #542: the in-flight claim that keeps two AI attempts for the same
 * inquiry from both reaching a paid provider.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";

const prismaMock = vi.hoisted(() => ({
  eduInquiry: { updateMany: vi.fn() },
}));
vi.mock("@asafarim/db", () => ({ prisma: prismaMock }));

import {
  AI_CLAIM_STALE_MS,
  claimAiGeneration,
  releaseAiClaim,
} from "@/lib/server/ai-claim";

const NOW = new Date("2026-10-18T09:00:00.000Z");

beforeEach(() => {
  prismaMock.eduInquiry.updateMany.mockReset();
});

describe("claimAiGeneration", () => {
  it("claims a free inquiry without reporting a takeover", async () => {
    prismaMock.eduInquiry.updateMany.mockResolvedValueOnce({ count: 1 });

    const claim = await claimAiGeneration("inq-1", { now: NOW });

    expect(claim).toEqual({
      claimed: true,
      claimedAt: NOW,
      staleTakeover: false,
    });
    expect(prismaMock.eduInquiry.updateMany).toHaveBeenCalledTimes(1);
    expect(prismaMock.eduInquiry.updateMany).toHaveBeenCalledWith({
      where: { id: "inq-1", aiClaimedAt: null },
      data: { aiClaimedAt: NOW },
    });
  });

  it("refuses while another attempt holds a live claim", async () => {
    prismaMock.eduInquiry.updateMany
      .mockResolvedValueOnce({ count: 0 })
      .mockResolvedValueOnce({ count: 0 });

    const claim = await claimAiGeneration("inq-1", { now: NOW });

    expect(claim).toEqual({ claimed: false });
    // The takeover query only matches claims older than the stale window.
    expect(prismaMock.eduInquiry.updateMany).toHaveBeenLastCalledWith({
      where: {
        id: "inq-1",
        aiClaimedAt: { lt: new Date(NOW.getTime() - AI_CLAIM_STALE_MS) },
      },
      data: { aiClaimedAt: NOW },
    });
  });

  it("takes over a stale claim and reports it", async () => {
    prismaMock.eduInquiry.updateMany
      .mockResolvedValueOnce({ count: 0 })
      .mockResolvedValueOnce({ count: 1 });

    const claim = await claimAiGeneration("inq-1", { now: NOW });

    expect(claim).toEqual({
      claimed: true,
      claimedAt: NOW,
      staleTakeover: true,
    });
  });

  it("applies the status filter to both queries", async () => {
    prismaMock.eduInquiry.updateMany
      .mockResolvedValueOnce({ count: 0 })
      .mockResolvedValueOnce({ count: 0 });

    await claimAiGeneration("inq-1", {
      now: NOW,
      excludeStatuses: ["AI_RESPONDED", "REFUSED"],
    });

    for (const [arg] of prismaMock.eduInquiry.updateMany.mock.calls) {
      expect(arg.where.status).toEqual({ notIn: ["AI_RESPONDED", "REFUSED"] });
    }
  });
});

describe("releaseAiClaim", () => {
  it("clears only the caller's own claim", async () => {
    prismaMock.eduInquiry.updateMany.mockResolvedValueOnce({ count: 1 });

    await releaseAiClaim("inq-1", NOW);

    expect(prismaMock.eduInquiry.updateMany).toHaveBeenCalledWith({
      where: { id: "inq-1", aiClaimedAt: NOW },
      data: { aiClaimedAt: null },
    });
  });

  it("never throws when the release fails", async () => {
    const error = vi.spyOn(console, "error").mockImplementation(() => {});
    prismaMock.eduInquiry.updateMany.mockRejectedValueOnce(new Error("db down"));

    await expect(releaseAiClaim("inq-1", NOW)).resolves.toBeUndefined();
    expect(error).toHaveBeenCalled();
    error.mockRestore();
  });
});
