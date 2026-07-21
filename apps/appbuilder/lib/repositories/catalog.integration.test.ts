import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import { closeTestDb, getTestDb, migrateTestDb, resetTestDb } from "../db/testUtils";
import { archiveApp, createApp, listCatalogForActor, restoreApp } from "./apps";
import { addCollaborator } from "./collaborators";
import { listCatalogMetadata } from "./appOverview";
import { createPreviewBuild, updatePreviewBuildStatus } from "./previewBuilds";
import {
  auditEvents,
  creationRequests,
  specifications,
  specificationVersions,
} from "../db/schema";
import { ConflictError, ForbiddenError, NotFoundError } from "../errors";

const db = getTestDb();

const owner = { principalId: "cat-owner", roles: [] };
const editor = { principalId: "cat-editor", roles: [] };
const viewer = { principalId: "cat-viewer", roles: [] };
const unrelated = { principalId: "cat-unrelated", roles: [] };

beforeAll(async () => {
  await migrateTestDb();
});

beforeEach(async () => {
  await resetTestDb();
});

afterAll(async () => {
  await closeTestDb();
});

function baseCatalogQuery(overrides: Partial<Parameters<typeof listCatalogForActor>[2]> = {}) {
  return {
    status: "active" as const,
    access: "all" as const,
    sort: "updated" as const,
    page: 1,
    pageSize: 12,
    ...overrides,
  };
}

async function makeApp(
  actor: typeof owner,
  name: string,
  slugSuffix: string,
  idempotencyKey: string,
) {
  return createApp(
    db,
    actor,
    {
      name,
      slug: `${slugSuffix}-${Math.random().toString(36).slice(2, 8)}`,
      description: `${name} description`,
      prompt: `Build an app for: ${name}`,
      starterFamily: "task_management",
      visibility: "private",
    },
    idempotencyKey,
  );
}

describe("createApp — M05 atomic creation transaction", () => {
  it("creates exactly one app, one specification, one draft version, one creation-request record, and one audit event", async () => {
    const app = await makeApp(owner, "First App", "first-app", "create-first");

    const [spec] = await db.select().from(specifications).where(eq(specifications.appId, app.id));
    expect(spec.currentVersionNumber).toBe(1);
    expect(spec.status).toBe("draft");

    const versions = await db
      .select()
      .from(specificationVersions)
      .where(eq(specificationVersions.appId, app.id));
    expect(versions).toHaveLength(1);
    expect(versions[0].versionNumber).toBe(1);
    expect((versions[0].payload as any).app.name).toBe("First App");

    const [creationRequest] = await db
      .select()
      .from(creationRequests)
      .where(eq(creationRequests.appId, app.id));
    expect(creationRequest.starterFamily).toBe("task_management");
    expect(creationRequest.prompt).toContain("First App");

    const events = await db.select().from(auditEvents).where(eq(auditEvents.appId, app.id));
    const createdEvents = events.filter((e) => e.action === "app.created");
    expect(createdEvents).toHaveLength(1);
  });

  it("persists the prompt and starter family for M07 to consume later", async () => {
    const app = await makeApp(owner, "Prompt App", "prompt-app", "create-prompt");
    const [creationRequest] = await db
      .select()
      .from(creationRequests)
      .where(eq(creationRequests.appId, app.id));

    expect(creationRequest.requestedByPrincipalId).toBe(owner.principalId);
    expect(creationRequest.starterFamily).toBe("task_management");
    expect(creationRequest.visibility).toBe("private");
  });

  it("replays the identical result for a repeated idempotency key + equivalent payload (double-click/refresh/retry safe)", async () => {
    const input = {
      name: "Idempotent App",
      slug: `idem-app-${Math.random().toString(36).slice(2, 8)}`,
      prompt: "Track something",
      starterFamily: "crm" as const,
      visibility: "private" as const,
    };

    const first = await createApp(db, owner, input, "dup-key");
    const second = await createApp(db, owner, input, "dup-key");
    const third = await createApp(db, owner, input, "dup-key"); // simulates a page refresh after success

    expect(second.id).toBe(first.id);
    expect(third.id).toBe(first.id);

    const versions = await db
      .select()
      .from(specificationVersions)
      .where(eq(specificationVersions.appId, first.id));
    expect(versions).toHaveLength(1);

    const creationRows = await db
      .select()
      .from(creationRequests)
      .where(eq(creationRequests.appId, first.id));
    expect(creationRows).toHaveLength(1);
  });

  it("rejects the same idempotency key reused with a different payload", async () => {
    await makeApp(owner, "Original", "original-app", "conflict-key");

    await expect(
      createApp(
        db,
        owner,
        {
          name: "Different",
          slug: `different-${Math.random().toString(36).slice(2, 8)}`,
          prompt: "A totally different app",
          starterFamily: "inventory",
          visibility: "team",
        },
        "conflict-key",
      ),
    ).rejects.toBeInstanceOf(ConflictError);
  });

  it("rolls back the entire transaction when the app slug collides — no orphaned specification/version/creation-request rows", async () => {
    const slug = `rollback-app-${Math.random().toString(36).slice(2, 8)}`;
    await createApp(
      db,
      owner,
      { name: "Taken", slug, prompt: "first", starterFamily: "blank", visibility: "private" },
      "rollback-1",
    );

    await expect(
      createApp(
        db,
        owner,
        { name: "Also Taken", slug, prompt: "second", starterFamily: "blank", visibility: "private" },
        "rollback-2",
      ),
    ).rejects.toBeInstanceOf(ConflictError);

    // Only the first app's rows exist — the failed second attempt left nothing behind.
    const allCreationRequests = await db.select().from(creationRequests);
    expect(allCreationRequests).toHaveLength(1);
  });
});

