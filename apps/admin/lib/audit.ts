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
  entity: "User" | "UserRole" | "Role" | "PlatformSetting" | "Admin";
  entityId: string;
  changes?: Record<string, unknown>;
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
