import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import { createApp } from "./apps";
import { applyOperation } from "./operations";
import { restoreVersion, undoLastOperation } from "./versions";
import { listVersionsForActor, getVersionForActor, compareVersionsForActor } from "./specifications";
import { closeTestDb, getTestDb, migrateTestDb, resetTestDb } from "../db/testUtils";
import { specificationVersions, appliedOperations } from "../db/schema";
import {
  ConflictError,
  DestructiveConfirmationRequiredError,
  NotFoundError,
  OperationValidationError,
  RestoreRequiredError,
  StaleVersionError,
} from "../errors";

const db = getTestDb();
const owner = { principalId: "spec-owner", roles: [] };
const unrelated = { principalId: "spec-unrelated", roles: [] };

beforeAll(async () => {
  await migrateTestDb();
});

beforeEach(async () => {
  await resetTestDb();
});

afterAll(async () => {
  await closeTestDb();
});

function createEntityOp(id: string) {
  return { opVersion: "1.0.0", type: "CREATE_ENTITY", entity: { id, machineName: id, name: id } };
}

// createApp (M05) now atomically materializes version 1 as the empty base
// specification — every app's timeline starts at version 1, not version 0.
// So every test below is baseline-shifted by one: the first applyOperation
// call is based on version 1 (producing version 2), not version 0->1.
async function makeApp() {
  return createApp(db, owner, { name: "Spec Engine App", slug: `spec-engine-${Math.random().toString(36).slice(2)}` }, `create-${Math.random()}`);
}

describe("applyOperation — transactional persistence", () => {
  it("creates an immutable version, an append-only operation record, and an audit event atomically", async () => {
    const app = await makeApp();
    const { operation, version } = await applyOperation(db, owner, app.id, {
      operation: createEntityOp("widget"),
      baseVersionNumber: 1,
      idempotencyKey: "k1",
    });

    expect(version?.versionNumber).toBe(2);
    expect(operation.resultingVersionId).toBe(version?.id);
    expect(operation.status).toBe("applied");

    const versions = await listVersionsForActor(db, owner, app.id);
    expect(versions).toHaveLength(2); // version 1 (empty base) + version 2 (widget)
    expect((versions[1].payload as any).entities.some((e: any) => e.id === "widget")).toBe(true);
  });
});

describe("optimistic concurrency", () => {
  it("rejects a stale base version, preserving the winning edit and never applying the losing one", async () => {
    const app = await makeApp();
    await applyOperation(db, owner, app.id, { operation: createEntityOp("first"), baseVersionNumber: 1, idempotencyKey: "k-a" });

    await expect(
      applyOperation(db, owner, app.id, { operation: createEntityOp("second"), baseVersionNumber: 1, idempotencyKey: "k-b" }),
    ).rejects.toBeInstanceOf(StaleVersionError);

    const versions = await listVersionsForActor(db, owner, app.id);
    expect(versions).toHaveLength(2); // base + the winning write only
    expect((versions[1].payload as any).entities.map((e: any) => e.id)).toEqual(["first"]);
  });

  it("under real concurrent requests, exactly one of two racing writers wins", async () => {
    const app = await makeApp();

    const results = await Promise.allSettled([
      applyOperation(db, owner, app.id, { operation: createEntityOp("race_a"), baseVersionNumber: 1, idempotencyKey: "race-a" }),
      applyOperation(db, owner, app.id, { operation: createEntityOp("race_b"), baseVersionNumber: 1, idempotencyKey: "race-b" }),
    ]);

    const fulfilled = results.filter((r) => r.status === "fulfilled");
    const rejected = results.filter((r) => r.status === "rejected");
    expect(fulfilled).toHaveLength(1);
    expect(rejected).toHaveLength(1);
    expect((rejected[0] as PromiseRejectedResult).reason).toBeInstanceOf(StaleVersionError);

    const versions = await listVersionsForActor(db, owner, app.id);
    expect(versions).toHaveLength(2); // base + no duplicate version from the race
  });
});

