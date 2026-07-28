import { desc, eq } from "drizzle-orm";
import type { Db } from "../db/client";
import { backupRuns, restoreRehearsals } from "../db/schema";
import { generateId } from "../db/ids";
import type { ReadinessStatus } from "../observability/status";

/** A backup older than this (from its own completion time) is reported "degraded" rather than "healthy" — stale, not necessarily broken. */
const STALE_AFTER_HOURS = 26;

export type BackupRunRow = typeof backupRuns.$inferSelect;
export type RestoreRehearsalRow = typeof restoreRehearsals.$inferSelect;

export interface StartBackupRunInput {
  kind: "database" | "object_storage";
  trigger: "scheduled" | "manual";
  location: string;
  triggeredByPrincipalId?: string | null;
}

export async function startBackupRun(
  db: Db,
  input: StartBackupRunInput
): Promise<BackupRunRow> {
  const [row] = await db
    .insert(backupRuns)
    .values({
      id: generateId(),
      kind: input.kind,
      status: "running",
      trigger: input.trigger,
      location: input.location,
      triggeredByPrincipalId: input.triggeredByPrincipalId ?? null,
    })
    .returning();
  return row;
}

export interface CompleteBackupRunInput {
  sizeBytes: number;
  checksum: string;
  retentionDays?: number;
  metadata?: Record<string, unknown>;
}

export async function completeBackupRun(
  db: Db,
  id: string,
  input: CompleteBackupRunInput
): Promise<BackupRunRow> {
  const retentionExpiresAt = input.retentionDays
    ? new Date(Date.now() + input.retentionDays * 86_400_000)
    : null;
  const [row] = await db
    .update(backupRuns)
    .set({
      status: "succeeded",
      completedAt: new Date(),
      sizeBytes: input.sizeBytes,
      checksum: input.checksum,
      retentionExpiresAt,
      metadata: input.metadata ?? {},
    })
    .where(eq(backupRuns.id, id))
    .returning();
  return row;
}

export async function failBackupRun(
  db: Db,
  id: string,
  failureMessage: string
): Promise<BackupRunRow> {
  const [row] = await db
    .update(backupRuns)
    .set({ status: "failed", completedAt: new Date(), failureMessage })
    .where(eq(backupRuns.id, id))
    .returning();
  return row;
}

export async function getLatestBackupRun(
  db: Db,
  kind: "database" | "object_storage" = "database"
): Promise<BackupRunRow | null> {
  const [row] = await db
    .select()
    .from(backupRuns)
    .where(eq(backupRuns.kind, kind))
    .orderBy(desc(backupRuns.startedAt))
    .limit(1);
  return row ?? null;
}

export async function listBackupRuns(
  db: Db,
  limit = 20
): Promise<BackupRunRow[]> {
  return db
    .select()
    .from(backupRuns)
    .orderBy(desc(backupRuns.startedAt))
    .limit(limit);
}

/**
 * The single "is our backup posture okay right now" verdict — honest by
 * construction: no backup ever recorded reports `"not_configured"`
 * (never `"healthy"`), a still-running backup reports `"unknown"` (its
 * outcome isn't known yet), and a completed-but-stale backup reports
 * `"degraded"` rather than being silently treated as current.
 */
export async function getLatestBackupStatus(db: Db): Promise<{
  status: ReadinessStatus;
  lastBackup: {
    kind: string;
    status: string;
    completedAt: string | null;
    ageHours: number | null;
  } | null;
}> {
  const lastBackup = await getLatestBackupRun(db, "database");
  if (!lastBackup) return { status: "not_configured", lastBackup: null };

  const ageHours = lastBackup.completedAt
    ? (Date.now() - lastBackup.completedAt.getTime()) / 3_600_000
    : null;
  const status: ReadinessStatus =
    lastBackup.status === "failed"
      ? "unhealthy"
      : lastBackup.status === "running"
        ? "unknown"
        : ageHours === null
          ? "unknown"
          : ageHours > STALE_AFTER_HOURS
            ? "degraded"
            : "healthy";

  return {
    status,
    lastBackup: {
      kind: lastBackup.kind,
      status: lastBackup.status,
      completedAt: lastBackup.completedAt
        ? lastBackup.completedAt.toISOString()
        : null,
      ageHours: ageHours === null ? null : Math.round(ageHours * 10) / 10,
    },
  };
}

export interface StartRestoreRehearsalInput {
  backupRunId: string;
  targetDescription: string;
  performedByPrincipalId?: string | null;
}

export async function startRestoreRehearsal(
  db: Db,
  input: StartRestoreRehearsalInput
): Promise<RestoreRehearsalRow> {
  const [row] = await db
    .insert(restoreRehearsals)
    .values({
      id: generateId(),
      backupRunId: input.backupRunId,
      targetDescription: input.targetDescription,
      performedByPrincipalId: input.performedByPrincipalId ?? null,
    })
    .returning();
  return row;
}

export interface CompleteRestoreRehearsalInput {
  verifiedCounts: Record<string, number>;
  findings?: Record<string, unknown>;
}

export async function completeRestoreRehearsal(
  db: Db,
  id: string,
  input: CompleteRestoreRehearsalInput
): Promise<RestoreRehearsalRow> {
  const [row] = await db
    .update(restoreRehearsals)
    .set({
      status: "succeeded",
      completedAt: new Date(),
      verifiedCounts: input.verifiedCounts,
      findings: input.findings ?? {},
    })
    .where(eq(restoreRehearsals.id, id))
    .returning();
  return row;
}

export async function failRestoreRehearsal(
  db: Db,
  id: string,
  failureMessage: string
): Promise<RestoreRehearsalRow> {
  const [row] = await db
    .update(restoreRehearsals)
    .set({ status: "failed", completedAt: new Date(), failureMessage })
    .where(eq(restoreRehearsals.id, id))
    .returning();
  return row;
}

export async function getLatestRestoreRehearsal(
  db: Db
): Promise<RestoreRehearsalRow | null> {
  const [row] = await db
    .select()
    .from(restoreRehearsals)
    .orderBy(desc(restoreRehearsals.startedAt))
    .limit(1);
  return row ?? null;
}

export async function listRestoreRehearsals(
  db: Db,
  limit = 20
): Promise<RestoreRehearsalRow[]> {
  return db
    .select()
    .from(restoreRehearsals)
    .orderBy(desc(restoreRehearsals.startedAt))
    .limit(limit);
}
