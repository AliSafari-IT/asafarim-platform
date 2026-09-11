import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { execSync } from "node:child_process";
import { randomUUID } from "node:crypto";
import { createServer, type Server } from "node:http";
import { PrismaPg } from "@prisma/adapter-pg";
import { ProvisionTestsRequest } from "@asafarim/testora-tasksai-contract";
import { hasTestDatabase, requireTestDatabaseUrl } from "../db/test-database";
import { PrismaClient } from "../db/generated";
import type { RequestContext } from "../context";
import { resetEnvCache } from "../env";

vi.mock("../session", () => ({ getViewer: async () => ({ id: "noop" }) }));

const PROVISION_TOKEN = "provtok_" + randomUUID();

describe.skipIf(!hasTestDatabase())("provision-tests action (integration)", () => {
  let db: PrismaClient;
  let server: Server;
  let received: { authorization: string | undefined; body: unknown }[] = [];
  let nextScenarios: Array<{ scenarioId: string; criterionRef: string; state: string }> = [];

  beforeAll(async () => {
    const url = requireTestDatabaseUrl();
    execSync("pnpm exec prisma migrate deploy --schema prisma/schema.prisma", {
      cwd: process.cwd(),
      env: { ...process.env, TASKSAI_DATABASE_URL: url },
      stdio: "inherit",
    });
    process.env.TASKSAI_DATABASE_URL = url;
    db = new PrismaClient({ adapter: new PrismaPg({ connectionString: url }) });

    server = createServer((req, res) => {
      let raw = "";
      req.on("data", (c) => (raw += c));
      req.on("end", () => {
        const body: unknown = JSON.parse(raw);
        received.push({ authorization: req.headers.authorization, body });
        const parsed = ProvisionTestsRequest.safeParse(body);
        if (!parsed.success) {
          res.writeHead(422);
          res.end(JSON.stringify({ error: parsed.error.message }));
          return;
        }
        res.writeHead(201, { "content-type": "application/json" });
        res.end(
          JSON.stringify({
            v: 1,
            provisionId: parsed.data.provisionId,
            scenarios:
              nextScenarios.length > 0
                ? nextScenarios
                : parsed.data.acceptanceCriteria.map((c) => ({
                    scenarioId: `scn_${c.ref}`,
                    criterionRef: c.ref,
                    state: "pending",
                  })),
          }),
        );
      });
    });
    await new Promise<void>((resolve) => server.listen(0, resolve));
    const port = (server.address() as { port: number }).port;

    process.env.TESTORA_APP_URL = `http://127.0.0.1:${port}`;
    process.env.TESTORA_PROVISION_TOKEN = PROVISION_TOKEN;
    resetEnvCache();
  });
  afterEach(() => {
    received = [];
    nextScenarios = [];
  });
  afterAll(async () => {
    await db?.$disconnect();
    await new Promise((resolve) => server.close(resolve));
    delete process.env.TESTORA_APP_URL;
    delete process.env.TESTORA_PROVISION_TOKEN;
    resetEnvCache();
  });

  async function ws(tag: string) {
    const w = await db.workspace.create({
      data: { name: tag, slug: `${tag}-${Date.now()}-${Math.random().toString(36).slice(2, 6)}` },
    });
    const owner = await db.membership.create({
      data: { workspaceId: w.id, platformUserId: `owner-${tag}`, role: "owner" },
    });
    const ctx: RequestContext = {
      db,
      workspaceId: w.id,
      workspaceSlug: w.slug,
      actor: { membershipId: owner.id, platformUserId: `owner-${tag}`, role: "owner" },
      correlationId: `cid-${tag}`,
    };
    return { w, owner, ctx };
  }

  it("without a testora integration, the action refuses — the workspace never sees a provisioned check", async () => {
    const { provisionTestsForTask } = await import("./provisioning");
    const { createProject } = await import("./projects");
    const { createTask } = await import("./tasks");
    const a = await ws("noint");
    const proj = await createProject(a.ctx, { name: "P", key: "NOIN" });
    const task = await createTask(a.ctx, {
      projectId: proj.id,
      title: "Password reset",
      description: "- [ ] a user can request a reset link",
    });

    await expect(provisionTestsForTask(a.ctx, task.id, {})).rejects.toMatchObject({ code: "not_found" });
    expect(received.length).toBe(0);
  });

  it("provisions from a checklist description: calls Testora with the shared token, creates a pending check, blocks completion", async () => {
    const { provisionTestsForTask } = await import("./provisioning");
    const { connectTestora } = await import("../integrations/testora");
    const { createProject } = await import("./projects");
    const { createTask, completeTask } = await import("./tasks");
    const a = await ws("prov1");
    const proj = await createProject(a.ctx, { name: "P", key: "PRO1" });
    await connectTestora(a.ctx, { appId: "asafarim-web", secret: "whsec_" + randomUUID(), projectId: proj.id });
    const task = await createTask(a.ctx, {
      projectId: proj.id,
      title: "Password reset",
      description: [
        "Ship the reset-password flow.",
        "- [ ] A user can request a reset link by email",
        "- [x] The link expires after 30 minutes",
      ].join("\n"),
    });

    const result = await provisionTestsForTask(a.ctx, task.id, {});
    expect(result.scenarios.length).toBe(2);
    expect(received.length).toBe(1);
    expect(received[0]!.authorization).toBe(`Bearer ${PROVISION_TOKEN}`);
    const sentBody = received[0]!.body as { taskRef: string; acceptanceCriteria: unknown[]; appId: string };
    expect(sentBody.taskRef).toBe(task.id);
    expect(sentBody.acceptanceCriteria).toHaveLength(2);
    expect(sentBody.appId).toBe("asafarim-web");

    const check = await db.taskCheck.findUnique({ where: { id: result.checkId } });
    expect(check?.state).toBe("pending");
    expect(check?.source).toBe("testora");
    expect(check?.taskId).toBe(task.id);

    await expect(completeTask(a.ctx, task.id)).rejects.toMatchObject({ code: "blocked_by_check" });
  });

  it("re-running the action re-syncs the same check (idempotent) and never downgrades an already-satisfied check", async () => {
    const { provisionTestsForTask } = await import("./provisioning");
    const { connectTestora } = await import("../integrations/testora");
    const { createProject } = await import("./projects");
    const { createTask } = await import("./tasks");
    const a = await ws("prov2");
    const proj = await createProject(a.ctx, { name: "P", key: "PRO2" });
    await connectTestora(a.ctx, { appId: "asafarim-web", secret: "whsec_" + randomUUID(), projectId: proj.id });
    const task = await createTask(a.ctx, {
      projectId: proj.id,
      title: "Password reset",
      description: "- [ ] A user can request a reset link",
    });

    const first = await provisionTestsForTask(a.ctx, task.id, {});
    // Simulate Testora having already gone green for this check.
    await db.taskCheck.update({ where: { id: first.checkId }, data: { state: "satisfied" } });

    const second = await provisionTestsForTask(a.ctx, task.id, {
      acceptanceCriteria: [
        { ref: "ac_1", text: "A user can request a reset link" },
        { ref: "ac_2", text: "A new criterion added later" },
      ],
    });

    expect(second.checkId).toBe(first.checkId); // same check, not a new one
    expect(received.length).toBe(2);

    const check = await db.taskCheck.findUnique({ where: { id: first.checkId } });
    expect(check?.state).toBe("satisfied"); // not reset to pending by the re-run

    const checkCount = await db.taskCheck.count({ where: { taskId: task.id } });
    expect(checkCount).toBe(1); // no duplicate
  });

  it("explicit acceptanceCriteria in the request override the description's checklist", async () => {
    const { provisionTestsForTask } = await import("./provisioning");
    const { connectTestora } = await import("../integrations/testora");
    const { createProject } = await import("./projects");
    const { createTask } = await import("./tasks");
    const a = await ws("prov3");
    const proj = await createProject(a.ctx, { name: "P", key: "PRO3" });
    await connectTestora(a.ctx, { appId: "asafarim-web", secret: "whsec_" + randomUUID(), projectId: proj.id });
    const task = await createTask(a.ctx, {
      projectId: proj.id,
      title: "T",
      description: "- [ ] ignored, overridden below",
    });

    await provisionTestsForTask(a.ctx, task.id, {
      acceptanceCriteria: [{ ref: "explicit_1", text: "Explicitly supplied criterion" }],
    });
    const sentBody = received[0]!.body as { acceptanceCriteria: Array<{ ref: string }> };
    expect(sentBody.acceptanceCriteria).toEqual([{ ref: "explicit_1", text: "Explicitly supplied criterion" }]);
  });

  it("no acceptance criteria anywhere → validation_failed, no call made", async () => {
    const { provisionTestsForTask } = await import("./provisioning");
    const { connectTestora } = await import("../integrations/testora");
    const { createProject } = await import("./projects");
    const { createTask } = await import("./tasks");
    const a = await ws("prov4");
    const proj = await createProject(a.ctx, { name: "P", key: "PRO4" });
    await connectTestora(a.ctx, { appId: "asafarim-web", secret: "whsec_" + randomUUID(), projectId: proj.id });
    const task = await createTask(a.ctx, { projectId: proj.id, title: "No criteria", description: "plain text" });

    await expect(provisionTestsForTask(a.ctx, task.id, {})).rejects.toMatchObject({
      code: "validation_failed",
    });
    expect(received.length).toBe(0);
  });
});
