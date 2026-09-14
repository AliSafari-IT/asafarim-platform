import { describe, expect, it } from "vitest";
import { DEFAULT_VIEWS, matchesClientFilters, toTaskQuery } from "./model";

describe("view model", () => {
  it("my_work maps @me to the current member id in the query", () => {
    const q = toTaskQuery(DEFAULT_VIEWS.my_work, { me: "mem_42", projectId: undefined });
    expect(q.assigneeId).toBe("mem_42");
  });

  it("list view produces a project-scoped query when given a projectId", () => {
    expect(toTaskQuery(DEFAULT_VIEWS.list, { projectId: "prj_1" })).toEqual({ projectId: "prj_1" });
  });

  it("inbox hides completed tasks", () => {
    const done = { completedAt: "2026-09-01T00:00:00Z", dueDate: null, parentId: null };
    const open = { completedAt: null, dueDate: null, parentId: null };
    expect(matchesClientFilters(done, DEFAULT_VIEWS.inbox)).toBe(false);
    expect(matchesClientFilters(open, DEFAULT_VIEWS.inbox)).toBe(true);
  });

  it("a due-before-@today filter keeps only overdue open tasks", () => {
    const cfg = {
      ...DEFAULT_VIEWS.my_work,
      filters: [{ field: "dueDate", op: "before", value: "@today" } as const],
    };
    const now = new Date("2026-09-06T12:00:00Z");
    expect(
      matchesClientFilters({ completedAt: null, dueDate: "2026-09-01T00:00:00Z", parentId: null }, cfg, now),
    ).toBe(true);
    expect(
      matchesClientFilters({ completedAt: null, dueDate: "2026-09-10T00:00:00Z", parentId: null }, cfg, now),
    ).toBe(false);
  });

  it("board view groups by status by default", () => {
    expect(DEFAULT_VIEWS.board.groupBy).toBe("status");
  });

  // Issue #366: Inbox and My Work must not be the same list with different
  // filters. Inbox = captured-but-unorganized, My Work = planned and mine.
  describe("inbox vs my work", () => {
    it("inbox asks the API for untriaged work, not merely 'not completed'", () => {
      expect(toTaskQuery(DEFAULT_VIEWS.inbox, { me: "mem_1" })).toEqual({ inbox: "true" });
    });

    it("my_work excludes anything still waiting in the Inbox", () => {
      expect(toTaskQuery(DEFAULT_VIEWS.my_work, { me: "mem_1" })).toEqual({
        assigneeId: "mem_1",
        inbox: "false",
      });
    });

    it("a triaged open task is out of the Inbox and into My Work", () => {
      const triaged = {
        completedAt: null,
        dueDate: null,
        parentId: null,
        triagedAt: "2026-09-13T09:00:00Z",
      };
      expect(matchesClientFilters(triaged, DEFAULT_VIEWS.inbox)).toBe(false);
      expect(matchesClientFilters(triaged, DEFAULT_VIEWS.my_work)).toBe(true);
    });

    it("a freshly captured task is in the Inbox and not yet in My Work", () => {
      const captured = { completedAt: null, dueDate: null, parentId: null, triagedAt: null };
      expect(matchesClientFilters(captured, DEFAULT_VIEWS.inbox)).toBe(true);
      expect(matchesClientFilters(captured, DEFAULT_VIEWS.my_work)).toBe(false);
    });
  });
});
