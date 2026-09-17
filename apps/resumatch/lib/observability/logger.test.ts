import { describe, expect, it } from "vitest";
import { buildLogEvent } from "./logger";

describe("structured logger", () => {
  it("emits a stable, machine-parseable envelope", () => {
    const event = buildLogEvent("info", "workspace.opened", { workspaceId: "w1" }, new Date(0));
    expect(event).toEqual({
      level: "info",
      service: "jobmatch",
      event: "workspace.opened",
      timestamp: "1970-01-01T00:00:00.000Z",
      context: { workspaceId: "w1" },
    });
  });

  it("redacts the context it is handed, without the caller opting in", () => {
    const event = buildLogEvent("error", "cv.parse.failed", {
      cvText: "Ali Safari, Genk",
      durationMs: 42,
    });
    expect(JSON.stringify(event)).not.toContain("Safari");
    expect(event.context).toEqual({ durationMs: 42 });
  });
});
