import { describe, expect, it, vi } from "vitest";
import { retrieveContext } from "./retrieval";
import type { RequestContext } from "../context";

/**
 * Unit-level coverage for the pure/mockable parts of retrieveContext:
 * redaction and the size caps. The authorization-scoping SQL itself (guest
 * project-membership, workspace scoping) is exercised against a real
 * database in retrieval.integration.test.ts, mirroring lib/search's
 * isolation test — a mocked $queryRaw can't catch a wrong WHERE clause.
 */
function fakeCtx(overrides: Partial<RequestContext["actor"]> = {}, taskRows: unknown[] = []) {
  const queryRaw = vi.fn().mockResolvedValueOnce(taskRows).mockResolvedValueOnce([]);
  const db = {
    $queryRaw: queryRaw,
    project: { findFirst: vi.fn().mockResolvedValue(null) },
    projectMembership: { findFirst: vi.fn().mockResolvedValue(null) },
  };
  const ctx = {
    db: db as unknown as RequestContext["db"],
    workspaceId: "ws1",
    workspaceSlug: "ws1",
    actor: { membershipId: "m1", platformUserId: "u1", role: "member", ...overrides },
    correlationId: "cid",
  } as RequestContext;
  return { ctx, queryRaw };
}

describe("retrieveContext", () => {
  it("returns [] for an empty/whitespace redacted input without querying", async () => {
    const { ctx, queryRaw } = fakeCtx();
    const out = await retrieveContext(ctx, { kind: "decompose", redactedInput: "   " });
    expect(out).toEqual([]);
    expect(queryRaw).not.toHaveBeenCalled();
  });

  it("redacts every returned snippet body before returning it", async () => {
    const { ctx } = fakeCtx(
      {},
      [
        {
          id: "t1",
          title: "Reach me",
          description: "Email me at leak@example.com about this",
          projectId: "p1",
        },
      ],
    );
    const out = await retrieveContext(ctx, { kind: "decompose", redactedInput: "reach me" });
    expect(out).toHaveLength(1);
    expect(out[0].id).toBe("task:t1");
    expect(out[0].body).not.toContain("leak@example.com");
    expect(out[0].body).toContain("[EMAIL]");
  });

  it("caps the number of snippets and the total character budget", async () => {
    const bigRows = Array.from({ length: 20 }, (_, i) => ({
      id: `t${i}`,
      title: `Task ${i}`,
      description: "x".repeat(500),
      projectId: "p1",
    }));
    const { ctx } = fakeCtx({}, bigRows);
    const out = await retrieveContext(ctx, { kind: "decompose", redactedInput: "x" });
    expect(out.length).toBeLessThanOrEqual(10);
    const totalChars = out.reduce((n, s) => n + s.body.length, 0);
    expect(totalChars).toBeLessThanOrEqual(4000);
  });
});
