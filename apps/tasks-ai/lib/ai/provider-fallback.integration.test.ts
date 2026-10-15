import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { execSync } from "node:child_process";
import { PrismaPg } from "@prisma/adapter-pg";
import { hasTestDatabase, requireTestDatabaseUrl } from "../db/test-database";
import { PrismaClient } from "../db/generated";
import type { RequestContext } from "../context";
import { resetEnvCache } from "../env";
import { ProviderError, type AiProvider, type ProviderCall } from "./provider";
import { FixtureProvider } from "./providers/fixture";

vi.mock("../session", () => ({ getViewer: async () => ({ id: "noop" }) }));

// Stand-ins for the real adapters, so no billable call is ever made: each
// test sets how "openai" (the workspace's primary) and "anthropic" (the
// fallback) behave and counts the calls each receives.
type Behaviour = "ok" | "retryable" | "fatal";
const behaviour: Record<string, Behaviour> = { openai: "retryable", anthropic: "ok" };
const calls: Record<string, number> = { openai: 0, anthropic: 0 };

function stub(name: "openai" | "anthropic", model: string): AiProvider {
  return {
    name,
    models: [model],
    async generate(call: ProviderCall) {
      calls[name] = (calls[name] ?? 0) + 1;
      if (behaviour[name] === "retryable") throw new ProviderError(`${name} rate limited`, true);
      if (behaviour[name] === "fatal") throw new ProviderError(`${name} rejected the request`, false);
      const out = await new FixtureProvider().generate(call);
      return { ...out, fixture: false };
    },
  };
}

vi.mock("./registry", async (importOriginal) => {
  const actual = await importOriginal<typeof import("./registry")>();
  return {
    ...actual,
    getProvider: async (name: string) => {
      if (name === "openai") return stub("openai", "gpt-4.1");
      if (name === "anthropic") return stub("anthropic", "claude-sonnet-5");
      return actual.getProvider(name);
    },
  };
});

describe.skipIf(!hasTestDatabase())("AI provider fallback before fixture (#537, integration)", () => {
  let db: PrismaClient;
  const savedKey = process.env.ANTHROPIC_API_KEY;

  beforeAll(async () => {
    const url = requireTestDatabaseUrl();
    execSync("pnpm exec prisma migrate deploy --schema prisma/schema.prisma", {
      cwd: process.cwd(),
      env: { ...process.env, TASKSAI_DATABASE_URL: url },
      stdio: "inherit",
    });
    process.env.TASKSAI_DATABASE_URL = url;
    resetEnvCache();
    delete (globalThis as { tasksAiPrisma?: unknown }).tasksAiPrisma;
    db = new PrismaClient({ adapter: new PrismaPg({ connectionString: url }) });
  });
  afterAll(async () => {
    await db?.$disconnect();
  });
  beforeEach(() => {
    calls.openai = 0;
    calls.anthropic = 0;
    behaviour.openai = "retryable";
    behaviour.anthropic = "ok";
    // The fallback is chosen by which keys the server has; the stubs above
    // never read it.
    process.env.ANTHROPIC_API_KEY = "test-key";
  });
  afterEach(() => {
    if (savedKey === undefined) delete process.env.ANTHROPIC_API_KEY;
    else process.env.ANTHROPIC_API_KEY = savedKey;
  });

  /** A workspace whose configured provider is openai. */
  async function openAiWorkspace(tag: string) {
    const w = await db.workspace.create({
      data: { name: tag, slug: `${tag}-${Date.now()}-${Math.random().toString(36).slice(2, 6)}` },
    });
    const owner = await db.membership.create({
      data: { workspaceId: w.id, platformUserId: `owner-${tag}`, role: "owner" },
    });
    await db.aiSettings.create({
      data: {
        workspaceId: w.id,
        enabled: true,
        monthlyBudgetUsd: null,
        monthlyJobQuota: null,
        maxBlastRadius: 50,
        provider: "openai",
        model: "gpt-4.1-mini",
      },
    });
    const ctx: RequestContext = {
      db,
      workspaceId: w.id,
      workspaceSlug: w.slug,
      actor: { membershipId: owner.id, platformUserId: `owner-${tag}`, role: "owner" },
      correlationId: `cid-${tag}`,
    };
    return { w, ctx };
  }

  const input = { kind: "extract_plan", input: "- draft the brief\n- design the hero\n- build the form" };

  it("a retryable-exhausted primary is served by the second real provider, not degraded", async () => {
    const { runAiJob } = await import("./job");
    const a = await openAiWorkspace("fbok");

    const res = await runAiJob(a.ctx, input);

    expect(calls).toEqual({ openai: 3, anthropic: 1 });
    expect(res.degraded).toBe(false);
    expect(res.job.state).toBe("succeeded");
    expect(res.job.provider).toBe("anthropic");
    expect(res.job.model).toBe("claude-sonnet-5");
    const ledger = await db.aiUsageLedger.findFirst({ where: { workspaceId: a.w.id } });
    expect(ledger?.provider).toBe("anthropic");
    expect(ledger?.model).toBe("claude-sonnet-5");
    expect(ledger?.fixture).toBe(false);
  });

  it("a non-retryable primary failure degrades straight to fixture without calling the fallback", async () => {
    const { runAiJob } = await import("./job");
    const a = await openAiWorkspace("fbfatal");
    behaviour.openai = "fatal";

    const res = await runAiJob(a.ctx, input);

    expect(calls).toEqual({ openai: 1, anthropic: 0 });
    expect(res.degraded).toBe(true);
    expect(res.job.state).toBe("degraded");
    expect(res.job.provider).toBe("fixture");
  });

  it("a failing fallback gets one attempt, then the job degrades to fixture", async () => {
    const { runAiJob } = await import("./job");
    const a = await openAiWorkspace("fbboth");
    behaviour.anthropic = "retryable";

    const res = await runAiJob(a.ctx, input);

    expect(calls).toEqual({ openai: 3, anthropic: 1 });
    expect(res.degraded).toBe(true);
    expect(res.job.provider).toBe("fixture");
    const ledger = await db.aiUsageLedger.findFirst({ where: { workspaceId: a.w.id } });
    expect(ledger?.fixture).toBe(true);
  });

  it("with no second provider configured, an exhausted primary degrades to fixture as before", async () => {
    const { runAiJob } = await import("./job");
    const a = await openAiWorkspace("fbnone");
    delete process.env.ANTHROPIC_API_KEY;

    const res = await runAiJob(a.ctx, input);

    expect(calls).toEqual({ openai: 3, anthropic: 0 });
    expect(res.degraded).toBe(true);
    expect(res.job.provider).toBe("fixture");
  });
});
