import { describe, expect, it } from "vitest";
import {
  DEFAULT_APPLICATION_LIST_QUERY,
  DEFAULT_PAGE_SIZE,
  MAX_PAGE_SIZE,
  applicationListHref,
  hasApplicationFilters,
  parseApplicationListQuery,
  serializeApplicationListQuery,
  withListChange,
} from "./listQuery";

const params = (search: string) => new URLSearchParams(search);

describe("parseApplicationListQuery", () => {
  it("returns the defaults for an empty query, with a bounded page size", () => {
    for (const mode of ["strict", "lenient"] as const) {
      const parsed = parseApplicationListQuery(params(""), mode);
      expect(parsed).toEqual({ ok: true, query: DEFAULT_APPLICATION_LIST_QUERY, invalid: [] });
    }
    expect(DEFAULT_APPLICATION_LIST_QUERY.pageSize).toBe(DEFAULT_PAGE_SIZE);
  });

  it("reads every control", () => {
    const parsed = parseApplicationListQuery(
      params("q=  Acme   Corp &status=APPLIED&via=indeed&due=overdue&today=2026-11-19&sort=followUp&page=3&pageSize=50"),
      "strict",
    );
    expect(parsed).toEqual({
      ok: true,
      invalid: [],
      query: {
        q: "Acme Corp",
        status: "APPLIED",
        via: "indeed",
        due: "overdue",
        today: "2026-11-19",
        sort: "followUp",
        page: 3,
        pageSize: 50,
      },
    });
  });

  it("also reads Next's searchParams record shape", () => {
    const parsed = parseApplicationListQuery({ q: "dev", page: "2", unknown: "x" }, "strict");
    expect(parsed.ok && parsed.query).toMatchObject({ q: "dev", page: 2 });
  });

  it.each([
    ["status=HIRED", "status"],
    ["status=applied", "status"],
    ["due=soon&today=2026-11-19", "due"],
    ["due=today", "today"],
    ["due=today&today=2026-02-30", "today"],
    ["due=today&today=19-11-2026", "today"],
    ["sort=oldest", "sort"],
    ["page=0", "page"],
    ["page=-1", "page"],
    ["page=1.5", "page"],
    ["page=abc", "page"],
    ["page=10001", "page"],
    ["pageSize=0", "pageSize"],
    [`pageSize=${MAX_PAGE_SIZE + 1}`, "pageSize"],
    ["pageSize=1e3", "pageSize"],
    ["page=1&page=2", "page"],
    ["status=SAVED&status=APPLIED", "status"],
    [`q=${"x".repeat(101)}`, "q"],
  ])("strict mode rejects %s naming %s", (search, name) => {
    const parsed = parseApplicationListQuery(params(search), "strict");
    expect(parsed.ok).toBe(false);
    expect(parsed.invalid).toContain(name);
  });

  it("lenient mode falls back to the default for each malformed value and keeps the rest", () => {
    const parsed = parseApplicationListQuery(params("q=acme&status=HIRED&page=abc&pageSize=999&sort=oldest"), "lenient");
    expect(parsed.ok).toBe(true);
    if (!parsed.ok) return;
    expect(parsed.query).toEqual({ ...DEFAULT_APPLICATION_LIST_QUERY, q: "acme" });
    expect(parsed.invalid.sort()).toEqual(["page", "pageSize", "sort", "status"]);
  });

  it("lenient mode keeps a due filter without today so the browser can supply it", () => {
    const parsed = parseApplicationListQuery(params("due=today"), "lenient");
    expect(parsed.ok && parsed.query).toMatchObject({ due: "today", today: null });
  });

  it("lenient mode cuts an over-long search to the limit", () => {
    const parsed = parseApplicationListQuery(params(`q=${"a".repeat(150)}`), "lenient");
    expect(parsed.ok && parsed.query.q).toHaveLength(100);
  });

  it("treats empty values as unset", () => {
    const parsed = parseApplicationListQuery(params("q=&status=&due=&sort=&page="), "strict");
    expect(parsed).toEqual({ ok: true, query: DEFAULT_APPLICATION_LIST_QUERY, invalid: [] });
  });
});

describe("serializeApplicationListQuery", () => {
  it("leaves defaults out", () => {
    expect(serializeApplicationListQuery(DEFAULT_APPLICATION_LIST_QUERY).toString()).toBe("");
    expect(applicationListHref(DEFAULT_APPLICATION_LIST_QUERY)).toBe("/applications");
  });

  it("round-trips through the parser", () => {
    const query = {
      q: "Acme & Söhne",
      status: "INTERVIEWING" as const,
      via: "external" as const,
      due: "upcoming" as const,
      today: "2026-12-31",
      sort: "applied" as const,
      page: 4,
      pageSize: 10,
    };
    const parsed = parseApplicationListQuery(serializeApplicationListQuery(query), "strict");
    expect(parsed.ok && parsed.query).toEqual(query);
  });

  it("drops today unless a due filter uses it", () => {
    expect(applicationListHref({ ...DEFAULT_APPLICATION_LIST_QUERY, today: "2026-11-19" })).toBe("/applications");
  });
});

describe("withListChange", () => {
  it("goes back to page 1 on any filter or sort change", () => {
    const on3 = { ...DEFAULT_APPLICATION_LIST_QUERY, page: 3 };
    expect(withListChange(on3, { status: "OFFER" }).page).toBe(1);
    expect(withListChange(on3, { sort: "followUp" }).page).toBe(1);
    expect(withListChange(on3, { q: "x" }).page).toBe(1);
  });
});

describe("hasApplicationFilters", () => {
  it("counts search, status and due but not sort or paging", () => {
    expect(hasApplicationFilters(DEFAULT_APPLICATION_LIST_QUERY)).toBe(false);
    expect(hasApplicationFilters({ ...DEFAULT_APPLICATION_LIST_QUERY, sort: "followUp", page: 2 })).toBe(false);
    expect(hasApplicationFilters({ ...DEFAULT_APPLICATION_LIST_QUERY, q: "a" })).toBe(true);
    expect(hasApplicationFilters({ ...DEFAULT_APPLICATION_LIST_QUERY, status: "SAVED" })).toBe(true);
    expect(hasApplicationFilters({ ...DEFAULT_APPLICATION_LIST_QUERY, due: "today", today: "2026-11-19" })).toBe(true);
  });
});
