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

export interface AuditEventInput {
  /** Acting user id (the admin performing the mutation). */
  userId: string;
  action: string;
  entity: "User" | "UserRole";
  entityId: string;
  changes?: Record<string, unknown>;
}

/**
 * Record an admin mutation in the audit log. Non-fatal by design: a failed
 * audit write is logged but never rolls back the mutation it describes.
 */
export async function writeAuditEvent(event: AuditEventInput): Promise<void> {
  try {
    await prisma.auditLog.create({
      data: {
        userId: event.userId,
        action: event.action,
        entity: event.entity,
        entityId: event.entityId,
        changes: (event.changes ?? undefined) as Prisma.InputJsonValue | undefined,
        ipAddress: await getClientIp(),
      },
    });
  } catch (error) {
    console.error("[admin] audit write failed:", error);
  }
}
