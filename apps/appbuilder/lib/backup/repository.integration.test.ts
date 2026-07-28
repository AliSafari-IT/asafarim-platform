import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import {
  closeTestDb,
  getTestDb,
  migrateTestDb,
  resetTestDb,
} from "../db/testUtils";
import {
  completeBackupRun,
  completeRestoreRehearsal,
  failBackupRun,
  failRestoreRehearsal,
  getLatestBackupStatus,
  getLatestRestoreRehearsal,
  listBackupRuns,
  startBackupRun,
  startRestoreRehearsal,
} from "./repository";

const db = getTestDb();

beforeAll(async () => {
  await migrateTestDb();
});

beforeEach(async () => {
  await resetTestDb();
});

afterAll(async () => {
  await closeTestDb();
});

describe("backup status — honest defaults", () => {
  it("reports not_configured when no backup has ever run", async () => {
    const status = await getLatestBackupStatus(db);
    expect(status).toEqual({ status: "not_configured", lastBackup: null });
  });

  it("reports unknown while a backup is still running", async () => {
    await startBackupRun(db, {
      kind: "database",
      trigger: "manual",
      location: "backups/database/test.dump",
    });
    const status = await getLatestBackupStatus(db);
    expect(status.status).toBe("unknown");
    expect(status.lastBackup?.status).toBe("running");
  });

  it("reports unhealthy when the most recent backup failed", async () => {
    const run = await startBackupRun(db, {
      kind: "database",
      trigger: "manual",
      location: "backups/database/test.dump",
    });
    await failBackupRun(db, run.id, "pg_dump exited with code 1");
    const status = await getLatestBackupStatus(db);
    expect(status.status).toBe("unhealthy");
  });

  it("reports healthy for a recently succeeded backup", async () => {
    const run = await startBackupRun(db, {
      kind: "database",
      trigger: "manual",
      location: "backups/database/test.dump",
    });
    await completeBackupRun(db, run.id, {
      sizeBytes: 1234,
      checksum: "abc123",
      retentionDays: 30,
    });
    const status = await getLatestBackupStatus(db);
    expect(status.status).toBe("healthy");
    expect(status.lastBackup?.ageHours).toBeLessThan(1);
  });

  it("ignores object_storage backups when reporting the database status (kinds are independent)", async () => {
    const objectRun = await startBackupRun(db, {
      kind: "object_storage",
      trigger: "manual",
      location: "backups/storage/test.tar",
    });
    await completeBackupRun(db, objectRun.id, {
      sizeBytes: 999,
      checksum: "def456",
    });
    const status = await getLatestBackupStatus(db);
    expect(status.status).toBe("not_configured");
  });

  it("lists backup runs most-recent-first", async () => {
    const first = await startBackupRun(db, {
      kind: "database",
      trigger: "manual",
      location: "a",
    });
    await completeBackupRun(db, first.id, { sizeBytes: 1, checksum: "a" });
    const second = await startBackupRun(db, {
      kind: "database",
      trigger: "scheduled",
      location: "b",
    });
    await completeBackupRun(db, second.id, { sizeBytes: 2, checksum: "b" });

    const runs = await listBackupRuns(db);
    expect(runs[0].id).toBe(second.id);
    expect(runs[1].id).toBe(first.id);
  });
});

describe("restore rehearsals", () => {
  it("returns null when no rehearsal has ever run", async () => {
    expect(await getLatestRestoreRehearsal(db)).toBeNull();
  });

  it("records a succeeded rehearsal with its verified counts", async () => {
    const backup = await startBackupRun(db, {
      kind: "database",
      trigger: "manual",
      location: "x",
    });
    await completeBackupRun(db, backup.id, { sizeBytes: 1, checksum: "x" });

    const rehearsal = await startRestoreRehearsal(db, {
      backupRunId: backup.id,
      targetDescription: "scratch db (non-production)",
    });
    const completed = await completeRestoreRehearsal(db, rehearsal.id, {
      verifiedCounts: { apps: 3, specifications: 3 },
      findings: { tablesVerified: 2 },
    });

    expect(completed.status).toBe("succeeded");
    const latest = await getLatestRestoreRehearsal(db);
    expect(latest?.id).toBe(rehearsal.id);
    expect(latest?.verifiedCounts).toEqual({ apps: 3, specifications: 3 });
  });

  it("records a failed rehearsal with its failure message", async () => {
    const backup = await startBackupRun(db, {
      kind: "database",
      trigger: "manual",
      location: "x",
    });
    await completeBackupRun(db, backup.id, { sizeBytes: 1, checksum: "x" });
    const rehearsal = await startRestoreRehearsal(db, {
      backupRunId: backup.id,
      targetDescription: "scratch db",
    });

    const failed = await failRestoreRehearsal(
      db,
      rehearsal.id,
      "pg_restore exited with code 1"
    );
    expect(failed.status).toBe("failed");
    expect(failed.failureMessage).toContain("pg_restore");
  });
});
