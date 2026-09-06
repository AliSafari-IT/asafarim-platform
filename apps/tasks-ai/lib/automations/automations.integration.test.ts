import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { execSync } from "node:child_process";
import { createHmac } from "node:crypto";
import { PrismaPg } from "@prisma/adapter-pg";
import { hasTestDatabase, requireTestDatabaseUrl } from "../db/test-database";
import { PrismaClient } from "../db/generated";
import type { RequestContext } from "../context";

vi.mock("../session", () => ({ getViewer: async () => ({ id: "noop" }) }));

describe.skipIf(!hasTestDatabase())("automations + integrations (integration)", () => {
  let db: PrismaClient;

  beforeAll(async () => {
    const url = requireTestDatabaseUrl();
    execSync("pnpm exec prisma migrate deploy --schema prisma/schema.prisma", {
      cwd: process.cwd(),
      env: { ...process.env, TASKSAI_DATABASE_URL: url },
      stdio: "inherit",
    });
    process.env.TASKSAI_DATABASE_URL = url;
    db = new PrismaClient({ adapter: new PrismaPg({ connectionString: url }) });
  });
  afterAll(async () => {
    await db?.$disconnect();
  });

  async function ws(tag: string) {
    const w = await db.workspace.create({ data: { name: tag, slug: `${tag}-${Date.now()}-${Math.random().toString(36).slice(2, 6)}` } });
    const owner = await db.membership.create({ data: { workspaceId: w.id, platformUserId: `o-${tag}`, role: "owner" } });
    const ctx: RequestContext = {
      db, workspaceId: w.id, workspaceSlug: w.slug,
      actor: { membershipId: owner.id, platformUserId: `o-${tag}`, role: "owner" },
      correlationId: `cid-${tag}`,
    };
    return { w, owner, ctx };
  }

  it("rule: dry-run predicts, activation executes on a matching event, loop guard caps depth", async () => {
    const { createRule, setRuleState, dryRunRule, runRulesForEvent } = await import("./service");
    const { createProject } = await import("../services/projects");
    const a = await ws("rule");
    const proj = await createProject(a.ctx, { name: "P", key: "RUL" });
    const t = await db.task.create({ data: { workspaceId: a.w.id, projectId: proj.id, title: "Ship the newsletter" } });

    const rule = await createRule(a.ctx, {
      name: "comment on done",
      trigger: { event: "task.status_changed", filters: [] },
      conditions: [{ field: "title", op: "contains", value: "newsletter" }],
      actions: [{ type: "comment", body: "auto note" }],
    });

    const dry = await dryRunRule(a.ctx, rule.id, {
      name: "task.status_changed",
      data: { id: t.id, title: "Ship the newsletter" },
    });
    expect(dry).toMatchObject({ triggered: true, conditionsMet: true, wouldRun: true });

    await setRuleState(a.ctx, rule.id, "active");
    const res = await runRulesForEvent(db, {
      name: "task.status_changed",
      workspaceId: a.w.id,
      data: { id: t.id, title: "Ship the newsletter", statusId: "done" },
    });
    expect(res.results?.find((r) => r.ruleId === rule.id)?.state).toBe("succeeded");
    const comments = await db.comment.count({ where: { taskId: t.id } });
    expect(comments).toBe(1);

    // loop guard: an event carrying a causation chain at the depth limit is skipped
    const r1 = await db.automationRun.create({ data: { workspaceId: a.w.id, ruleId: rule.id, state: "succeeded", trigger: {} } });
    const r2 = await db.automationRun.create({ data: { workspaceId: a.w.id, ruleId: rule.id, state: "succeeded", trigger: {}, causationId: r1.id } });
    const r3 = await db.automationRun.create({ data: { workspaceId: a.w.id, ruleId: rule.id, state: "succeeded", trigger: {}, causationId: r2.id } });
    const guarded = await runRulesForEvent(db, {
      name: "task.status_changed", workspaceId: a.w.id, causationId: r3.id,
      data: { id: t.id, title: "Ship the newsletter" },
    });
    expect(guarded.skipped).toBe("loop-guard");
  });

  it("rate limit: a rule past maxRunsPerHour records rate_limited, not another execution", async () => {
    const { createRule, setRuleState, runRulesForEvent } = await import("./service");
    const { createProject } = await import("../services/projects");
    const a = await ws("rl");
    const proj = await createProject(a.ctx, { name: "P", key: "RLM" });
    const t = await db.task.create({ data: { workspaceId: a.w.id, projectId: proj.id, title: "x" } });
    const rule = await createRule(a.ctx, {
      name: "r", trigger: { event: "task.updated", filters: [] }, conditions: [],
      actions: [{ type: "set_due_in_days", days: 1 }], maxRunsPerHour: 1,
    });
    await setRuleState(a.ctx, rule.id, "active");
    const ev = { name: "task.updated", workspaceId: a.w.id, data: { id: t.id } };
    const first = await runRulesForEvent(db, ev);
    const second = await runRulesForEvent(db, ev);
    expect(first.results?.[0].state).toBe("succeeded");
    expect(second.results?.[0].state).toBe("rate_limited");
  });

  it("api token: resolves while valid, resolves to null immediately after revoke", async () => {
    const { createToken, revokeToken, resolveToken } = await import("../tokens/service");
    const a = await ws("tok");
    const created = await createToken(a.ctx, { name: "ci", scopes: ["tasks:read"] });
    expect(await resolveToken(created.token)).toMatchObject({ workspaceId: a.w.id, scopes: ["tasks:read"] });
    await revokeToken(a.ctx, created.id);
    expect(await resolveToken(created.token)).toBeNull();
  });

  it("github webhook: valid signature creates a task; replayed delivery is a no-op; bad signature is forbidden", async () => {
    const { connectGithub, receiveGithubWebhook } = await import("../integrations/github");
    const { createProject } = await import("../services/projects");
    const a = await ws("gh");
    const proj = await createProject(a.ctx, { name: "P", key: "GHB" });
    await connectGithub(a.ctx, { repo: "acme/site", secret: "hooksecret123", projectId: proj.id });

    const body = JSON.stringify({ action: "opened", issue: { number: 7, title: "Broken link", body: "on /about", html_url: "https://x", state: "open" } });
    const sig = "sha256=" + createHmac("sha256", "hooksecret123").update(body).digest("hex");

    const r1 = await receiveGithubWebhook({ repo: "acme/site", deliveryId: "d1", eventType: "issues", rawBody: body, signatureHeader: sig });
    expect(r1.taskId).toBeTruthy();
    const r2 = await receiveGithubWebhook({ repo: "acme/site", deliveryId: "d2", eventType: "issues", rawBody: body, signatureHeader: sig });
    expect(r2.taskId).toBe(r1.taskId); // deduped by github:acme/site#7, no second task

    const tasks = await db.task.count({ where: { workspaceId: a.w.id, source: "import" } });
    expect(tasks).toBe(1);

    await expect(
      receiveGithubWebhook({ repo: "acme/site", deliveryId: "d3", eventType: "issues", rawBody: body, signatureHeader: "sha256=deadbeef" }),
    ).rejects.toMatchObject({ code: "forbidden" });
  });
});
