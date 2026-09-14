import { beforeEach, describe, expect, it, vi } from "vitest";
import type { RequestContext } from "../context";

// Activity/outbox writes are exercised by the integration suite; here they
// are noise.
vi.mock("../events/emit", () => ({ emitActivity: vi.fn(), recordAudit: vi.fn() }));

import { createTask } from "../services/tasks";
import { USER_CAPTURE_SOURCES } from "./inbox";
import { ensureInboxProjectFor, triageTask } from "./service";

/**
 * Capture regressions for issue #366. The behaviour these pin down:
 *
 *   * capture needs only a title, from anywhere, including a page that
 *     knows nothing about projects;
 *   * with zero, one, or five projects, capture without a chosen project
 *     lands in the workspace Inbox container — never in `projects[0]`;
 *   * provenance survives;
 *   * a guest cannot capture at all.
 */

interface FakeProject {
  id: string;
  key: string;
  name: string;
  workspaceId: string;
  isInbox: boolean;
  archivedAt: Date | null;
}

function makeDb(
  projects: FakeProject[],
  tasks: Record<string, unknown>[] = [],
  members: { id: string; role: string }[] = [
    { id: "mem_me", role: "owner" },
    { id: "mem_other", role: "member" },
  ],
) {
  let seq = projects.length;
  const db = {
    project: {
      findFirst: vi.fn(async ({ where }: { where: Record<string, unknown> }) => {
        return (
          projects.find((p) => {
            if (where.id && p.id !== where.id) return false;
            if (where.workspaceId && p.workspaceId !== where.workspaceId) return false;
            if (where.isInbox === true && !p.isInbox) return false;
            if (where.archivedAt === null && p.archivedAt !== null) return false;
            return true;
          }) ?? null
        );
      }),
      findUnique: vi.fn(async ({ where }: { where: { workspaceId_key: { key: string } } }) => {
        return projects.find((p) => p.key === where.workspaceId_key.key) ?? null;
      }),
      create: vi.fn(async ({ data }: { data: Record<string, unknown> }) => {
        seq += 1;
        const row = { id: `prj_new_${seq}`, archivedAt: null, ...data } as unknown as FakeProject;
        projects.push(row);
        return row;
      }),
    },
    membership: {
      findFirst: vi.fn(async ({ where }: { where: { id?: string } }) =>
        members.find((m) => m.id === where.id) ?? null,
      ),
    },
    task: {
      count: vi.fn(async () => 0),
      findFirst: vi.fn(async ({ where }: { where: { id?: string } }) =>
        tasks.find((t) => t.id === where.id) ?? null,
      ),
      create: vi.fn(async ({ data }: { data: Record<string, unknown> }) => ({
        id: "tsk_1",
        version: 0,
        ...data,
      })),
      update: vi.fn(async ({ data }: { data: Record<string, unknown> }) => ({
        id: "tsk_1",
        version: 1,
        ...data,
      })),
    },
    // `lockTaskRow` takes a `SELECT … FOR UPDATE` inside the transaction;
    // there is no row locking to simulate in-process.
    $queryRaw: vi.fn(async () => []),
    $transaction: async (fn: (tx: unknown) => Promise<unknown>) => fn(db),
  };
  return db;
}

function ctxFor(db: ReturnType<typeof makeDb>, role = "member"): RequestContext {
  return {
    db: db as unknown as RequestContext["db"],
    workspaceId: "ws_1",
    workspaceSlug: "acme",
    actor: {
      membershipId: "mem_me",
      platformUserId: "user_me",
      role: role as RequestContext["actor"]["role"],
    },
    correlationId: "cid-test",
  };
}

function project(id: string, key: string, extra: Partial<FakeProject> = {}): FakeProject {
  return {
    id,
    key,
    name: key,
    workspaceId: "ws_1",
    isInbox: false,
    archivedAt: null,
    ...extra,
  };
}

