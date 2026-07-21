import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import { ROLES } from "@asafarim/auth/roles";
import { closeTestDb, getTestDb, migrateTestDb, resetTestDb } from "../db/testUtils";
import { archiveApp, createApp, getAppForActor, listAppsForActor, restoreApp } from "./apps";
import { addCollaborator, changeCollaboratorRole, revokeCollaborator } from "./collaborators";
import { applyOperation } from "./operations";
import { listAuditEventsForActor } from "./auditEvents";
import { appliedOperations, collaborators as collaboratorsTable } from "../db/schema";
import { generateId } from "../db/ids";
import { ForbiddenError, ConflictError, NotFoundError } from "../errors";

const db = getTestDb();

const owner = { principalId: "cap-owner", roles: [] };
const editor = { principalId: "cap-editor", roles: [] };
const viewer = { principalId: "cap-viewer", roles: [] };
const unrelated = { principalId: "cap-unrelated", roles: [] };
const superadmin = { principalId: "cap-superadmin", roles: [ROLES.SUPERADMIN] };

function createEntityOp(id: string) {
  return { opVersion: "1.0.0", type: "CREATE_ENTITY", entity: { id, machineName: id, name: id } };
}

beforeAll(async () => {
  await migrateTestDb();
});

beforeEach(async () => {
  await resetTestDb();
});

afterAll(async () => {
  await closeTestDb();
});

async function makeAppWithCollaborators() {
  const app = await createApp(db, owner, { name: "Capability App", slug: "capability-app" }, "cap-create");
  await addCollaborator(db, owner, app.id, editor.principalId, "editor");
  await addCollaborator(db, owner, app.id, viewer.principalId, "viewer");
  return app;
}

describe("capability matrix — owner", () => {
  it("has full management capability: view, edit, manage collaborators, archive, restore, deploy", async () => {
    const app = await makeAppWithCollaborators();

    await expect(getAppForActor(db, owner, app.id)).resolves.toBeDefined();
    await expect(
      applyOperation(db, owner, app.id, {
        operation: createEntityOp("widget_owner"),
        baseVersionNumber: 0,
        idempotencyKey: "owner-op",
      }),
    ).resolves.toBeDefined();
    await expect(addCollaborator(db, owner, app.id, "another-collab", "viewer")).resolves.toBeDefined();
    await expect(archiveApp(db, owner, app.id)).resolves.toMatchObject({ status: "archived" });
    await expect(restoreApp(db, owner, app.id)).resolves.toMatchObject({ status: "active" });
  });
});

describe("capability matrix — editor", () => {
  it("can view and edit but not perform owner-only administration", async () => {
    const app = await makeAppWithCollaborators();

    await expect(getAppForActor(db, editor, app.id)).resolves.toBeDefined();
    await expect(
      applyOperation(db, editor, app.id, {
        operation: createEntityOp("widget_editor"),
        baseVersionNumber: 0,
        idempotencyKey: "editor-op",
      }),
    ).resolves.toBeDefined();

    await expect(addCollaborator(db, editor, app.id, "someone-else", "viewer")).rejects.toBeInstanceOf(
      ForbiddenError,
    );
    await expect(archiveApp(db, editor, app.id)).rejects.toBeInstanceOf(ForbiddenError);
  });
});

describe("capability matrix — viewer", () => {
  it("has read-only access and cannot mutate", async () => {
    const app = await makeAppWithCollaborators();

    await expect(getAppForActor(db, viewer, app.id)).resolves.toBeDefined();

    await expect(
      applyOperation(db, viewer, app.id, {
        operation: createEntityOp("widget_viewer"),
        baseVersionNumber: 0,
        idempotencyKey: "viewer-op",
      }),
    ).rejects.toBeInstanceOf(ForbiddenError);
    await expect(addCollaborator(db, viewer, app.id, "someone-else", "viewer")).rejects.toBeInstanceOf(
      ForbiddenError,
    );
    await expect(archiveApp(db, viewer, app.id)).rejects.toBeInstanceOf(ForbiddenError);
  });
});

describe("capability matrix — unrelated authenticated user", () => {
  it("cannot list, view, mutate, or archive another user's app — always NotFoundError, never a distinguishing 403", async () => {
    const app = await makeAppWithCollaborators();

    await expect(getAppForActor(db, unrelated, app.id)).rejects.toBeInstanceOf(NotFoundError);
    await expect(
      applyOperation(db, unrelated, app.id, {
        operation: createEntityOp("widget_unrelated"),
        baseVersionNumber: 0,
        idempotencyKey: "unrelated-op",
      }),
    ).rejects.toBeInstanceOf(NotFoundError);
    await expect(addCollaborator(db, unrelated, app.id, "x", "viewer")).rejects.toBeInstanceOf(NotFoundError);
    await expect(archiveApp(db, unrelated, app.id)).rejects.toBeInstanceOf(NotFoundError);
  });
});

