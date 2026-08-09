import { headers } from "next/headers";
import { prisma, Prisma } from "@asafarim/db";

/** Best-effort client IP from proxy headers (nginx sets x-forwarded-for). */
async function getClientIp(): Promise<string | null> {
  try {
    const headerList = await headers();
    const forwarded = headerList.get("x-forwarded-for");
    if (forwarded) return forwarded.split(",")[0]!.trim();
    return headerList.get("x-real-ip");
  } catch {
    return null;
  }
}

/** Keys whose values must never reach the audit stream. */
const SENSITIVE_KEY_PATTERN =
  /password|token|secret|code|session|hash|otp|api[-_]?key|credential/i;

/**
 * Deep-redact sensitive values before they are persisted. Applied on write
 * so redaction cannot be forgotten at render time.
 */
export function redactSensitive(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(redactSensitive);
  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>).map(([key, val]) => [
        key,
        SENSITIVE_KEY_PATTERN.test(key) ? "[redacted]" : redactSensitive(val),
      ])
    );
  }
  return value;
}

export interface AuditEventInput {
  /** Acting user id (the admin performing the mutation), if known. */
  userId: string | null;
  action: string;
  entity:
    | "User"
    | "UserRole"
    | "Role"
    | "PlatformSetting"
    | "Admin"
    | "TailscaleDevice"
    // Seed Data management. `SeedProvider` is keyed by the allowlisted
    // provider id; the other two by their control-plane row id.
    | "SeedProvider"
    | "SeedOperation"
    | "SeedValidationSchedule";
  entityId: string;
  changes?: Record<string, unknown>;
}

/**
 * Actions the Seed Data page records. Named as a union so a typo cannot
 * quietly create a new action string that history filters will never match.
 */
export type SeedAuditAction =
  | "seed.validation.requested"
  | "seed.status.requested"
  | "seed.plan.created"
  | "seed.execution.requested"
  | "seed.completed"
  | "seed.failed"
  | "seed.cancelled"
  | "seed.schedule.created"
  | "seed.schedule.updated"
  | "seed.schedule.deleted";

export interface SeedAuditEventInput {
  userId: string | null;
  action: SeedAuditAction;
  entity: "SeedProvider" | "SeedOperation" | "SeedValidationSchedule";
  entityId: string;
  changes: {
    providerId?: string;
    environment?: string;
    operation?: string;
    planChecksum?: string;
    definitionChecksum?: string;
    counts?: Record<string, number>;
    resultStatus?: string;
    bulkGroupId?: string;
    [key: string]: unknown;
  };
}

/**
 * Typed front door for seed audit events. Delegates to writeAuditEvent, so
 * the same redaction and the same non-fatal semantics apply — a failed audit
 * write never rolls back the operation it describes, and the SeedOperation
 * row records the outcome regardless.
 */
export async function writeSeedAuditEvent(event: SeedAuditEventInput): Promise<void> {
  await writeAuditEvent(event);
}

/**
 * Record an admin mutation in the audit log. Non-fatal by design: a failed
 * audit write is logged but never rolls back the mutation it describes.
 * Sensitive values in `changes` are redacted before persisting.
 */
export async function writeAuditEvent(event: AuditEventInput): Promise<void> {
  try {
    await prisma.auditLog.create({
      data: {
        userId: event.userId,
        action: event.action,
        entity: event.entity,
        entityId: event.entityId,
        changes: event.changes
          ? (redactSensitive(event.changes) as Prisma.InputJsonValue)
          : undefined,
        ipAddress: await getClientIp(),
      },
    });
  } catch (error) {
    console.error("[admin] audit write failed:", error);
  }
}
