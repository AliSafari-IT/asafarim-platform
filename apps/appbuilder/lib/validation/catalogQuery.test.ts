import { describe, expect, it } from "vitest";
import { catalogHref, normalizeCatalogQuery } from "./catalogQuery";

describe("normalizeCatalogQuery", () => {
  it("applies safe defaults for an empty query", () => {
    const query = normalizeCatalogQuery({});
    expect(query).toEqual({
      search: undefined,
      status: "active",
      access: "all",
      sort: "updated",
      page: 1,
      pageSize: 12,
    });
  });

  it("normalizes whitespace in search text", () => {
    const query = normalizeCatalogQuery({ q: "  hello   world  " });
    expect(query.search).toBe("hello world");
  });

  it("falls back to defaults for unknown status/access/sort values", () => {
    const query = normalizeCatalogQuery({ status: "deleted", access: "everyone", sort: "popularity" });
    expect(query.status).toBe("active");
    expect(query.access).toBe("all");
    expect(query.sort).toBe("updated");
  });

  it("accepts valid status/access/sort values", () => {
    const query = normalizeCatalogQuery({ status: "archived", access: "owned", sort: "name" });
    expect(query.status).toBe("archived");
    expect(query.access).toBe("owned");
    expect(query.sort).toBe("name");
  });

  it("falls back to page 1 for malformed page values", () => {
    expect(normalizeCatalogQuery({ page: "not-a-number" }).page).toBe(1);
    expect(normalizeCatalogQuery({ page: "-5" }).page).toBe(1);
    expect(normalizeCatalogQuery({ page: "0" }).page).toBe(1);
  });

  it("accepts a valid page number", () => {
    expect(normalizeCatalogQuery({ page: "3" }).page).toBe(3);
  });

  it("caps an absurdly large page number", () => {
    expect(normalizeCatalogQuery({ page: "99999999999" }).page).toBeLessThanOrEqual(100_000);
  });

  it("takes only the first value when given an array (repeated query param)", () => {
    const query = normalizeCatalogQuery({ q: ["first", "second"], status: ["archived", "active"] });
    expect(query.search).toBe("first");
    expect(query.status).toBe("archived");
  });

  it("truncates an excessively long search string", () => {
    const query = normalizeCatalogQuery({ q: "x".repeat(1000) });
    expect(query.search?.length).toBeLessThanOrEqual(200);
  });
});

describe("catalogHref", () => {
  it("omits default values from the query string", () => {
    expect(catalogHref({ status: "active", access: "all", sort: "updated", page: 1 })).toBe("/apps");
  });

  it("includes only non-default params", () => {
    const href = catalogHref({ search: "crm", status: "archived", access: "owned", sort: "name", page: 1 });
    const params = new URLSearchParams(href.split("?")[1]);
    expect(params.get("q")).toBe("crm");
    expect(params.get("status")).toBe("archived");
    expect(params.get("access")).toBe("owned");
    expect(params.get("sort")).toBe("name");
    expect(params.has("page")).toBe(false);
  });

  it("includes an explicit page override beyond page 1", () => {
    const href = catalogHref({ status: "active" }, 3);
    expect(href).toContain("page=3");
  });
});