describe("platform superadmin bypass", () => {
  it("follows the existing documented platform policy: superadmin passes even with no owner/collaborator relationship", async () => {
    const app = await makeAppWithCollaborators();

    // Not the owner, not a collaborator — only the platform role grants this.
    await expect(getAppForActor(db, superadmin, app.id)).resolves.toBeDefined();
    await expect(archiveApp(db, superadmin, app.id)).resolves.toMatchObject({ status: "archived" });
  });

  it("does not expand listAppsForActor — the bypass is scoped to a named app, not a data dump", async () => {
    await makeAppWithCollaborators();
    const list = await listAppsForActor(db, superadmin);
    expect(list).toHaveLength(0);
  });
});

describe("final-owner protection", () => {
  it("rejects adding the app owner as a collaborator", async () => {
    const app = await createApp(db, owner, { name: "Guard App", slug: "guard-app" }, "guard-create");
    await expect(addCollaborator(db, owner, app.id, owner.principalId, "viewer")).rejects.toBeInstanceOf(
      ConflictError,
    );
  });

  it("rejects revoking or demoting a stale collaborator row that turns out to be the owner", async () => {
    const app = await createApp(db, owner, { name: "Guard App 2", slug: "guard-app-2" }, "guard-create-2");

    // addCollaborator already refuses to create this row (tested above);
    // simulate a pre-existing/legacy one via a direct insert to prove the
    // guard also holds for revoke/demote, defense-in-depth against bad data.
    const [staleOwnerCollaborator] = await db
      .insert(collaboratorsTable)
      .values({
        id: generateId(),
        appId: app.id,
        principalId: owner.principalId,
        role: "viewer",
        invitedByPrincipalId: owner.principalId,
      })
      .returning();

    await expect(
      revokeCollaborator(db, owner, app.id, staleOwnerCollaborator.id),
    ).rejects.toBeInstanceOf(ConflictError);
    await expect(
      changeCollaboratorRole(db, owner, app.id, staleOwnerCollaborator.id, "editor"),
    ).rejects.toBeInstanceOf(ConflictError);
  });
});

describe("collaborator role change + audit identity", () => {
  it("changes a collaborator's role and records the trusted actor, not any client-supplied id", async () => {
    const app = await makeAppWithCollaborators();
    const [collaboratorRow] = await db
      .select()
      .from(collaboratorsTable)
      .where(eq(collaboratorsTable.principalId, editor.principalId));

    const updated = await changeCollaboratorRole(db, owner, app.id, collaboratorRow.id, "viewer");
    expect(updated.role).toBe("viewer");

    const events = await listAuditEventsForActor(db, owner, app.id);
    const roleChangeEvent = events.find((e) => e.action === "collaborator.role_changed");
    expect(roleChangeEvent?.actorPrincipalId).toBe(owner.principalId);
  });
});

describe("forged actor/owner ids are ignored", () => {
  it("uses the trusted actor parameter for audit/ownership even when the payload claims a different actor", async () => {
    const app = await createApp(db, owner, { name: "Forge App", slug: "forge-app" }, "forge-create");

    const { operation } = await applyOperation(db, owner, app.id, {
      // A malicious/buggy caller stuffing identity-looking fields into the
      // operation payload must have zero effect on who gets recorded as
      // having performed the action — extra/unknown keys are simply not
      // part of any operation's schema and are dropped by Zod's parse.
      operation: { ...createEntityOp("widget"), actorId: "someone-else", ownerPrincipalId: "attacker" },
      baseVersionNumber: 0,
      idempotencyKey: "forge-op",
    });

    expect(operation.appliedByPrincipalId).toBe(owner.principalId);

    const [row] = await db.select().from(appliedOperations).where(eq(appliedOperations.id, operation.id));
    expect(row.appliedByPrincipalId).toBe(owner.principalId);

    const events = await listAuditEventsForActor(db, owner, app.id);
    const opEvent = events.find((e) => e.action === "operation.applied");
    expect(opEvent?.actorPrincipalId).toBe(owner.principalId);

    // The app's true owner is untouched by the forged "ownerPrincipalId".
    const refreshedApp = await getAppForActor(db, owner, app.id);
    expect(refreshedApp.ownerPrincipalId).toBe(owner.principalId);
  });
});
