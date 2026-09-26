import { describe, expect, it } from "vitest";
import {
  RESUMATCH_ENTITY,
  mergeAuditPage,
  resumatchRow,
  resumatchTargetId,
  sourcesFor,
  type AuditStreamRow,
} from "./audit-stream";

function row(id: string, minute: number, source: AuditStreamRow["source"] = "platform"): AuditStreamRow {
  return {
    id,
    source,
    action: "x",
    entity: "User",
    entityId: null,
    changes: null,
    ipAddress: null,
    createdAt: new Date(Date.UTC(2026, 8, 26, 12, minute)),
    user: null,
    summary: null,
  };
}

describe("mergeAuditPage", () => {
  const platform = [row("p3", 50), row("p2", 30), row("p1", 10)];
  const resumatch = [row("resumatch:r2", 40, "resumatch"), row("resumatch:r1", 20, "resumatch")];

  it("interleaves both sources newest first", () => {
    expect(mergeAuditPage([platform, resumatch], 1, 10).map((r) => r.id)).toEqual([
      "p3",
      "resumatch:r2",
      "p2",
      "resumatch:r1",
      "p1",
    ]);
  });

  it("slices the requested page", () => {
    expect(mergeAuditPage([platform, resumatch], 2, 2).map((r) => r.id)).toEqual(["p2", "resumatch:r1"]);
    expect(mergeAuditPage([platform, resumatch], 4, 2)).toEqual([]);
  });

  it("orders same-millisecond rows stably by id", () => {
    const tied = [row("b", 5), row("a", 5)];
    expect(mergeAuditPage([tied], 1, 5).map((r) => r.id)).toEqual(["b", "a"]);
    expect(mergeAuditPage([[...tied].reverse()], 1, 5).map((r) => r.id)).toEqual(["b", "a"]);
  });
});

describe("resumatchRow", () => {
  const users = new Map([["u1", { id: "u1", email: "ali@example.com" }]]);

  it("maps a status change onto the audit stream", () => {
    const mapped = resumatchRow(
      {
        id: "ev1",
        workspaceId: "ws1",
        platformUserId: "u1",
        action: "application.status_changed",
        metadata: { applicationId: "app1", targetJobId: "job1", fromStatus: "OFFER", toStatus: "INTERVIEWING" },
        createdAt: "2026-09-26T15:52:44.165Z",
      },
      users,
    );
    expect(mapped).toMatchObject({
      id: "resumatch:ev1",
      source: "resumatch",
      entity: RESUMATCH_ENTITY,
      entityId: "app1",
      user: { id: "u1", email: "ali@example.com" },
      summary: "Offer → Interviewing",
      ipAddress: null,
    });
    expect(mapped.createdAt.toISOString()).toBe("2026-09-26T15:52:44.165Z");
  });

  it("keeps an unknown user's id rather than showing 'system'", () => {
    const mapped = resumatchRow(
      { id: "ev2", workspaceId: "ws1", platformUserId: "gone", action: "workspace.created", metadata: null, createdAt: "2026-09-26T00:00:00Z" },
      users,
    );
    expect(mapped.user).toEqual({ id: "gone", email: "gone" });
    expect(mapped.entityId).toBe("ws1");
  });
});

describe("resumatchTargetId", () => {
  it("picks the most specific id the event carries", () => {
    expect(resumatchTargetId({ targetJobId: "j", applicationId: "a" }, "ws")).toBe("a");
    expect(resumatchTargetId({ coverLetterId: "c", tailoringId: "t" }, "ws")).toBe("c");
    expect(resumatchTargetId({ count: 1 }, "ws")).toBe("ws");
  });
});

describe("sourcesFor", () => {
  it("reads both sources by default", () => {
    expect(sourcesFor({ source: "", entity: "" })).toEqual({ platform: true, resumatch: true });
  });

  it("honours the source filter", () => {
    expect(sourcesFor({ source: "platform", entity: "" })).toEqual({ platform: true, resumatch: false });
    expect(sourcesFor({ source: "resumatch", entity: "" })).toEqual({ platform: false, resumatch: true });
  });

  it("treats the ResuMatch target as selecting only ResuMatch, and any other target as platform only", () => {
    expect(sourcesFor({ source: "", entity: RESUMATCH_ENTITY })).toEqual({ platform: false, resumatch: true });
    expect(sourcesFor({ source: "", entity: "User" })).toEqual({ platform: true, resumatch: false });
  });
});