describe("idempotency", () => {
  it("replays the same result for a repeated key + identical payload — no duplicate rows", async () => {
    const app = await makeApp();
    const input = { operation: createEntityOp("widget"), baseVersionNumber: 1, idempotencyKey: "same-key" };

    const first = await applyOperation(db, owner, app.id, input);
    const second = await applyOperation(db, owner, app.id, input);

    expect(second.operation.id).toBe(first.operation.id);
    expect(second.version?.id).toBe(first.version?.id);

    const versionRows = await db.select().from(specificationVersions).where(eq(specificationVersions.appId, app.id));
    const operationRows = await db.select().from(appliedOperations).where(eq(appliedOperations.appId, app.id));
    expect(versionRows).toHaveLength(2); // base + one applied op
    expect(operationRows).toHaveLength(1);
  });

  it("rejects the same key reused with a different payload, without creating a second version", async () => {
    const app = await makeApp();
    await applyOperation(db, owner, app.id, { operation: createEntityOp("widget"), baseVersionNumber: 1, idempotencyKey: "conflict-key" });

    await expect(
      applyOperation(db, owner, app.id, { operation: createEntityOp("other"), baseVersionNumber: 1, idempotencyKey: "conflict-key" }),
    ).rejects.toBeInstanceOf(ConflictError);

    const versionRows = await db.select().from(specificationVersions).where(eq(specificationVersions.appId, app.id));
    expect(versionRows).toHaveLength(2); // base + the one that landed
  });
});

describe("transaction rollback on validation failure", () => {
  it("leaves no partial version/operation row when the resulting spec fails validation", async () => {
    const app = await makeApp();

    await expect(
      applyOperation(db, owner, app.id, {
        operation: {
          opVersion: "1.0.0",
          type: "ADD_FIELD",
          entityId: "does_not_exist",
          field: { id: "f1", machineName: "f1", name: "F1", type: "text", required: false, unique: false, archived: false },
        },
        baseVersionNumber: 1,
        idempotencyKey: "bad-op",
      }),
    ).rejects.toBeInstanceOf(Error);

    const versionRows = await db.select().from(specificationVersions).where(eq(specificationVersions.appId, app.id));
    const operationRows = await db.select().from(appliedOperations).where(eq(appliedOperations.appId, app.id));
    expect(versionRows).toHaveLength(1); // only the base version created at app creation
    expect(operationRows).toHaveLength(0);
  });

  it("rejects a structurally invalid operation payload (OperationValidationError) with no persisted state", async () => {
    const app = await makeApp();
    await applyOperation(db, owner, app.id, { operation: createEntityOp("existing"), baseVersionNumber: 1, idempotencyKey: "k1" });

    await expect(
      applyOperation(db, owner, app.id, {
        operation: { opVersion: "1.0.0", type: "CREATE_ENTITY", entity: { id: "existing", machineName: "existing", name: "Dup" } },
        baseVersionNumber: 2,
        idempotencyKey: "k2",
      }),
    ).rejects.toBeInstanceOf(OperationValidationError);

    const versionRows = await db.select().from(specificationVersions).where(eq(specificationVersions.appId, app.id));
    expect(versionRows).toHaveLength(2); // base + only the first, successful one
  });
});

describe("destructive confirmation", () => {
  it("rejects a destructive operation without confirmDestructive and persists nothing", async () => {
    const app = await makeApp();
    await applyOperation(db, owner, app.id, { operation: createEntityOp("widget"), baseVersionNumber: 1, idempotencyKey: "k1" });

    await expect(
      applyOperation(db, owner, app.id, {
        operation: { opVersion: "1.0.0", type: "ARCHIVE_ENTITY", entityId: "widget" },
        baseVersionNumber: 2,
        idempotencyKey: "k2",
      }),
    ).rejects.toBeInstanceOf(DestructiveConfirmationRequiredError);

    const versionRows = await db.select().from(specificationVersions).where(eq(specificationVersions.appId, app.id));
    expect(versionRows).toHaveLength(2);
  });

  it("applies the same destructive operation once confirmed", async () => {
    const app = await makeApp();
    await applyOperation(db, owner, app.id, { operation: createEntityOp("widget"), baseVersionNumber: 1, idempotencyKey: "k1" });

    const { version } = await applyOperation(db, owner, app.id, {
      operation: { opVersion: "1.0.0", type: "ARCHIVE_ENTITY", entityId: "widget" },
      baseVersionNumber: 2,
      idempotencyKey: "k2",
      confirmDestructive: true,
    });

    expect((version!.payload as any).entities.find((e: any) => e.id === "widget").archived).toBe(true);
  });
});

