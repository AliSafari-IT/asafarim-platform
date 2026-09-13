import { describe, expect, it } from "vitest";
import {
  activationChecklist,
  activationProgress,
  activationStage,
  headlineFor,
  homeMode,
  type WorkspaceHomeCounts,
} from "./state";

function counts(patch: Partial<WorkspaceHomeCounts> = {}): WorkspaceHomeCounts {
  return {
    projectCount: 0,
    openTaskCount: 0,
    assignedAnyCount: 0,
    assignedOpenCount: 0,
    overdueCount: 0,
    dueTodayCount: 0,
    unassignedCount: 0,
    completedCount: 0,
    pendingProposalCount: 0,
    aiEnabled: true,
    ...patch,
  };
}

describe("activationStage", () => {
  it("is no_projects for a brand-new workspace", () => {
    expect(activationStage(counts())).toBe("no_projects");
  });

  it("is no_tasks once a project exists but nothing was captured", () => {
    expect(activationStage(counts({ projectCount: 1 }))).toBe("no_tasks");
  });

  it("stays past no_tasks when the only work is already completed", () => {
    expect(activationStage(counts({ projectCount: 1, completedCount: 3 }))).toBe(
      "no_assigned_work",
    );
  });

  it("is no_assigned_work when work exists but none of it is mine", () => {
    expect(
      activationStage(counts({ projectCount: 2, openTaskCount: 9, assignedAnyCount: 4 })),
    ).toBe("no_assigned_work");
  });

  it("is active once the viewer has open assigned work", () => {
    expect(
      activationStage(
        counts({ projectCount: 2, openTaskCount: 9, assignedAnyCount: 4, assignedOpenCount: 2 }),
      ),
    ).toBe("active");
  });
});

describe("homeMode", () => {
  it("leads with onboarding only while the workspace is genuinely empty", () => {
    expect(homeMode("no_projects")).toBe("first_run");
    expect(homeMode("no_tasks")).toBe("first_run");
  });

  it("switches to orientation as soon as there is real work", () => {
    expect(homeMode("no_assigned_work")).toBe("oriented");
    expect(homeMode("active")).toBe("oriented");
  });
});

describe("activationChecklist", () => {
  it("marks the first unfinished step as current and the rest as later", () => {
    const steps = activationChecklist(counts());
    expect(steps.map((s) => s.state)).toEqual(["current", "todo", "todo", "todo"]);
    expect(steps[0].id).toBe("project");
  });

  it("advances the current step as the workspace fills up", () => {
    const steps = activationChecklist(counts({ projectCount: 1, openTaskCount: 3 }));
    expect(steps.map((s) => [s.id, s.state])).toEqual([
      ["project", "done"],
      ["capture", "done"],
      ["plan", "current"],
      ["execute", "todo"],
    ]);
  });

  it("completes every step once work has been assigned and finished", () => {
    const full = counts({
      projectCount: 1,
      openTaskCount: 2,
      assignedAnyCount: 2,
      assignedOpenCount: 1,
      completedCount: 5,
    });
    expect(activationChecklist(full).every((s) => s.state === "done")).toBe(true);
    expect(activationProgress(full)).toEqual({ done: 4, total: 4 });
  });

  it("does not regress plan when the last assigned task gets completed", () => {
    const before = counts({
      projectCount: 1,
      openTaskCount: 1,
      assignedAnyCount: 1,
      assignedOpenCount: 1,
    });
    expect(activationChecklist(before).map((s) => s.state)).toEqual([
      "done",
      "done",
      "done",
      "current",
    ]);

    // The one assigned task is finished: no open assigned work is left.
    const after = counts({
      projectCount: 1,
      openTaskCount: 0,
      assignedAnyCount: 0,
      assignedOpenCount: 0,
      completedCount: 1,
    });
    expect(activationChecklist(after).every((s) => s.state === "done")).toBe(true);
    expect(activationProgress(after).done).toBeGreaterThanOrEqual(activationProgress(before).done);
  });

  it("reports partial progress", () => {
    expect(activationProgress(counts({ projectCount: 1 }))).toEqual({ done: 1, total: 4 });
  });
});

describe("headlineFor", () => {
  it("explains the product to a first-time viewer", () => {
    const h = headlineFor("no_projects", "Acme");
    expect(h.title).toMatch(/welcome to tasksai/i);
    expect(h.primary).toMatch(/create your first project/i);
  });

  it("names the workspace once it is in use", () => {
    expect(headlineFor("active", "Acme").title).toContain("Acme");
  });

  it("never exposes internal vocabulary", () => {
    const forbidden = /saved view|ranking engine|membership id|proposal operation|workspace graph/i;
    for (const stage of ["no_projects", "no_tasks", "no_assigned_work", "active"] as const) {
      const h = headlineFor(stage, "Acme");
      expect(`${h.title} ${h.lead} ${h.primary} ${h.hint}`).not.toMatch(forbidden);
    }
    for (const step of activationChecklist(counts())) {
      expect(`${step.title} ${step.description}`).not.toMatch(forbidden);
    }
  });
});
