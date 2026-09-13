import { describe, expect, it, vi } from "vitest";
import type { UserActivityAdapter } from "./types";

describe("getAllUserActivity", () => {
  it("degrades one failing adapter without dropping the others' results", async () => {
    const healthy: UserActivityAdapter = {
      app: "healthy-app",
      getActivity: vi
        .fn()
        .mockResolvedValue({ app: "healthy-app", supported: true, available: true, entries: [] }),
    };
    const broken: UserActivityAdapter = {
      app: "broken-app",
      getActivity: vi.fn().mockRejectedValue(new Error("connection refused")),
    };

    const { runAdapter } = await import("./run-adapter");
    const sections = await Promise.all([
      runAdapter(healthy, { userId: "u1" }),
      runAdapter(broken, { userId: "u1" }),
    ]);

    expect(sections[0]).toMatchObject({ app: "healthy-app", available: true });
    expect(sections[1]).toMatchObject({
      app: "broken-app",
      available: false,
      error: "connection refused",
      entries: [],
    });
  });

  it("registers every wired-up adapter by default", async () => {
    const { activityAdapters } = await import("./registry");
    expect(Object.keys(activityAdapters).sort()).toEqual([
      "appbuilder",
      "edumatch",
      "hub",
      "jobmatch",
      "tasksai",
      "testora",
      "timelineai",
      "vionto",
    ]);
  });

  // Hub previously had no adapter (no backing data for its checklist
  // items existed). It's registered now that packages/auth writes a
  // sign_in AuditLog row on every sign-in — see hub.ts for what it does
  // and, just as deliberately, does not report.
  it("registers Hub", async () => {
    const { activityAdapters } = await import("./registry");
    expect(activityAdapters.hub).toBeDefined();
    expect(activityAdapters.hub!.app).toBe("hub");
  });
});
