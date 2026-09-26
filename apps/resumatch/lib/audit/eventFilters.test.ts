import { describe, expect, it } from "vitest";
import { buildAuditEventWhere, parseAuditEventFilters } from "./eventFilters";

const parse = (query: string) => parseAuditEventFilters(new URLSearchParams(query));

describe("parseAuditEventFilters", () => {
  it("reads dates, lists and trims the search", () => {
    const filters = parse("from=2026-09-01T00:00:00.000Z&to=bad&platformUserIds=u1,%20u2,&q=%20offer%20");
    expect(filters.from?.toISOString()).toBe("2026-09-01T00:00:00.000Z");
    expect(filters.to).toBeNull();
    expect(filters.platformUserIds).toEqual(["u1", "u2"]);
    expect(filters.q).toBe("offer");
  });

  it("tells an absent user list from an empty one", () => {
    expect(parse("").platformUserIds).toBeNull();
    expect(parse("platformUserIds=").platformUserIds).toEqual([]);
  });
});

describe("buildAuditEventWhere", () => {
  it("is empty with no filters", () => {
    expect(buildAuditEventWhere(parse(""))).toEqual({});
  });

  it("matches nobody when the actor filter matched no user", () => {
    expect(buildAuditEventWhere(parse("platformUserIds="))).toEqual({
      AND: [{ workspace: { platformUserId: { in: [] } } }],
    });
  });

  it("combines action, users and a date range", () => {
    expect(
      buildAuditEventWhere(
        parse("action=application.status_changed&platformUserIds=u1&from=2026-09-01T00:00:00Z&to=2026-09-30T23:59:59Z"),
      ),
    ).toEqual({
      AND: [
        { workspace: { platformUserId: { in: ["u1"] } } },
        { action: "application.status_changed" },
        { createdAt: { gte: new Date("2026-09-01T00:00:00Z"), lte: new Date("2026-09-30T23:59:59Z") } },
      ],
    });
  });

  it("searches the action, the ids an event carries, and matching users", () => {
    const where = buildAuditEventWhere(parse("q=cmuii00ey&qPlatformUserIds=u9"));
    const or = (where.AND as { OR: unknown[] }[])[0]!.OR;
    expect(or).toContainEqual({ action: { contains: "cmuii00ey", mode: "insensitive" } });
    expect(or).toContainEqual({ metadata: { path: ["applicationId"], equals: "cmuii00ey" } });
    expect(or).toContainEqual({ workspace: { platformUserId: { in: ["u9"] } } });
  });
});