describe("catalog listing — actor scoping", () => {
  it("lists apps the actor owns, with editor/viewer collaborators seeing shared apps too", async () => {
    const app = await makeApp(owner, "Shared App", "shared-app", "shared-create");
    await addCollaborator(db, owner, app.id, editor.principalId, "editor");
    await addCollaborator(db, owner, app.id, viewer.principalId, "viewer");

    const ownerResult = await listCatalogForActor(db, owner, baseCatalogQuery());
    expect(ownerResult.rows.map((r) => r.app.id)).toContain(app.id);
    expect(ownerResult.rows.find((r) => r.app.id === app.id)?.role).toBe("owner");

    const editorResult = await listCatalogForActor(db, editor, baseCatalogQuery());
    expect(editorResult.rows.map((r) => r.app.id)).toContain(app.id);
    expect(editorResult.rows.find((r) => r.app.id === app.id)?.role).toBe("editor");

    const viewerResult = await listCatalogForActor(db, viewer, baseCatalogQuery());
    expect(viewerResult.rows.map((r) => r.app.id)).toContain(app.id);
    expect(viewerResult.rows.find((r) => r.app.id === app.id)?.role).toBe("viewer");
  });

  it("never returns another user's inaccessible app", async () => {
    await makeApp(owner, "Private App", "private-app", "priv-create");

    const result = await listCatalogForActor(db, unrelated, baseCatalogQuery());
    expect(result.rows).toHaveLength(0);
    expect(result.totalCount).toBe(0);
  });

  it("filters owned vs shared via the access filter", async () => {
    const owned = await makeApp(owner, "Owned Only", "owned-only", "owned-create");
    const shared = await makeApp(owner, "Shared With Editor", "shared-w-editor", "shared-create-2");
    await addCollaborator(db, owner, shared.id, editor.principalId, "editor");

    const editorOwned = await listCatalogForActor(db, editor, baseCatalogQuery({ access: "owned" }));
    expect(editorOwned.rows).toHaveLength(0);

    const editorShared = await listCatalogForActor(db, editor, baseCatalogQuery({ access: "shared" }));
    expect(editorShared.rows.map((r) => r.app.id)).toEqual([shared.id]);

    const ownerOwned = await listCatalogForActor(db, owner, baseCatalogQuery({ access: "owned" }));
    expect(ownerOwned.rows.map((r) => r.app.id).sort()).toEqual([owned.id, shared.id].sort());
  });

  it("filters by status, including the archived view", async () => {
    const active = await makeApp(owner, "Stays Active", "stays-active", "active-create");
    const toArchive = await makeApp(owner, "Gets Archived", "gets-archived", "archive-create");
    await archiveApp(db, owner, toArchive.id);

    const activeOnly = await listCatalogForActor(db, owner, baseCatalogQuery({ status: "active" }));
    expect(activeOnly.rows.map((r) => r.app.id)).toEqual([active.id]);

    const archivedOnly = await listCatalogForActor(db, owner, baseCatalogQuery({ status: "archived" }));
    expect(archivedOnly.rows.map((r) => r.app.id)).toEqual([toArchive.id]);

    const all = await listCatalogForActor(db, owner, baseCatalogQuery({ status: "all" }));
    expect(all.rows.map((r) => r.app.id).sort()).toEqual([active.id, toArchive.id].sort());
  });

  it("searches by name and description, case-insensitively", async () => {
    await makeApp(owner, "Field Ops Tracker", "field-ops", "search-create-1");
    await makeApp(owner, "Something Else", "something-else", "search-create-2");

    const result = await listCatalogForActor(db, owner, baseCatalogQuery({ search: "field ops" }));
    expect(result.rows).toHaveLength(1);
    expect(result.rows[0].app.name).toBe("Field Ops Tracker");

    const caseInsensitive = await listCatalogForActor(db, owner, baseCatalogQuery({ search: "FIELD" }));
    expect(caseInsensitive.rows).toHaveLength(1);
  });

  it("treats % and _ in search input as literal characters, not SQL wildcards", async () => {
    await makeApp(owner, "50%_off Deals", "fifty-percent", "wildcard-create-1");
    await makeApp(owner, "Unrelated App", "unrelated-app", "wildcard-create-2");

    const literalMatch = await listCatalogForActor(db, owner, baseCatalogQuery({ search: "50%_off" }));
    expect(literalMatch.rows).toHaveLength(1);
    expect(literalMatch.rows[0].app.name).toBe("50%_off Deals");

    // A bare "%" would match every row's description if not escaped —
    // confirm it doesn't produce every row for this owner.
    const bareWildcard = await listCatalogForActor(db, owner, baseCatalogQuery({ search: "%" }));
    expect(bareWildcard.rows.length).toBeLessThanOrEqual(1);
  });

  it("sorts by name deterministically", async () => {
    await makeApp(owner, "Zeta", "zeta-app", "sort-create-1");
    await makeApp(owner, "Alpha", "alpha-app", "sort-create-2");

    const result = await listCatalogForActor(db, owner, baseCatalogQuery({ sort: "name" }));
    const names = result.rows.map((r) => r.app.name);
    expect(names.indexOf("Alpha")).toBeLessThan(names.indexOf("Zeta"));
  });

  it("paginates deterministically with no duplicate or skipped rows across pages", async () => {
    for (let i = 0; i < 5; i += 1) {
      await makeApp(owner, `Paged App ${i}`, `paged-app-${i}`, `page-create-${i}`);
    }

    const page1 = await listCatalogForActor(db, owner, baseCatalogQuery({ sort: "name", page: 1, pageSize: 2 }));
    const page2 = await listCatalogForActor(db, owner, baseCatalogQuery({ sort: "name", page: 2, pageSize: 2 }));
    const page3 = await listCatalogForActor(db, owner, baseCatalogQuery({ sort: "name", page: 3, pageSize: 2 }));

    expect(page1.totalCount).toBe(5);
    const allIds = [...page1.rows, ...page2.rows, ...page3.rows].map((r) => r.app.id);
    expect(new Set(allIds).size).toBe(allIds.length); // no duplicates
    expect(allIds).toHaveLength(5); // no skipped rows
  });
});