describe("global capture", () => {
  beforeEach(() => vi.clearAllMocks());

  it("captures with only a title, from a page with no project context (zero projects)", async () => {
    const projects: FakeProject[] = [];
    const db = makeDb(projects);

    const task = await createTask(ctxFor(db), {
      title: "Call Dana back",
      source: "quick_capture",
    });

    // An Inbox container was created rather than the capture failing.
    expect(projects).toHaveLength(1);
    expect(projects[0].isInbox).toBe(true);
    expect(task.projectId).toBe(projects[0].id);
    expect(task.triagedAt).toBeNull();
  });

  it("captures into the Inbox, not the only existing project", async () => {
    const projects = [project("prj_only", "WEB")];
    const db = makeDb(projects);

    const task = await createTask(ctxFor(db), { title: "Idea", source: "quick_capture" });

    expect(task.projectId).not.toBe("prj_only");
    expect(projects.find((p) => p.id === task.projectId)?.isInbox).toBe(true);
  });

  it("never silently picks projects[0] when the workspace has several", async () => {
    const projects = [project("prj_1", "AAA"), project("prj_2", "BBB"), project("prj_3", "CCC")];
    const db = makeDb(projects);

    const task = await createTask(ctxFor(db), { title: "Ambiguous", source: "quick_capture" });

    expect(["prj_1", "prj_2", "prj_3"]).not.toContain(task.projectId);
    expect(projects.find((p) => p.id === task.projectId)?.isInbox).toBe(true);
    expect(task.triagedAt).toBeNull();
  });

  it("honours an explicit project, and that choice counts as triage", async () => {
    const projects = [project("prj_1", "AAA"), project("prj_2", "BBB")];
    const db = makeDb(projects);

    const task = await createTask(ctxFor(db), {
      title: "Deliberate",
      projectId: "prj_2",
      source: "quick_capture",
    });

    expect(task.projectId).toBe("prj_2");
    expect(task.triagedAt).not.toBeNull();
  });

  it("can hold an explicitly-projected capture in the Inbox for review", async () => {
    const projects = [project("prj_1", "AAA")];
    const db = makeDb(projects);

    const task = await createTask(ctxFor(db), {
      title: "Park this",
      projectId: "prj_1",
      captureToInbox: true,
      source: "quick_capture",
    });

    expect(task.projectId).toBe("prj_1");
    expect(task.triagedAt).toBeNull();
  });

  it("preserves provenance for every capture channel", async () => {
    for (const source of ["manual", "quick_capture", "import", "proposal", "email", "integration"]) {
      const db = makeDb([project("prj_1", "AAA")]);
      const task = await createTask(ctxFor(db), {
        title: `via ${source}`,
        projectId: "prj_1",
        source,
      });
      expect(task.source).toBe(source);
    }
  });

  it("holds emailed and integration work for triage even with a project", async () => {
    const db = makeDb([project("prj_1", "AAA")]);
    const emailed = await createTask(ctxFor(db), {
      title: "Emailed in",
      projectId: "prj_1",
      source: "email",
    });
    expect(emailed.triagedAt).toBeNull();
  });

  it("refuses a system-channel source on a caller-supplied request", async () => {
    const db = makeDb([project("prj_1", "AAA")]);

    await expect(
      createTask(
        ctxFor(db),
        { title: "not really imported", projectId: "prj_1", source: "import" },
        { allowedSources: USER_CAPTURE_SOURCES },
      ),
    ).rejects.toMatchObject({ code: "validation_failed" });
    expect(db.task.create).not.toHaveBeenCalled();
  });

  it("refuses a guest: capture is a member capability", async () => {
    const db = makeDb([project("prj_1", "AAA")]);
    await expect(
      createTask(ctxFor(db, "guest"), { title: "not allowed", source: "quick_capture" }),
    ).rejects.toMatchObject({ code: "forbidden" });
    expect(db.task.create).not.toHaveBeenCalled();
  });
});

