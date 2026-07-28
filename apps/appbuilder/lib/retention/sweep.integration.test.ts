import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import {
  closeTestDb,
  getTestDb,
  migrateTestDb,
  resetTestDb,
} from "../db/testUtils";
import { createApp } from "../repositories/apps";
import { enqueueValidationRun } from "../repositories/validationRuns";
import { validationArtifacts, operationalEvents } from "../db/schema";
import { generateId } from "../db/ids";
import { sweepExpiredValidationArtifacts } from "./sweep";

const db = getTestDb();
const owner = { principalId: "sweep-owner", roles: [] };

beforeAll(async () => {
  await migrateTestDb();
});

beforeEach(async () => {
  await resetTestDb();
});

afterAll(async () => {
  await closeTestDb();
});

async function seedArtifact(
  appId: string,
  runId: string,
  retentionExpiresAt: Date | null
) {
  const [row] = await db
    .insert(validationArtifacts)
    .values({
      id: generateId(),
      runId,
      appId,
      kind: "screenshot",
      label: "test artifact",
      storageKey: `validation/${generateId()}.png`,
      contentType: "image/png",
      sizeBytes: 10,
      retentionExpiresAt,
    })
    .returning();
  return row;
}

describe("sweepExpiredValidationArtifacts", () => {
  it("dry run reports eligible rows without deleting anything", async () => {
    const app = await createApp(
      db,
      owner,
      { name: "Sweep App", slug: "sweep-app" },
      "sweep-key"
    );
    const run = await enqueueValidationRun(db, owner, app.id, {
      idempotencyKey: "sweep-run-1",
      requestSource: "manual",
    });

    const expired = await seedArtifact(
      app.id,
      run.id,
      new Date(Date.now() - 86_400_000)
    );
    await seedArtifact(app.id, run.id, new Date(Date.now() + 86_400_000)); // not yet expired

    const result = await sweepExpiredValidationArtifacts(db, { dryRun: true });
    expect(result).toEqual({
      category: "validation_artifacts",
      eligible: 1,
      deleted: 0,
      dryRun: true,
    });

    const stillThere = await db
      .select()
      .from(validationArtifacts)
      .where(eq(validationArtifacts.id, expired.id));
    expect(stillThere).toHaveLength(1);
  });

  it("applies the sweep, deletes only expired rows, and records an operational event", async () => {
    const app = await createApp(
      db,
      owner,
      { name: "Sweep App 2", slug: "sweep-app-2" },
      "sweep-key-2"
    );
    const run = await enqueueValidationRun(db, owner, app.id, {
      idempotencyKey: "sweep-run-2",
      requestSource: "manual",
    });

    const expired = await seedArtifact(
      app.id,
      run.id,
      new Date(Date.now() - 86_400_000)
    );
    const fresh = await seedArtifact(
      app.id,
      run.id,
      new Date(Date.now() + 86_400_000)
    );

    const result = await sweepExpiredValidationArtifacts(db, { dryRun: false });
    expect(result).toEqual({
      category: "validation_artifacts",
      eligible: 1,
      deleted: 1,
      dryRun: false,
    });

    expect(
      await db
        .select()
        .from(validationArtifacts)
        .where(eq(validationArtifacts.id, expired.id))
    ).toHaveLength(0);
    expect(
      await db
        .select()
        .from(validationArtifacts)
        .where(eq(validationArtifacts.id, fresh.id))
    ).toHaveLength(1);

    const events = await db
      .select()
      .from(operationalEvents)
      .where(eq(operationalEvents.kind, "retention.swept"));
    expect(events).toHaveLength(1);
    expect(events[0].detail).toMatchObject({
      table: "validation_artifacts",
      deleted: 1,
    });
  });

  it("is a no-op when nothing is eligible", async () => {
    const result = await sweepExpiredValidationArtifacts(db, { dryRun: false });
    expect(result).toEqual({
      category: "validation_artifacts",
      eligible: 0,
      deleted: 0,
      dryRun: false,
    });
  });
});
