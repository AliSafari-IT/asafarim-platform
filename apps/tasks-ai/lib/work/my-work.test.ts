import { describe, expect, it } from "vitest";
import {
  dueLabel,
  emptyStateFor,
  groupIdFor,
  groupMyWork,
  planShortcutDate,
  sortWithinGroup,
  summarize,
  summaryLine,
  type MyWorkContextCounts,
  type MyWorkItem,
} from "./my-work";

const NOW = new Date("2026-09-14T09:30:00.000Z");
/** UTC calendar midnights, the way a date input's value is stored. */
const day = (iso: string) => `${iso}T00:00:00.000Z`;

function item(over: Partial<MyWorkItem> & { id: string }): MyWorkItem {
  return {
    title: `task ${over.id}`,
    projectId: "p1",
    projectKey: "APP",
    projectName: "Application",
    projectIsInbox: false,
    statusName: null,
    statusCategory: null,
    assigneeId: "me",
    dueDate: null,
    completedAt: null,
    blockedBy: 0,
    blocks: 0,
    labels: [],
    position: 0,
    updatedAt: "2026-09-01T00:00:00.000Z",
    version: 1,
    ...over,
  };
}

describe("My Work grouping (#367)", () => {
  it("separates overdue, today, upcoming and undated work", () => {
    const groups = groupMyWork(
      [
        item({ id: "late", dueDate: day("2026-09-10") }),
        item({ id: "now", dueDate: day("2026-09-14") }),
        item({ id: "soon", dueDate: day("2026-09-20") }),
        item({ id: "someday" }),
      ],
      NOW,
    );
    expect(groups.map((g) => g.id)).toEqual(["overdue", "today", "upcoming", "undated"]);
    expect(groups.map((g) => g.items.map((i) => i.id))).toEqual([
      ["late"],
      ["now"],
      ["soon"],
      ["someday"],
    ]);
  });

  it("puts every task in exactly one group — a row is never shown twice", () => {
    const items = [
      item({ id: "a", dueDate: day("2026-09-01"), blockedBy: 2 }),
      item({ id: "b", dueDate: day("2026-09-14"), blockedBy: 1 }),
      item({ id: "c", dueDate: day("2026-10-01"), blockedBy: 1 }),
      item({ id: "d", blockedBy: 3 }),
      item({ id: "e" }),
    ];
    const rendered = groupMyWork(items, NOW).flatMap((g) => g.items.map((i) => i.id));
    expect(rendered.slice().sort()).toEqual(["a", "b", "c", "d", "e"]);
    expect(new Set(rendered).size).toBe(rendered.length);
  });

  it("keeps blocked-but-urgent work in its date section, and badges it there", () => {
    // Time pressure beats waiting: an overdue blocked task must not vanish
    // into a section people read as "not today's problem".
    expect(groupIdFor(item({ id: "x", dueDate: day("2026-09-01"), blockedBy: 1 }), NOW)).toBe(
      "overdue",
    );
    expect(groupIdFor(item({ id: "y", dueDate: day("2026-09-14"), blockedBy: 1 }), NOW)).toBe(
      "today",
    );
    // Undated or future blocked work is what Blocked is for.
    expect(groupIdFor(item({ id: "z", blockedBy: 1 }), NOW)).toBe("blocked");
    expect(groupIdFor(item({ id: "w", dueDate: day("2026-09-30"), blockedBy: 1 }), NOW)).toBe(
      "blocked",
    );
  });

  it("drops completed tasks out of the active sections", () => {
    const groups = groupMyWork(
      [
        item({ id: "done", dueDate: day("2026-09-10"), completedAt: "2026-09-12T10:00:00.000Z" }),
        item({ id: "open", dueDate: day("2026-09-10") }),
      ],
      NOW,
    );
    expect(groups).toHaveLength(1);
    expect(groups[0].items.map((i) => i.id)).toEqual(["open"]);
  });

  it("moves a task to the right group when its date changes", () => {
    const before = item({ id: "t", dueDate: day("2026-09-10") });
    expect(groupIdFor(before, NOW)).toBe("overdue");
    expect(groupIdFor({ ...before, dueDate: day("2026-09-14") }, NOW)).toBe("today");
    expect(groupIdFor({ ...before, dueDate: day("2026-09-21") }, NOW)).toBe("upcoming");
    expect(groupIdFor({ ...before, dueDate: null }, NOW)).toBe("undated");
  });

  it("keeps cross-project rows distinguishable by project", () => {
    const groups = groupMyWork(
      [
        item({ id: "a", title: "Ship it", projectKey: "APP", dueDate: day("2026-09-20") }),
        item({ id: "b", title: "Ship it", projectKey: "OPS", dueDate: day("2026-09-21") }),
      ],
      NOW,
    );
    expect(groups[0].items.map((i) => i.projectKey)).toEqual(["APP", "OPS"]);
  });
});