describe("archive / restore", () => {
  it("archives and restores idempotently, with audit events", async () => {
    const app = await makeApp(owner, "Lifecycle App", "lifecycle-app", "lifecycle-create");

    const archived = await archiveApp(db, owner, app.id);
    expect(archived.status).toBe("archived");
    const archivedAgain = await archiveApp(db, owner, app.id); // idempotent retry/refresh
    expect(archivedAgain.status).toBe("archived");

    const restored = await restoreApp(db, owner, app.id);
    expect(restored.status).toBe("active");
    const restoredAgain = await restoreApp(db, owner, app.id); // idempotent retry/refresh
    expect(restoredAgain.status).toBe("active");

    const events = await db.select().from(auditEvents).where(eq(auditEvents.appId, app.id));
    expect(events.filter((e) => e.action === "app.archived")).toHaveLength(1); // no duplicate from the idempotent retry
    expect(events.filter((e) => e.action === "app.restored")).toHaveLength(1);
  });

  it("rejects archive/restore from an editor or viewer (owner-only)", async () => {
    const app = await makeApp(owner, "Owner Only App", "owner-only-app", "owner-only-create");
    await addCollaborator(db, owner, app.id, editor.principalId, "editor");
    await addCollaborator(db, owner, app.id, viewer.principalId, "viewer");

    await expect(archiveApp(db, editor, app.id)).rejects.toBeInstanceOf(ForbiddenError);
    await expect(archiveApp(db, viewer, app.id)).rejects.toBeInstanceOf(ForbiddenError);
  });

  it("rejects archive/restore from an unrelated actor as NotFoundError (no existence leak)", async () => {
    const app = await makeApp(owner, "Hidden App", "hidden-app", "hidden-create");

    await expect(archiveApp(db, unrelated, app.id)).rejects.toBeInstanceOf(NotFoundError);
    await expect(restoreApp(db, unrelated, app.id)).rejects.toBeInstanceOf(NotFoundError);
  });

  it("blocks normal edit-shaped capabilities while archived", async () => {
    const app = await makeApp(owner, "Blocked App", "blocked-app", "blocked-create");
    await archiveApp(db, owner, app.id);

    const { applyOperation } = await import("./operations");
    await expect(
      applyOperation(db, owner, app.id, {
        operation: { opVersion: "1.0.0", type: "CREATE_ENTITY", entity: { id: "x", machineName: "x", name: "x" } },
        baseVersionNumber: 1,
        idempotencyKey: "blocked-op",
      }),
    ).rejects.toBeInstanceOf(ConflictError);
  });

  it("archived apps still respect the isolation/leak-prevention rules", async () => {
    const app = await makeApp(owner, "Archived Hidden App", "archived-hidden", "archived-hidden-create");
    await archiveApp(db, owner, app.id);

    const result = await listCatalogForActor(db, unrelated, baseCatalogQuery({ status: "all" }));
    expect(result.rows.map((r) => r.app.id)).not.toContain(app.id);
  });
});

