import { beforeEach, describe, expect, it, vi } from "vitest";
import type { RequestContext } from "../../../../../../../../lib/context";

/**
 * The plan endpoint is a POST mutation, so it has to honour Idempotency-Key
 * like every other one (PR #375 review): a client that retries after losing
 * the response must get the original result replayed, not a second execution
 * that either loses to its own first attempt with `conflict_version` or
 * quietly applies the edit — and its activity event — twice.
 *
 * The context and the service are stubbed; what is under test is the route's
 * wiring, not the planning rules (those are covered against a real database
 * in lib/work/my-work.integration.test.ts).
 */
const planTask = vi.fn();
const resolveContext = vi.fn();

vi.mock("../../../../../../../../lib/work/service", () => ({
  planTask: (...args: unknown[]) => planTask(...args),
}));
vi.mock("../../../../../../../../lib/context", () => ({
  resolveContext: (...args: unknown[]) => resolveContext(...args),
}));

/** The two idempotency-store operations withIdempotency actually uses. */
function fakeContext(): RequestContext {
  const rows = new Map<string, { requestHash: string; responseCode: number; responseBody: unknown }>();
  const key = (where: { workspaceId_actorId_key: { workspaceId: string; actorId: string; key: string } }) => {
    const k = where.workspaceId_actorId_key;
    return `${k.workspaceId}:${k.actorId}:${k.key}`;
  };
  return {
    db: {
      idempotencyKey: {
        findUnique: async ({ where }: { where: Parameters<typeof key>[0] }) =>
          rows.get(key(where)) ?? null,
        create: async ({ data }: { data: Record<string, unknown> }) => {
          rows.set(`${data.workspaceId}:${data.actorId}:${data.key}`, {
            requestHash: data.requestHash as string,
            responseCode: data.responseCode as number,
            responseBody: data.responseBody,
          });
          return data;
        },
      },
    },
    workspaceId: "ws-1",
    workspaceSlug: "acme",
    actor: { membershipId: "m-1", platformUserId: "u-1", role: "owner" },
    correlationId: "cid-1",
  } as unknown as RequestContext;
}

const request = (body: unknown, headers: Record<string, string>) =>
  new Request("https://tasks.test/api/v1/workspaces/acme/tasks/t-1/plan", {
    method: "POST",
    headers: { "content-type": "application/json", ...headers },
    body: JSON.stringify(body),
  });

const params = { params: Promise.resolve({ slug: "acme", id: "t-1" }) };

describe("POST /workspaces/{slug}/tasks/{id}/plan idempotency (#375 review)", () => {
  beforeEach(() => {
    vi.resetModules();
    planTask.mockReset();
    resolveContext.mockReset();
  });

  it("replays the first response for a repeated key instead of planning again", async () => {
    const ctx = fakeContext();
    resolveContext.mockResolvedValue(ctx);
    planTask.mockResolvedValue({ id: "t-1", version: 5, dueDate: "2026-09-20T00:00:00.000Z" });

    const { POST } = await import("./route");
    const body = { dueDate: "2026-09-20T00:00:00.000Z" };
    const headers = { "idempotency-key": "key-1", "if-match": "4" };

    const first = await POST(request(body, headers), params);
    expect(first.status).toBe(200);
    expect(await first.json()).toMatchObject({ data: { id: "t-1", version: 5 } });

    // The retry must not reach the service: the row is already at version 5,
    // so re-running the versioned edit would fail with conflict_version.
    const retry = await POST(request(body, headers), params);
    expect(retry.status).toBe(200);
    expect(await retry.json()).toMatchObject({ data: { id: "t-1", version: 5 } });
    expect(planTask).toHaveBeenCalledTimes(1);
  });

  it("passes the If-Match version through and runs once per distinct key", async () => {
    const ctx = fakeContext();
    resolveContext.mockResolvedValue(ctx);
    planTask.mockResolvedValue({ id: "t-1", version: 5 });

    const { POST } = await import("./route");
    const body = { assigneeId: null };

    await POST(request(body, { "idempotency-key": "key-a", "if-match": "4" }), params);
    await POST(request(body, { "idempotency-key": "key-b", "if-match": "4" }), params);

    expect(planTask).toHaveBeenCalledTimes(2);
    expect(planTask).toHaveBeenLastCalledWith(ctx, "t-1", body, 4);
  });

  it("still executes when the client sends no key at all", async () => {
    resolveContext.mockResolvedValue(fakeContext());
    planTask.mockResolvedValue({ id: "t-1", version: 5 });

    const { POST } = await import("./route");
    const res = await POST(request({ assigneeId: null }, {}), params);

    expect(res.status).toBe(200);
    expect(planTask).toHaveBeenCalledTimes(1);
  });
});
