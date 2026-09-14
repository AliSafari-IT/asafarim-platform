import { describe, expect, it } from "vitest";
import {
  captureDestinationMessage,
  initialTriagedAt,
  isInInbox,
  needsTriage,
  whatIsMissing,
} from "./inbox";

/**
 * The Inbox rule (issue #366). These are the tests that pin down what
 * "captured but not organized" means, independently of any database.
 */
describe("needsTriage", () => {
  it("captures without a project into the Inbox", () => {
    expect(needsTriage({ source: "quick_capture", hasProject: false })).toBe(true);
  });

  it("treats capture into the Inbox container as untriaged even with a project id", () => {
    expect(
      needsTriage({ source: "quick_capture", hasProject: true, intoInboxProject: true }),
    ).toBe(true);
  });

  it("treats choosing a real project as the triage decision", () => {
    expect(needsTriage({ source: "quick_capture", hasProject: true })).toBe(false);
    expect(needsTriage({ source: "manual", hasProject: true })).toBe(false);
  });

  it("always holds unattended channels for review", () => {
    expect(needsTriage({ source: "email", hasProject: true })).toBe(true);
    expect(needsTriage({ source: "integration", hasProject: true })).toBe(true);
  });

  it("imports are organized unless the import asked for review", () => {
    expect(needsTriage({ source: "import", hasProject: true })).toBe(false);
    expect(needsTriage({ source: "import", hasProject: true, forceInbox: true })).toBe(true);
  });

  it("applied AI proposals wait when nobody resolved owner or date", () => {
    expect(needsTriage({ source: "proposal", hasProject: true })).toBe(true);
    expect(needsTriage({ source: "proposal", hasProject: true, hasAssignee: true })).toBe(false);
    expect(needsTriage({ source: "proposal", hasProject: true, hasDueDate: true })).toBe(false);
  });

  it("forceInbox overrides every other consideration", () => {
    expect(
      needsTriage({ source: "manual", hasProject: true, hasAssignee: true, forceInbox: true }),
    ).toBe(true);
  });
});

describe("initialTriagedAt", () => {
  const now = new Date("2026-09-13T10:00:00Z");

  it("is null for work that must be triaged", () => {
    expect(initialTriagedAt({ source: "quick_capture", hasProject: false }, now)).toBeNull();
  });

  it("stamps the moment for work that arrives organized", () => {
    expect(initialTriagedAt({ source: "manual", hasProject: true }, now)).toEqual(now);
  });
});

describe("isInInbox", () => {
  it("is true only for untriaged, uncompleted, unarchived work", () => {
    expect(isInInbox({ triagedAt: null, completedAt: null, archivedAt: null })).toBe(true);
  });

  it("is false once triaged — an item does not linger for being incomplete", () => {
    expect(
      isInInbox({ triagedAt: "2026-09-13T10:00:00Z", completedAt: null, archivedAt: null }),
    ).toBe(false);
  });

  it("is false when completed or archived straight out of the Inbox", () => {
    expect(
      isInInbox({ triagedAt: null, completedAt: "2026-09-13T11:00:00Z", archivedAt: null }),
    ).toBe(false);
    expect(
      isInInbox({ triagedAt: null, completedAt: null, archivedAt: "2026-09-13T11:00:00Z" }),
    ).toBe(false);
  });
});

describe("whatIsMissing", () => {
  it("tells the user what still has to happen before an item counts as organized", () => {
    expect(whatIsMissing({ projectIsInbox: true, assigneeId: null, dueDate: null })).toEqual([
      "project",
      "owner",
      "due date",
    ]);
    expect(
      whatIsMissing({ projectIsInbox: false, assigneeId: "mem_1", dueDate: "2026-09-20" }),
    ).toEqual([]);
  });
});

describe("captureDestinationMessage", () => {
  it("always names where the task went", () => {
    expect(
      captureDestinationMessage({ projectName: "Inbox", isInbox: true, triaged: false }),
    ).toMatch(/Inbox/);
    expect(
      captureDestinationMessage({ projectName: "Website", isInbox: false, triaged: true }),
    ).toBe("Captured to Website.");
    expect(
      captureDestinationMessage({ projectName: "Website", isInbox: false, triaged: false }),
    ).toMatch(/Website.*Inbox/);
  });
});
