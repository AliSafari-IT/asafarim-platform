import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { closeTestDb, getTestDb, migrateTestDb, resetTestDb } from "../db/testUtils";
import { createApp, getAppForActor, listAppsForActor } from "./apps";
import { addCollaborator, revokeCollaborator } from "./collaborators";
import { applyOperation } from "./operations";
import { ForbiddenError, ConflictError, NotFoundError } from "../errors";

const db = getTestDb();

const ownerA = { principalId: "owner-a" };
const ownerB = { principalId: "owner-b" };
const stranger = { principalId: "stranger" };

beforeAll(async () => {
  await migrateTestDb();
});

beforeEach(async () => {
  await resetTestDb();
});

afterAll(async () => {
  await closeTestDb();
});

describe("owner/app isolation", () => {
  it("lets each owner create and read their own apps", async () => {
    const appA = await createApp(db, ownerA, { name: "A's App", slug: "as-app" }, "create-a");
    const appB = await createApp(db, ownerB, { name: "B's App", slug: "bs-app" }, "create-b");

    expect(await getAppForActor(db, ownerA, appA.id)).toMatchObject({ id: appA.id });
    expect(await getAppForActor(db, ownerB, appB.id)).toMatchObject({ id: appB.id });
  });

  it("rejects a cross-owner read", async () => {
    const appA = await createApp(db, ownerA, { name: "A's App", slug: "as-app" }, "create-a");

    await expect(getAppForActor(db, ownerB, appA.id)).rejects.toBeInstanceOf(ForbiddenError);
    await expect(getAppForActor(db, stranger, appA.id)).rejects.toBeInstanceOf(ForbiddenError);
  });

  it("rejects a cross-owner write (applying an operation on someone else's app)", async () => {
    const appA = await createApp(db, ownerA, { name: "A's App", slug: "as-app" }, "create-a");

    await expect(
      applyOperation(db, ownerB, appA.id, {
        operationType: "add-entity",
        payload: { entity: "Widget" },
        idempotencyKey: "cross-owner-op",
      }),
    ).rejects.toBeInstanceOf(ForbiddenError);
  });

  it("scopes listAppsForActor to only the actor's own and collaborated apps", async () => {
    const appA1 = await createApp(db, ownerA, { name: "A1", slug: "a1" }, "create-a1");
    const appA2 = await createApp(db, ownerA, { name: "A2", slug: "a2" }, "create-a2");
    const appB1 = await createApp(db, ownerB, { name: "B1", slug: "b1" }, "create-b1");

    const listA = await listAppsForActor(db, ownerA);
    expect(listA.map((a) => a.id).sort()).toEqual([appA1.id, appA2.id].sort());

    const listB = await listAppsForActor(db, ownerB);
    expect(listB).toHaveLength(1);
    expect(listB[0].id).toBe(appB1.id);
  });

  it("grants a collaborator scoped access without granting owner-only actions", async () => {
    const appB = await createApp(db, ownerB, { name: "B's App", slug: "bs-app" }, "create-b");
    await addCollaborator(db, ownerB, appB.id, "collab-1", "editor");

    const collaborator = { principalId: "collab-1" };
    // Editor can read and apply operations...
    expect(await getAppForActor(db, collaborator, appB.id)).toMatchObject({ id: appB.id });
    await expect(
      applyOperation(db, collaborator, appB.id, {
        operationType: "add-entity",
        payload: { entity: "Thing" },
        idempotencyKey: "collab-op-1",
      }),
    ).resolves.toBeDefined();

    // ...but cannot add another collaborator (owner-only).
    await expect(addCollaborator(db, collaborator, appB.id, "collab-2", "viewer")).rejects.toBeInstanceOf(
      ForbiddenError,
    );
  });

  it("revoked collaborators lose access", async () => {
    const appB = await createApp(db, ownerB, { name: "B's App", slug: "bs-app" }, "create-b");
    const collaborator = await addCollaborator(db, ownerB, appB.id, "collab-1", "viewer");
    await revokeCollaborator(db, ownerB, appB.id, collaborator.id);

    await expect(getAppForActor(db, { principalId: "collab-1" }, appB.id)).rejects.toBeInstanceOf(ForbiddenError);
  });

  it("cannot revoke a collaborator via another app's id (cross-app id confusion)", async () => {
    const appA = await createApp(db, ownerA, { name: "A's App", slug: "as-app" }, "create-a");
    const appB = await createApp(db, ownerB, { name: "B's App", slug: "bs-app" }, "create-b");
    const collaborator = await addCollaborator(db, ownerB, appB.id, "collab-1", "viewer");

    // ownerA is not even authorized to touch appB — but exercise the deeper
    // guarantee too: even a caller authorized on appA can't use appA's id to
    // reach a collaborator row that belongs to appB.
    await expect(revokeCollaborator(db, ownerA, appA.id, collaborator.id)).rejects.toBeInstanceOf(NotFoundError);
  });

  it("throws NotFoundError for a nonexistent app", async () => {
    await expect(getAppForActor(db, ownerA, "does-not-exist")).rejects.toBeInstanceOf(NotFoundError);
  });
});

describe("idempotency", () => {
  it("replays the same app for a repeated create-app idempotency key", async () => {
    const first = await createApp(db, ownerA, { name: "Once", slug: "once" }, "idem-1");
    const second = await createApp(db, ownerA, { name: "Once", slug: "once" }, "idem-1");

    expect(second.id).toBe(first.id);
  });

  it("rejects reusing an idempotency key with a different payload", async () => {
    await createApp(db, ownerA, { name: "Once", slug: "once" }, "idem-2");

    await expect(createApp(db, ownerA, { name: "Different", slug: "different" }, "idem-2")).rejects.toBeInstanceOf(
      ConflictError,
    );
  });

  it("rejects creating two apps with the same slug", async () => {
    await createApp(db, ownerA, { name: "First", slug: "dup-slug" }, "idem-3");

    await expect(createApp(db, ownerA, { name: "Second", slug: "dup-slug" }, "idem-4")).rejects.toBeInstanceOf(
      ConflictError,
    );
  });

  it("replays the same specification version for a repeated operation idempotency key", async () => {
    const app = await createApp(db, ownerA, { name: "App", slug: "app-op" }, "idem-app-op");

    const first = await applyOperation(db, ownerA, app.id, {
      operationType: "add-entity",
      payload: { entity: "Widget" },
      idempotencyKey: "op-once",
    });
    const second = await applyOperation(db, ownerA, app.id, {
      operationType: "add-entity",
      payload: { entity: "Widget" },
      idempotencyKey: "op-once",
    });

    expect(second.id).toBe(first.id);
    expect(second.resultingVersionId).toBe(first.resultingVersionId);
  });
});