describe("My Work sorting (#367)", () => {
  it("overdue is oldest due date first", () => {
    const sorted = sortWithinGroup("overdue", [
      item({ id: "b", dueDate: day("2026-09-12") }),
      item({ id: "a", dueDate: day("2026-09-02") }),
      item({ id: "c", dueDate: day("2026-09-13") }),
    ]);
    expect(sorted.map((i) => i.id)).toEqual(["a", "b", "c"]);
  });

  it("upcoming is nearest due date first", () => {
    const sorted = sortWithinGroup("upcoming", [
      item({ id: "far", dueDate: day("2026-12-01") }),
      item({ id: "near", dueDate: day("2026-09-16") }),
    ]);
    expect(sorted.map((i) => i.id)).toEqual(["near", "far"]);
  });

  it("ties break on position then id, so rows never jump after an unrelated update", () => {
    const rows = [
      item({ id: "b2", dueDate: day("2026-09-20"), position: 2 }),
      item({ id: "a1", dueDate: day("2026-09-20"), position: 1 }),
      item({ id: "a2", dueDate: day("2026-09-20"), position: 2 }),
    ];
    const first = sortWithinGroup("upcoming", rows).map((i) => i.id);
    // An update that touches nothing the comparator reads must not reorder.
    const second = sortWithinGroup(
      "upcoming",
      rows.map((r) => (r.id === "a1" ? { ...r, title: "renamed" } : r)),
    ).map((i) => i.id);
    expect(first).toEqual(["a1", "a2", "b2"]);
    expect(second).toEqual(first);
  });

  it("undated is most recently updated first", () => {
    const sorted = sortWithinGroup("undated", [
      item({ id: "old", updatedAt: "2026-08-01T00:00:00.000Z" }),
      item({ id: "fresh", updatedAt: "2026-09-13T00:00:00.000Z" }),
    ]);
    expect(sorted.map((i) => i.id)).toEqual(["fresh", "old"]);
  });

  it("never leads a dated section with a dateless straggler", () => {
    const sorted = sortWithinGroup("blocked", [
      item({ id: "nodate", blockedBy: 1 }),
      item({ id: "dated", blockedBy: 1, dueDate: day("2026-09-30") }),
    ]);
    expect(sorted.map((i) => i.id)).toEqual(["dated", "nodate"]);
  });
});

describe("My Work summary (#367)", () => {
  it("counts each planning state once and renders the compact line", () => {
    const items = [
      item({ id: "1", dueDate: day("2026-09-01") }),
      item({ id: "2", dueDate: day("2026-09-02") }),
      item({ id: "3", dueDate: day("2026-09-14") }),
      item({ id: "4", dueDate: day("2026-09-20") }),
      item({ id: "5" }),
      item({ id: "6", completedAt: "2026-09-13T00:00:00.000Z" }),
    ];
    const summary = summarize(items, NOW);
    expect(summary).toEqual({
      overdue: 2,
      today: 1,
      blocked: 0,
      upcoming: 1,
      undated: 1,
      total: 5,
    });
    expect(summaryLine(summary)).toBe("2 overdue · 1 due today · 1 upcoming · 1 with no date");
  });

  it("says so plainly when nothing is open", () => {
    expect(summaryLine(summarize([], NOW))).toBe("Nothing open is assigned to you.");
  });
});

