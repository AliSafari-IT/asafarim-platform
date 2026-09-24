import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { execSync } from "node:child_process";
import { PrismaPg } from "@prisma/adapter-pg";
import { resolveRange } from "@asafarim/ai-cost-ledger";
import { hasTestDatabase, requireTestDatabaseUrl } from "../../db/test-database";
import { PrismaClient } from "../../db/generated";
import type { RequestContext } from "../../context";
import { resetEnvCache } from "../../env";

vi.mock("../../session", () => ({ getViewer: async () => ({ id: "noop" }) }));

/**
 * AI cost attribution (issue #590) end to end with the fixture provider,
 * against TASKSAI_TEST_DATABASE_URL.
 */
describe.skipIf(!hasTestDatabase())("AI cost attribution (integration)", () => {
  let db: PrismaClient;
  const range = () => resolveRange({ preset: "30d" });

  beforeAll(async () => {
    const url = requireTestDatabaseUrl();
    execSync("pnpm exec prisma migrate deploy --schema prisma/schema.prisma", {
      cwd: process.cwd(),
      env: { ...process.env, TASKSAI_DATABASE_URL: url },
      stdio: "inherit",
    });
    process.env.TASKSAI_DATABASE_URL = url;
    delete process.env.OPENAI_API_KEY;
    delete process.env.ANTHROPIC_API_KEY;
    resetEnvCache();
    delete (globalThis as { tasksAiPrisma?: unknown }).tasksAiPrisma;
    db = new PrismaClient({ adapter: new PrismaPg({ connectionString: url }) });
  });
  afterAll(async () => {
    await db?.$disconnect();
  });

  async function ws(tag: string) {
    const w = await db.workspace.create({
      data: { name: tag, slug: `${tag}-${Date.now()}-${Math.random().toString(36).slice(2, 6)}` },
    });
    const owner = await db.membership.create({ data: { workspaceId: w.id, platformUserId: `owner-${tag}-${w.id}`, role: "owner" } });
    const ctx: RequestContext = {
      db,
      workspaceId: w.id,
      workspaceSlug: w.slug,
      actor: { membershipId: owner.id, platformUserId: owner.platformUserId, role: "owner" },
      correlationId: `cid-${tag}`,
    };
    async function as(role: "admin" | "member" | "guest") {
      const m = await db.membership.create({ data: { workspaceId: w.id, platformUserId: `${role}-${tag}-${Math.random()}`, role } });
      return { ...ctx, actor: { membershipId: m.id, platformUserId: m.platformUserId, role } } as RequestContext;
    }
    return { w, owner, ctx, as };
  }

  it("a direct task action is attributed to that task (and its project), once", async () => {
    const { runAiJob } = await import("../job");
    const { createProject } = await import("../../services/projects");
    const { createTask } = await import("../../services/tasks");
    const a = await ws("costdirect");
    const proj = await createProject(a.ctx, { name: "P", key: "CDR" });
    const task = await createTask(a.ctx, { projectId: proj.id, title: "Migrate the database" });

    const { job } = await runAiJob(a.ctx, { kind: "decompose", input: "audit\nadd topic\ndual write", taskId: task.id });
    const events = await db.aiCostEvent.findMany({ where: { aiJobId: job.id } });
    expect(events).toHaveLength(1);
    expect(events[0]).toMatchObject({
      attribution: "task",
      taskId: task.id,
      projectId: proj.id,
      subjectType: "task",
      parentSubjectId: proj.id,
      fixture: true,
      estimatedCostMicros: BigInt(0),
      credentialSource: "none",
      actorId: a.owner.id,
    });
    const stored = await db.aiJob.findUniqueOrThrow({ where: { id: job.id } });
    expect(stored).toMatchObject({ projectId: proj.id, targetTaskId: task.id });

    const { taskCostView } = await import("./read");
    const view = await taskCostView(a.ctx, task.id, range());
    expect(view?.direct.eventCount).toBe(1);
  });

  it("a shared plan that creates many tasks is counted once on the project and only linked from the tasks", async () => {
    const { runAiJob } = await import("../job");
    const { applyProposal } = await import("../proposals");
    const { createProject } = await import("../../services/projects");
    const { buildCostTimeline, taskCostView } = await import("./read");
    const a = await ws("costshared");
    const proj = await createProject(a.ctx, { name: "Launch", key: "CSH" });

    const { job, proposal } = await runAiJob(a.ctx, {
      kind: "extract_plan",
      input: "- draft the brief\n- design the hero\n- build the form\n- write copy\n- ship it",
      projectId: proj.id,
    });
    await applyProposal(a.ctx, proposal.id, { projectId: proj.id });

    const event = await db.aiCostEvent.findFirstOrThrow({ where: { aiJobId: job.id } });
    expect(event).toMatchObject({ attribution: "project", projectId: proj.id, taskId: null, proposalId: proposal.id });

    const links = await db.aiJobTaskLink.findMany({ where: { aiJobId: job.id, role: "created" } });
    expect(links.length).toBeGreaterThanOrEqual(3);

    const timeline = await buildCostTimeline(a.ctx, { range: range() }, { limit: 50 });
    expect(timeline.summary.eventCount).toBe(1);
    const group = timeline.projects.find((p) => p.projectId === proj.id)!;
    expect(group.totals.eventCount).toBe(1);
    expect(group.sharedRuns.eventCount).toBe(1);
    expect(group.directTaskRuns.eventCount).toBe(0);

    // Every created task references the run but claims none of it.
    for (const link of links) {
      const view = await taskCostView(a.ctx, link.taskId, range());
      expect(view!.direct.eventCount).toBe(0);
      expect(view!.sharedRuns.map((r) => r.id)).toEqual([event.id]);
      expect(view!.sharedRuns[0].role).toContain("created");
    }
  });

  it("a cache hit makes no provider call and records nothing new", async () => {
    const { runAiJob } = await import("../job");
    const { createProject } = await import("../../services/projects");
    const a = await ws("costcache");
    const proj = await createProject(a.ctx, { name: "P", key: "CCH" });
    const input = { kind: "extract_plan", input: "- one\n- two\n- three", projectId: proj.id };
    await runAiJob(a.ctx, input);
    const second = await runAiJob(a.ctx, input);
    expect(second.cached).toBe(true);
    expect(await db.aiCostEvent.count({ where: { workspaceId: a.w.id } })).toBe(1);
  });

  it("a real provider with no key degrades to the fixture: one degraded $0 event, no phantom spend", async () => {
    const { runAiJob } = await import("../job");
    const { updateAiSettings } = await import("../settings");
    const a = await ws("costdegraded");
    await updateAiSettings(a.ctx, { provider: "openai", model: "gpt-4.1-mini" });
    const { job, degraded } = await runAiJob(a.ctx, { kind: "extract_plan", input: "- a\n- b\n- c" });
    expect(degraded).toBe(true);
    const events = await db.aiCostEvent.findMany({ where: { aiJobId: job.id } });
    expect(events).toHaveLength(1);
    expect(events[0]).toMatchObject({ outcome: "degraded", fixture: true, attribution: "workspace", provider: "fixture" });
  });

  it("a Stop before/while the fixture answers records nothing; a cancelled real call is unknown, not $0", async () => {
    const { runAiJob, AiJobCancelledError } = await import("../job");
    const { buildAiCostEvent } = await import("./ledger");
    const a = await ws("costcancel");
    const abort = new AbortController();
    abort.abort();
    await expect(runAiJob(a.ctx, { kind: "extract_plan", input: "- x\n- y" }, { signal: abort.signal })).rejects.toBeInstanceOf(AiJobCancelledError);
    expect(await db.aiCostEvent.count({ where: { workspaceId: a.w.id } })).toBe(0);

    // The documented rule for a real provider aborted mid-call.
    const { row } = buildAiCostEvent({
      workspaceId: a.w.id,
      actorId: a.owner.id,
      aiJobId: "job-x",
      operation: "extract_plan",
      scope: { attribution: "workspace" },
      provider: "anthropic",
      requestModel: "claude-sonnet-5",
      promptVersion: "v1",
      inputTokens: 0,
      outputTokens: 0,
      fixture: false,
      outcome: "cancelled",
      usageUnknown: true,
      suffix: "cancelled",
    });
    expect(row).toMatchObject({ outcome: "cancelled", costSource: "unknown", estimatedCostMicros: null });
  });

  it("a billed-but-rejected response is recorded once as failed, and ledger writes are retry-safe", async () => {
    const { recordStandaloneAiCost } = await import("./ledger");
    const a = await ws("costfailed");
    const job = await db.aiJob.create({
      data: { workspaceId: a.w.id, membershipId: a.owner.id, kind: "summarize", state: "failed", provider: "openai", model: "gpt-4.1-mini", promptVersion: "v1", cacheKey: "k" },
    });
    const input = {
      workspaceId: a.w.id,
      actorId: a.owner.id,
      aiJobId: job.id,
      operation: "summarize",
      scope: { attribution: "workspace" as const },
      provider: "openai",
      requestModel: "gpt-4.1-mini",
      promptVersion: "v1",
      inputTokens: 1_000_000,
      outputTokens: 0,
      fixture: false,
      outcome: "failed" as const,
      suffix: "attempt_openai_1",
    };
    await recordStandaloneAiCost(db, input);
    await recordStandaloneAiCost(db, input);
    const events = await db.aiCostEvent.findMany({ where: { aiJobId: job.id } });
    expect(events).toHaveLength(1);
    expect(events[0]).toMatchObject({ outcome: "failed", estimatedCostMicros: BigInt(400_000) });
    // …and the budget ledger saw it exactly once too.
    expect(await db.aiUsageLedger.count({ where: { aiJobId: job.id } })).toBe(1);
  });

  it("the ledger is append-only and money is attributed at exactly one level", async () => {
    const a = await ws("costappend");
    await expect(
      db.aiCostEvent.create({
        data: {
          idempotencyKey: `tasks-ai:x:${Date.now()}`,
          workspaceId: a.w.id,
          operation: "x",
          attribution: "project",
          subjectType: "project",
          subjectId: "p",
          projectId: null,
          provider: "fixture",
          responseModel: "fixture-1",
          costSource: "registry_estimate",
          credentialSource: "none",
          estimatedCostMicros: BigInt(0),
          fixture: true,
          occurredAt: new Date(),
        },
      }),
    ).rejects.toThrow();

    const { runAiJob } = await import("../job");
    await runAiJob(a.ctx, { kind: "summarize", input: "summarize this please" });
    await expect(db.aiCostEvent.updateMany({ where: { workspaceId: a.w.id }, data: { outcome: "failed" } })).rejects.toThrow(/append-only/);
  });

  it("a foreign or invisible project id is refused, not silently attributed", async () => {
    const { runAiJob } = await import("../job");
    const { createProject } = await import("../../services/projects");
    const a = await ws("costforeign-a");
    const b = await ws("costforeign-b");
    const theirs = await createProject(b.ctx, { name: "B", key: "CFB" });
    await expect(runAiJob(a.ctx, { kind: "extract_plan", input: "- a\n- b", projectId: theirs.id })).rejects.toMatchObject({ code: "not_found" });
    expect(await db.aiCostEvent.count({ where: { workspaceId: a.w.id } })).toBe(0);
  });

  it("owner/admin see the workspace; members see visible projects + their own runs; guests only their projects", async () => {
    const { runAiJob } = await import("../job");
    const { createProject } = await import("../../services/projects");
    const { buildCostTimeline } = await import("./read");
    const a = await ws("costscope");
    const open = await createProject(a.ctx, { name: "Open", key: "CSO" });
    const secret = await createProject(a.ctx, { name: "Secret", key: "CSS", visibility: "private" });
    const guestProj = await createProject(a.ctx, { name: "Guest", key: "CSG" });

    const admin = await a.as("admin");
    const member = await a.as("member");
    const guest = await a.as("guest");
    await db.projectMembership.create({ data: { projectId: guestProj.id, membershipId: guest.actor.membershipId, role: "guest" } });

    await runAiJob(a.ctx, { kind: "extract_plan", input: "- o1\n- o2", projectId: open.id });
    await runAiJob(a.ctx, { kind: "extract_plan", input: "- s1\n- s2", projectId: secret.id });
    await runAiJob(a.ctx, { kind: "extract_plan", input: "- g1\n- g2", projectId: guestProj.id });
    await runAiJob(a.ctx, { kind: "summarize", input: "owner's workspace-level summary" });
    await runAiJob(member, { kind: "summarize", input: "member's own workspace-level summary" });

    const ids = (t: Awaited<ReturnType<typeof buildCostTimeline>>) => t.projects.map((p) => p.projectId).sort();
    const all = await buildCostTimeline(admin, { range: range() }, { limit: 50 });
    expect(all.summary.eventCount).toBe(5);
    expect(all.scope).toBe("workspace");

    const asMember = await buildCostTimeline(member, { range: range() }, { limit: 50 });
    expect(ids(asMember)).toEqual([guestProj.id, open.id].sort());
    expect(asMember.workspaceOnly.eventCount).toBe(1); // only their own summary
    expect(asMember.scope).toBe("authorized_projects");
    expect(await buildCostTimeline(member, { range: range(), projectId: secret.id }, { limit: 50 })).toMatchObject({ summary: { eventCount: 0 } });

    const asGuest = await buildCostTimeline(guest, { range: range() }, { limit: 50 });
    expect(ids(asGuest)).toEqual([guestProj.id]);
    expect(asGuest.workspaceOnly.eventCount).toBe(0);

    const mine = await buildCostTimeline(member, { range: range(), mine: true }, { limit: 50 });
    expect(mine.summary.eventCount).toBe(1);
  });

  it("workspaces never see each other's cost; legacy float rows show as partial history", async () => {
    const { buildCostTimeline } = await import("./read");
    const { usageSummary } = await import("../quota");
    const a = await ws("costtenant-a");
    const b = await ws("costtenant-b");
    const legacyJob = await db.aiJob.create({
      data: { workspaceId: b.w.id, membershipId: b.owner.id, kind: "summarize", state: "succeeded", provider: "anthropic", model: "claude-haiku-4-5", promptVersion: "v0", cacheKey: "old" },
    });
    await db.aiUsageLedger.create({
      data: { workspaceId: b.w.id, aiJobId: legacyJob.id, provider: "anthropic", model: "claude-haiku-4-5", inputTokens: 100, outputTokens: 50, costUsd: 0.75 },
    });

    const tb = await buildCostTimeline(b.ctx, { range: range() }, { limit: 50 });
    expect(tb.legacy.eventCount).toBe(1);
    expect(tb.summary.effectiveKnownMicros).toBe("750000");
    expect(tb.summary.coverage).toBe("partial");
    expect((await usageSummary(b.ctx)).monthUsd).toBeCloseTo(0.75);

    const ta = await buildCostTimeline(a.ctx, { range: range() }, { limit: 50 });
    expect(ta.summary.eventCount).toBe(0);
  });
});
