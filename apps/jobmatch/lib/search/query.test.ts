import { describe, expect, it } from "vitest";
import { MAX_PAGE_SIZE, MAX_SKILLS_FILTER, parseSearchQuery } from "./query";

function params(entries: Record<string, string>): URLSearchParams {
  return new URLSearchParams(entries);
}

describe("search query parsing", () => {
  it("applies defaults to an empty query", () => {
    const result = parseSearchQuery(params({}));
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.query).toMatchObject({ sort: "newest", page: 1, pageSize: 20 });
  });

  it("parses a full query", () => {
    const result = parseSearchQuery(
      params({
        q: "engineer",
        location: "Hasselt",
        remote: "remote",
        contractType: "permanent",
        salaryMin: "50000",
        skills: "TypeScript, React , PostgreSQL",
        sort: "salary",
        page: "2",
        pageSize: "10",
      }),
    );
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.query.skills).toEqual(["TypeScript", "React", "PostgreSQL"]);
    expect(result.query.sort).toBe("salary");
    expect(result.query.page).toBe(2);
  });

  it("bounds the page size so a request cannot pull an unbounded slice", () => {
    const result = parseSearchQuery(params({ pageSize: String(MAX_PAGE_SIZE + 500) }));
    expect(result.ok).toBe(false);
  });

  it("bounds the number of skill filters", () => {
    const many = Array.from({ length: MAX_SKILLS_FILTER + 10 }, (_, i) => `skill${i}`).join(",");
    const result = parseSearchQuery(params({ skills: many }));
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.query.skills).toHaveLength(MAX_SKILLS_FILTER);
  });

  it("refuses an out-of-range remote value", () => {
    expect(parseSearchQuery(params({ remote: "underwater" })).ok).toBe(false);
  });

  it("refuses hybrid, since isRemote cannot honestly represent it", () => {
    expect(parseSearchQuery(params({ remote: "hybrid" })).ok).toBe(false);
  });

  it("refuses a negative salary", () => {
    expect(parseSearchQuery(params({ salaryMin: "-1" })).ok).toBe(false);
  });

  it("refuses page zero", () => {
    expect(parseSearchQuery(params({ page: "0" })).ok).toBe(false);
  });
});