describe("restore as a new version", () => {
  it("restores an earlier version's payload as a brand-new version, without touching history", async () => {
    const app = await makeApp();
    await applyOperation(db, owner, app.id, { operation: createEntityOp("v1_entity"), baseVersionNumber: 1, idempotencyKey: "k1" });
    await applyOperation(db, owner, app.id, { operation: createEntityOp("v2_entity"), baseVersionNumber: 2, idempotencyKey: "k2" });

    const v2Before = await getVersionForActor(db, owner, app.id, 2);

    const { version: v4 } = await restoreVersion(db, owner, app.id, {
      targetVersionNumber: 2,
      baseVersionNumber: 3,
      idempotencyKey: "restore-1",
    });

    expect(v4.versionNumber).toBe(4);
    expect((v4.payload as any).entities.map((e: any) => e.id)).toEqual(["v1_entity"]);

    // History is untouched.
    const v2After = await getVersionForActor(db, owner, app.id, 2);
    expect(v2After.checksum).toBe(v2Before.checksum);
    const v3 = await getVersionForActor(db, owner, app.id, 3);
    expect((v3.payload as any).entities.map((e: any) => e.id)).toEqual(["v1_entity", "v2_entity"]);
  });

  it("rejects a stale restore request", async () => {
    const app = await makeApp();
    await applyOperation(db, owner, app.id, { operation: createEntityOp("v1_entity"), baseVersionNumber: 1, idempotencyKey: "k1" });

    await expect(
      restoreVersion(db, owner, app.id, { targetVersionNumber: 2, baseVersionNumber: 1, idempotencyKey: "restore-stale" }),
    ).rejects.toBeInstanceOf(StaleVersionError);
  });
});

describe("safe undo via inverse operation", () => {
  it("undoes a CREATE_ENTITY by archiving the entity it created", async () => {
    const app = await makeApp();
    await applyOperation(db, owner, app.id, { operation: createEntityOp("undoable"), baseVersionNumber: 1, idempotencyKey: "k1" });

    const { version } = await undoLastOperation(db, owner, app.id, { baseVersionNumber: 2, idempotencyKey: "undo-1" });

    expect(version.versionNumber).toBe(3);
    expect((version.payload as any).entities.find((e: any) => e.id === "undoable").archived).toBe(true);
  });

  it("returns RestoreRequiredError when the last operation has no safe inverse", async () => {
    const app = await makeApp();
    await applyOperation(db, owner, app.id, { operation: createEntityOp("permanent"), baseVersionNumber: 1, idempotencyKey: "k1" });
    await applyOperation(db, owner, app.id, {
      operation: { opVersion: "1.0.0", type: "ARCHIVE_ENTITY", entityId: "permanent" },
      baseVersionNumber: 2,
      idempotencyKey: "k2",
      confirmDestructive: true,
    });

    await expect(
      undoLastOperation(db, owner, app.id, { baseVersionNumber: 3, idempotencyKey: "undo-2" }),
    ).rejects.toBeInstanceOf(RestoreRequiredError);
  });
});

describe("compare (diff)", () => {
  it("reports the entity added between two versions", async () => {
    const app = await makeApp();
    await applyOperation(db, owner, app.id, { operation: createEntityOp("v1_entity"), baseVersionNumber: 1, idempotencyKey: "k1" });
    await applyOperation(db, owner, app.id, { operation: createEntityOp("v2_entity"), baseVersionNumber: 2, idempotencyKey: "k2" });

    const diff = await compareVersionsForActor(db, owner, app.id, 2, 3);
    expect(diff.entries).toContainEqual(expect.objectContaining({ path: ["entities", "v2_entity"], kind: "added" }));
  });
});

describe("released-version immutability", () => {
  it("never changes an earlier version's checksum as later operations are applied", async () => {
    const app = await makeApp();
    await applyOperation(db, owner, app.id, { operation: createEntityOp("v1_entity"), baseVersionNumber: 1, idempotencyKey: "k1" });
    const v2 = await getVersionForActor(db, owner, app.id, 2);

    await applyOperation(db, owner, app.id, { operation: createEntityOp("v2_entity"), baseVersionNumber: 2, idempotencyKey: "k2" });
    await applyOperation(db, owner, app.id, { operation: createEntityOp("v3_entity"), baseVersionNumber: 3, idempotencyKey: "k3" });

    const v2Again = await getVersionForActor(db, owner, app.id, 2);
    expect(v2Again.checksum).toBe(v2.checksum);
    expect(v2Again.payload).toEqual(v2.payload);
  });
});

describe("authorization on version history", () => {
  it("denies an unrelated actor access to version history (NotFoundError)", async () => {
    const app = await makeApp();
    await applyOperation(db, owner, app.id, { operation: createEntityOp("widget"), baseVersionNumber: 1, idempotencyKey: "k1" });

    await expect(listVersionsForActor(db, unrelated, app.id)).rejects.toBeInstanceOf(NotFoundError);
  });
});
