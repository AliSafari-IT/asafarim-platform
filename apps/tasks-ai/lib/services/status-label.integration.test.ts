import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { execSync } from "node:child_process";
import { PrismaPg } from "@prisma/adapter-pg";
import { hasTestDatabase, requireTestDatabaseUrl } from "../db/test-database";
import { PrismaClient } from "../db/generated";
import type { RequestContext } from "../context";

vi.mock("../session", () => ({ getViewer: vi.fn(async () => ({ id: "noop" })) }));

/**
 * Status + label CRUD (issue #387). Both subsystems had zero rows created
 * anywhere in this codebase before this change — these tests cover
 * creation, ordering, owner/admin gating, archive semantics, and that a
 * member (not just an admin) can tag/untag a task they can already edit.
 */
describe.skipIf(!hasTestDatabase())("statuses + labels (integration)", () => {
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

  async function ws(tag: string, role: "owner" | "admin" | "member" | "guest" = "owner") {
    const w = await db.workspace.create({
      data: { name: tag, slug: `${tag}-${Date.now()}-${Math.random().toString(36).slice(2, 6)}` },
    });
    const actorMember = await db.membership.create({
      data: { workspaceId: w.id, platformUserId: `${role}-${tag}`, role },
    });
    const ctx: RequestContext = {
      db,
      workspaceId: w.id,
      workspaceSlug: w.slug,
      actor: { membershipId: actorMember.id, platformUserId: `${role}-${tag}`, role },
      correlationId: `cid-${tag}`,
    };
    return { w, actorMember, ctx };
  }

  let projectSeq = 0;
  async function makeTask(ctx: RequestContext, tag: string, title: string) {
    const { createProject } = await import("./projects");
    const { createTask } = await import("./tasks");
    const key = `${tag.slice(0, 2)}${(++projectSeq).toString(36)}`.toUpperCase();
    const proj = await createProject(ctx, { name: "P", key });
    return createTask(ctx, { projectId: proj.id, title });
  }

  describe("statuses", () => {
    it("creating a workspace seeds Todo / In Progress / Done", async () => {
      const { createWorkspace } = await import("./workspaces");
      const { getViewer } = await import("../session");
      vi.mocked(getViewer).mockResolvedValueOnce({ id: `owner-seed-${Date.now()}` } as never);
      const w = await createWorkspace(
        { name: "Seeded", slug: `seeded-${Date.now()}-${Math.random().toString(36).slice(2, 6)}` },
        "cid-seed",
      );
      const rows = await db.status.findMany({ where: { workspaceId: w.id }, orderBy: { position: "asc" } });
      expect(rows.map((r) => r.name)).toEqual(["Todo", "In Progress", "Done"]);
      expect(rows.every((r) => r.isDefault)).toBe(true);
    });

    it("an admin can create a status; a member cannot", async () => {
      const { createStatus } = await import("./statuses");
      const admin = await ws("st1", "admin");
      const created = await createStatus(admin.ctx, { name: "Blocked", category: "in_progress" });
      expect(created.name).toBe("Blocked");

      const member = await ws("st2", "member");
      await expect(createStatus(member.ctx, { name: "Blocked", category: "in_progress" })).rejects.toThrow();
    });

    it("rejects a duplicate name in the same scope", async () => {
      const { createStatus } = await import("./statuses");
      const admin = await ws("st3", "admin");
      await createStatus(admin.ctx, { name: "Review", category: "in_progress" });
      await expect(createStatus(admin.ctx, { name: "Review", category: "in_progress" })).rejects.toThrow();
    });

    it("reorderStatuses persists the new position order", async () => {
      const { listStatuses, reorderStatuses } = await import("./statuses");
      const admin = await ws("st4", "admin");
      const before = await listStatuses(admin.ctx);
      const ids = before.map((s) => s.id).reverse();

      const after = await reorderStatuses(admin.ctx, { ids });
      expect(after.map((s) => s.id)).toEqual(ids);
    });

    it("archiveStatus soft-deletes and excludes it from listStatuses", async () => {
      const { archiveStatus, createStatus, listStatuses } = await import("./statuses");
      const admin = await ws("st5", "admin");
      const extra = await createStatus(admin.ctx, { name: "Someday", category: "todo" });

      const archived = await archiveStatus(admin.ctx, extra.id);
      expect(archived.archivedAt).not.toBeNull();

      const visible = await listStatuses(admin.ctx);
      expect(visible.find((s) => s.id === extra.id)).toBeUndefined();
    });

    it("a task keeps its statusId after that status is archived", async () => {
      const { archiveStatus, createStatus } = await import("./statuses");
      const { updateTask } = await import("./tasks");
      const admin = await ws("st6", "admin");
      const status = await createStatus(admin.ctx, { name: "Temp", category: "todo" });
      const task = await makeTask(admin.ctx, "st6", "Do the thing");

      const updated = await updateTask(admin.ctx, task.id, { statusId: status.id });
      expect(updated.statusId).toBe(status.id);

      await archiveStatus(admin.ctx, status.id);
      const reloaded = await db.task.findUniqueOrThrow({ where: { id: task.id } });
      expect(reloaded.statusId).toBe(status.id);
    });
  });

  describe("labels", () => {
    it("a member can create a label (label.manage is member-level, per lib/authz.ts)", async () => {
      const { createLabel } = await import("./labels");
      const member = await ws("lb1", "member");
      const label = await createLabel(member.ctx, { name: "urgent", color: "#ff0000" });
      expect(label.name).toBe("urgent");
    });

    it("a guest cannot create a label", async () => {
      const { createLabel } = await import("./labels");
      const guest = await ws("lb2", "guest");
      await expect(createLabel(guest.ctx, { name: "urgent" })).rejects.toThrow();
    });

    it("rejects a duplicate label name in the workspace", async () => {
      const { createLabel } = await import("./labels");
      const admin = await ws("lb3", "admin");
      await createLabel(admin.ctx, { name: "dup" });
      await expect(createLabel(admin.ctx, { name: "dup" })).rejects.toThrow();
    });

    it("a member can assign and remove a label on a task they can edit", async () => {
      const { assignLabel, createLabel, removeLabel } = await import("./labels");
      const { listTaskLabels } = await import("../repositories/labels");
      const member = await ws("lb4", "member");
      const label = await createLabel(member.ctx, { name: "design" });
      const task = await makeTask(member.ctx, "lb4", "Mock up the screen");

      await assignLabel(member.ctx, task.id, label.id);
      expect((await listTaskLabels(member.ctx, task.id)).map((l) => l.id)).toEqual([label.id]);

      await removeLabel(member.ctx, task.id, label.id);
      expect(await listTaskLabels(member.ctx, task.id)).toEqual([]);
    });

    it("a guest cannot assign a label to a task", async () => {
      const { assignLabel, createLabel } = await import("./labels");
      const admin = await ws("lb5", "admin");
      const label = await createLabel(admin.ctx, { name: "guestcheck" });
      const task = await makeTask(admin.ctx, "lb5", "Guest-visible task");
      const guest = { ...admin.ctx, actor: { ...admin.ctx.actor, role: "guest" as const } };

      await expect(assignLabel(guest, task.id, label.id)).rejects.toThrow();
    });

    it("archiveLabel soft-deletes and hides it from listLabels", async () => {
      const { archiveLabel, createLabel, listLabels } = await import("./labels");
      const admin = await ws("lb6", "admin");
      const label = await createLabel(admin.ctx, { name: "temp" });

      await archiveLabel(admin.ctx, label.id);
      expect((await listLabels(admin.ctx)).find((l) => l.id === label.id)).toBeUndefined();
    });

    it("refuses assigning an archived label", async () => {
      const { archiveLabel, assignLabel, createLabel } = await import("./labels");
      const admin = await ws("lb7", "admin");
      const label = await createLabel(admin.ctx, { name: "archived-target" });
      await archiveLabel(admin.ctx, label.id);
      const task = await makeTask(admin.ctx, "lb7", "Task");

      await expect(assignLabel(admin.ctx, task.id, label.id)).rejects.toThrow();
    });
  });
});