describe("ensureInboxProjectFor", () => {
  beforeEach(() => vi.clearAllMocks());

  it("reuses the existing container instead of creating a second one", async () => {
    const projects = [project("prj_inbox", "INBOX", { isInbox: true })];
    const db = makeDb(projects);

    const found = await ensureInboxProjectFor(db as never, "ws_1");

    expect(found.id).toBe("prj_inbox");
    expect(db.project.create).not.toHaveBeenCalled();
  });

  it("steps around a user-made project that already owns the INBOX key", async () => {
    const projects = [project("prj_squatter", "INBOX")];
    const db = makeDb(projects);

    const created = await ensureInboxProjectFor(db as never, "ws_1");

    expect(created.key).toBe("INBOX0");
    expect(created.id).not.toBe("prj_squatter");
  });
});

describe("triage", () => {
  beforeEach(() => vi.clearAllMocks());

  it("assigning to a member stamps triagedAt, so the item leaves the Inbox", async () => {
    const db = makeDb(
      [project("prj_inbox", "INBOX", { isInbox: true }), project("prj_1", "AAA")],
      [{ id: "tsk_1", workspaceId: "ws_1", projectId: "prj_inbox", parentId: null, triagedAt: null }],
    );

    const updated = await triageTask(ctxFor(db), "tsk_1", {
      projectId: "prj_1",
      assigneeId: "mem_me",
    });

    expect(updated.projectId).toBe("prj_1");
    expect(updated.assigneeId).toBe("mem_me");
    expect(updated.triagedAt).toBeInstanceOf(Date);
  });

  it("can set fields without closing triage", async () => {
    const db = makeDb(
      [project("prj_inbox", "INBOX", { isInbox: true })],
      [{ id: "tsk_1", workspaceId: "ws_1", projectId: "prj_inbox", parentId: null, triagedAt: null }],
    );

    const updated = await triageTask(ctxFor(db), "tsk_1", {
      assigneeId: "mem_other",
      triaged: false,
    });

    expect(updated.triagedAt).toBeNull();
  });

  it("refuses a guest", async () => {
    const db = makeDb(
      [project("prj_inbox", "INBOX", { isInbox: true })],
      [{ id: "tsk_1", workspaceId: "ws_1", projectId: "prj_inbox", parentId: null, triagedAt: null }],
    );

    await expect(
      triageTask(ctxFor(db, "guest"), "tsk_1", { assigneeId: "mem_me" }),
    ).rejects.toMatchObject({ code: "forbidden" });
  });

  it("refuses an owner from another workspace", async () => {
    const db = makeDb(
      [project("prj_inbox", "INBOX", { isInbox: true })],
      [{ id: "tsk_1", workspaceId: "ws_1", projectId: "prj_inbox", parentId: null, triagedAt: null }],
      [{ id: "mem_me", role: "owner" }],
    );

    await expect(
      triageTask(ctxFor(db), "tsk_1", { assigneeId: "mem_in_other_workspace" }),
    ).rejects.toMatchObject({ code: "not_found" });
    expect(db.task.update).not.toHaveBeenCalled();
  });

  it("refuses a project move that would strand child tasks", async () => {
    const db = makeDb(
      [project("prj_inbox", "INBOX", { isInbox: true }), project("prj_1", "AAA")],
      [{ id: "tsk_1", workspaceId: "ws_1", projectId: "prj_inbox", parentId: null, triagedAt: null }],
    );
    db.task.count.mockResolvedValueOnce(2);

    await expect(
      triageTask(ctxFor(db), "tsk_1", { projectId: "prj_1" }),
    ).rejects.toMatchObject({ code: "validation_failed" });
    expect(db.task.update).not.toHaveBeenCalled();
  });

  it("refuses a stale triage rather than overwriting a concurrent one", async () => {
    const db = makeDb(
      [project("prj_inbox", "INBOX", { isInbox: true })],
      [
        {
          id: "tsk_1",
          workspaceId: "ws_1",
          projectId: "prj_inbox",
          parentId: null,
          triagedAt: null,
          version: 3,
        },
      ],
    );

    await expect(
      triageTask(ctxFor(db), "tsk_1", { triaged: true }, 2),
    ).rejects.toMatchObject({ code: "conflict_version" });
    expect(db.task.update).not.toHaveBeenCalled();
  });
});