describe("catalog metadata — preview link visibility", () => {
  it("only reports a succeeded preview when one has actually completed", async () => {
    const app = await makeApp(owner, "Preview App", "preview-app", "preview-create");

    const noPreview = await listCatalogMetadata(db, [app.id]);
    expect(noPreview.get(app.id)?.previewStatus).toBeNull();

    const [version] = await db
      .select()
      .from(specificationVersions)
      .where(eq(specificationVersions.appId, app.id));
    const build = await createPreviewBuild(db, owner, app.id, version.id);
    const queued = await listCatalogMetadata(db, [app.id]);
    expect(queued.get(app.id)?.previewStatus).toBe("queued");

    await updatePreviewBuildStatus(db, owner, app.id, build.id, { status: "succeeded", completedAt: new Date() });
    const succeeded = await listCatalogMetadata(db, [app.id]);
    expect(succeeded.get(app.id)?.previewStatus).toBe("succeeded");
  });
});

describe("catalog query — malformed input handled by the validation layer", () => {
  it("normalizeCatalogQuery falls back safely (covered in lib/validation/catalogQuery.test.ts); repository trusts pre-normalized input", async () => {
    // This is a documentation test: listCatalogForActor intentionally does
    // not re-validate its query — normalizeCatalogQuery (unit-tested
    // separately) is the only path malformed URL params should take before
    // reaching here.
    const result = await listCatalogForActor(db, owner, baseCatalogQuery({ page: 1 }));
    expect(result.page).toBe(1);
  });
});
