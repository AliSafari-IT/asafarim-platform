import { describe, expect, it } from "vitest";
import {
  buildVionteWhere,
  hasVionteFilters,
  isVionteEntryType,
  parseVionteFilters,
  vionteHref,
  vionteQueryString,
} from "./query";

describe("parseVionteFilters", () => {
  it("defaults to the render_job tab, page 1, no filters", () => {
    expect(parseVionteFilters({})).toEqual({
      type: "render_job",
      state: "",
      from: "",
      to: "",
      page: 1,
    });
  });

  it("falls back to render_job for an unrecognized type value", () => {
    expect(parseVionteFilters({ type: "not-a-real-type" }).type).toBe("render_job");
  });

  it("accepts every known entry type", () => {
    for (const type of ["project", "video_version", "render_job", "export", "album"]) {
      expect(parseVionteFilters({ type }).type).toBe(type);
    }
  });

  it("clamps page to a minimum of 1 for zero, negative, or non-numeric input", () => {
    expect(parseVionteFilters({ page: "0" }).page).toBe(1);
    expect(parseVionteFilters({ page: "-3" }).page).toBe(1);
    expect(parseVionteFilters({ page: "not-a-number" }).page).toBe(1);
  });

  it("trims whitespace from string filters", () => {
    expect(parseVionteFilters({ state: "  failed  " }).state).toBe("failed");
  });
});

describe("isVionteEntryType", () => {
  it("accepts the five known types and rejects anything else", () => {
    expect(isVionteEntryType("render_job")).toBe(true);
    expect(isVionteEntryType("export")).toBe(true);
    expect(isVionteEntryType("bogus")).toBe(false);
    expect(isVionteEntryType("")).toBe(false);
  });
});

describe("buildVionteWhere", () => {
  it("always scopes to the given userId", () => {
    const where = buildVionteWhere(
      { type: "render_job", state: "", from: "", to: "", page: 1 },
      "u1"
    );
    expect(where).toEqual({ userId: "u1" });
  });

  it("maps the state filter to each type's own status column", () => {
    expect(
      buildVionteWhere({ type: "render_job", state: "failed", from: "", to: "", page: 1 }, "u1")
    ).toMatchObject({ state: "failed" });
    expect(
      buildVionteWhere({ type: "project", state: "draft", from: "", to: "", page: 1 }, "u1")
    ).toMatchObject({ status: "draft" });
    expect(
      buildVionteWhere({ type: "album", state: "published", from: "", to: "", page: 1 }, "u1")
    ).toMatchObject({ lifecycleStage: "published" });
  });

  it("ignores a state filter for export — every row is already a completed export", () => {
    const where = buildVionteWhere(
      { type: "export", state: "whatever", from: "", to: "", page: 1 },
      "u1"
    );
    expect(where).not.toHaveProperty("status");
    expect(where).not.toHaveProperty("whatever");
  });

  it("builds an inclusive createdAt range from from/to", () => {
    const where = buildVionteWhere(
      { type: "render_job", state: "", from: "2026-01-01", to: "2026-01-31", page: 1 },
      "u1"
    ) as { createdAt: { gte: Date; lte: Date } };

    expect(where.createdAt.gte.toISOString()).toBe("2026-01-01T00:00:00.000Z");
    expect(where.createdAt.lte.toISOString()).toBe("2026-01-31T23:59:59.000Z");
  });
});

describe("vionteQueryString / vionteHref", () => {
  const base = { type: "render_job" as const, state: "", from: "", to: "", page: 1 };

  it("omits every default value — the default view has a clean URL", () => {
    expect(vionteQueryString(base)).toBe("");
    expect(vionteHref("u1", base)).toBe("/users/u1/vionto");
  });

  it("includes a non-default type, but not the default render_job", () => {
    expect(vionteQueryString(base, { type: "export" })).toBe("type=export");
    expect(vionteQueryString(base, { type: "render_job" })).toBe("");
  });

  it("includes state/from/to/page when set, and builds a full href", () => {
    const qs = vionteQueryString(base, { state: "failed", from: "2026-01-01", page: 3 });
    expect(qs).toBe("state=failed&from=2026-01-01&page=3");
    expect(vionteHref("u1", base, { state: "failed", page: 3 })).toBe(
      "/users/u1/vionto?state=failed&page=3"
    );
  });
});

describe("hasVionteFilters", () => {
  it("is false with only the default type set", () => {
    expect(hasVionteFilters({ type: "export", state: "", from: "", to: "", page: 1 })).toBe(false);
  });

  it("is true when state, from, or to is set", () => {
    expect(hasVionteFilters({ type: "render_job", state: "failed", from: "", to: "", page: 1 })).toBe(
      true
    );
    expect(hasVionteFilters({ type: "render_job", state: "", from: "2026-01-01", to: "", page: 1 })).toBe(
      true
    );
  });
});
