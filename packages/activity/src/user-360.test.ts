import { describe, expect, it } from "vitest";
import { collectEntryTypes, filterEntries, formatBytes, formatDuration } from "./user-360";
import type { ActivityEntry, ActivitySection } from "./types";

function entry(overrides: Partial<ActivityEntry>): ActivityEntry {
  return {
    id: "e1",
    app: "vionto",
    type: "project",
    title: "Untitled",
    status: "draft",
    createdAt: new Date("2026-01-01T00:00:00Z"),
    updatedAt: new Date("2026-01-01T00:00:00Z"),
    href: null,
    metadata: {},
    ...overrides,
  };
}

function section(overrides: Partial<ActivitySection>): ActivitySection {
  return { app: "vionto", supported: true, available: true, entries: [], ...overrides };
}

describe("filterEntries", () => {
  const sections: ActivitySection[] = [
    section({
      app: "vionto",
      entries: [
        entry({ id: "v1", app: "vionto", type: "project", createdAt: new Date("2026-01-01T00:00:00Z") }),
        entry({ id: "v2", app: "vionto", type: "export", createdAt: new Date("2026-02-01T00:00:00Z") }),
      ],
    }),
    section({
      app: "timelineai",
      entries: [
        entry({ id: "t1", app: "timelineai", type: "timeline", createdAt: new Date("2026-01-15T00:00:00Z") }),
      ],
    }),
  ];

  it("merges every section's entries when no filter is given", () => {
    const result = filterEntries(sections, {});
    expect(result.map((e) => e.id).sort()).toEqual(["t1", "v1", "v2"]);
  });

  it("sorts newest first", () => {
    const result = filterEntries(sections, {});
    expect(result.map((e) => e.id)).toEqual(["v2", "t1", "v1"]);
  });

  it("filters by app", () => {
    const result = filterEntries(sections, { app: "timelineai" });
    expect(result.map((e) => e.id)).toEqual(["t1"]);
  });

  it("filters by type", () => {
    const result = filterEntries(sections, { type: "export" });
    expect(result.map((e) => e.id)).toEqual(["v2"]);
  });

  it("filters by an inclusive date range", () => {
    const result = filterEntries(sections, { from: "2026-01-10", to: "2026-01-31" });
    expect(result.map((e) => e.id)).toEqual(["t1"]);
  });

  it("combines filters with AND semantics", () => {
    const result = filterEntries(sections, { app: "vionto", type: "project" });
    expect(result.map((e) => e.id)).toEqual(["v1"]);
  });
});

describe("collectEntryTypes", () => {
  it("returns distinct, sorted types across sections", () => {
    const sections: ActivitySection[] = [
      section({ entries: [entry({ type: "export" }), entry({ type: "project" })] }),
      section({ app: "timelineai", entries: [entry({ type: "project" }), entry({ type: "timeline" })] }),
    ];
    expect(collectEntryTypes(sections)).toEqual(["export", "project", "timeline"]);
  });

  it("returns an empty array when there are no entries", () => {
    expect(collectEntryTypes([section({})])).toEqual([]);
  });
});

describe("formatBytes", () => {
  it("returns null for null/undefined", () => {
    expect(formatBytes(null)).toBeNull();
    expect(formatBytes(undefined)).toBeNull();
  });

  it("formats bytes below 1024 as-is", () => {
    expect(formatBytes(512)).toBe("512 B");
  });

  it("formats into KB/MB/GB", () => {
    expect(formatBytes(2048)).toBe("2.0 KB");
    expect(formatBytes(5 * 1024 * 1024)).toBe("5.0 MB");
  });
});

describe("formatDuration", () => {
  it("returns null for null/undefined", () => {
    expect(formatDuration(null)).toBeNull();
    expect(formatDuration(undefined)).toBeNull();
  });

  it("formats seconds only under a minute", () => {
    expect(formatDuration(45)).toBe("45s");
  });

  it("formats minutes and seconds", () => {
    expect(formatDuration(125)).toBe("2m 5s");
  });
});