describe("My Work empty states (#367)", () => {
  const base: MyWorkContextCounts = {
    assignedOpen: 0,
    assignedCompleted: 0,
    workspaceOpen: 0,
    workspaceUnowned: 0,
    inboxWaiting: 0,
    canPlan: true,
  };

  it("is not empty at all when the caller has open work", () => {
    expect(emptyStateFor({ ...base, assignedOpen: 3 })).toBeNull();
  });

  it("nothing ever assigned points at capture and projects", () => {
    const state = emptyStateFor(base)!;
    expect(state.kind).toBe("nothing_assigned");
    expect(state.actions).toEqual(["capture", "projects"]);
    expect(state.tone).toBe("neutral");
  });

  it("everything finished is a positive state, not an error", () => {
    const state = emptyStateFor({ ...base, assignedCompleted: 4 })!;
    expect(state.kind).toBe("all_done");
    expect(state.tone).toBe("positive");
    expect(state.description).not.toMatch(/no tasks match/i);
  });

  it("unowned work in the workspace explains the distinction", () => {
    const state = emptyStateFor({ ...base, workspaceOpen: 9, workspaceUnowned: 4 })!;
    expect(state.kind).toBe("unowned_work_exists");
    expect(state.description).toMatch(/only what is assigned to you/i);
    expect(state.actions).toContain("inbox");
  });

  it("a guest is not offered actions their role cannot take", () => {
    const state = emptyStateFor({
      ...base,
      workspaceOpen: 5,
      workspaceUnowned: 2,
      canPlan: false,
    })!;
    expect(state.actions).not.toContain("capture");
  });

  // Regression (PR #375 review): the guest gate was only applied to the
  // unowned-work branch, so a guest with nothing assigned — or with
  // everything finished — was still offered a capture button whose dialog
  // refuses to open.
  it("never offers capture to a viewer who may not create work", () => {
    const guest = { ...base, canPlan: false };
    expect(emptyStateFor(guest)!.kind).toBe("nothing_assigned");
    expect(emptyStateFor(guest)!.actions).not.toContain("capture");

    const done = emptyStateFor({ ...guest, assignedCompleted: 4 })!;
    expect(done.kind).toBe("all_done");
    expect(done.actions).not.toContain("capture");

    const doneWithInbox = emptyStateFor({ ...guest, assignedCompleted: 4, inboxWaiting: 2 })!;
    expect(doneWithInbox.actions).not.toContain("capture");
    expect(doneWithInbox.actions).toContain("inbox");
  });

  it("still offers capture in every branch to a viewer who may plan", () => {
    expect(emptyStateFor(base)!.actions).toContain("capture");
    expect(emptyStateFor({ ...base, assignedCompleted: 4 })!.actions).toContain("capture");
    expect(
      emptyStateFor({ ...base, assignedCompleted: 4, inboxWaiting: 2 })!.actions,
    ).toContain("capture");
    expect(
      emptyStateFor({ ...base, workspaceOpen: 5, workspaceUnowned: 2 })!.actions,
    ).toContain("capture");
  });
});

describe("My Work planning shortcuts (#367)", () => {
  it("moves work to UTC calendar midnights, matching how dates are stored", () => {
    expect(planShortcutDate("today", NOW)).toBe(day("2026-09-14"));
    expect(planShortcutDate("tomorrow", NOW)).toBe(day("2026-09-15"));
    expect(planShortcutDate("next_week", NOW)).toBe(day("2026-09-21"));
    expect(planShortcutDate("clear", NOW)).toBeNull();
  });

  it("a task moved to today lands in the Today group", () => {
    const moved = { ...item({ id: "t" }), dueDate: planShortcutDate("today", NOW) };
    expect(groupIdFor(moved, NOW)).toBe("today");
  });

  it("labels the due state in words a person can act on", () => {
    expect(dueLabel(item({ id: "a", dueDate: day("2026-09-14") }), NOW)).toBe("Today");
    expect(dueLabel(item({ id: "b", dueDate: day("2026-09-15") }), NOW)).toBe("Tomorrow");
    expect(dueLabel(item({ id: "c", dueDate: day("2026-09-11") }), NOW)).toBe("3 days late");
    expect(dueLabel(item({ id: "d" }), NOW)).toBe("No date");
  });
});
