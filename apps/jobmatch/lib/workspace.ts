import "server-only";
import { getSession } from "@asafarim/auth";
import { getJobmatchDb } from "./db/client";
import type { Prisma } from "./db/generated";
import { logError } from "./observability/logger";

/**
 * Workspace resolution — the app's single authorization boundary in M1.
 *
 * Every JobMatch row that will ever describe a candidate hangs off a
 * Workspace, and a Workspace is reachable only through the opaque platform
 * user id on the current session. No route takes a workspace id from the
 * client, which is what makes IDOR structurally unavailable here rather
 * than something each future handler has to remember to check.
 */

export interface WorkspaceRef {
  id: string;
  createdAt: Date;
}

/** The signed-in user's workspace, created on first visit. */
export async function getOrCreateWorkspace(platformUserId: string): Promise<WorkspaceRef> {
  const db = getJobmatchDb();
  const existing = await db.workspace.findUnique({
    where: { platformUserId },
    select: { id: true, createdAt: true },
  });
  if (existing) return existing;

  const created = await db.workspace.create({
    data: { platformUserId },
    select: { id: true, createdAt: true },
  });

  await recordAuditEvent(created.id, "workspace.created");
  return created;
}

/**
 * The current viewer's workspace, or null when nobody is signed in or the
 * platform account has been deactivated. Deactivation is checked here and
 * not only in the proxy: a JWT stays valid until it expires, so an account
 * disabled mid-session must lose access at the data boundary too.
 */
export async function getCurrentWorkspace(): Promise<WorkspaceRef | null> {
  const session = await getSession();
  const userId = session?.user?.id;
  if (!userId || session.user.isActive === false) return null;

  try {
    return await getOrCreateWorkspace(userId);
  } catch (error) {
    // A database outage must not render as "you are signed out" — the page
    // shows an error state instead, and the cause lands in the logs.
    logError("workspace.resolve.failed", error);
    throw error;
  }
}

/** Append-only audit write. Metadata is redacted by the audit helper. */
export async function recordAuditEvent(
  workspaceId: string | null,
  action: string,
  metadata?: Record<string, unknown>,
): Promise<void> {
  const { redact } = await import("./observability/redact");
  try {
    await getJobmatchDb().auditEvent.create({
      data: {
        workspaceId,
        action,
        metadata: metadata ? (redact(metadata) as Prisma.InputJsonValue) : undefined,
      },
    });
  } catch (error) {
    // Audit writes must never fail a user action in M1; the miss is logged
    // so it is visible. Hard-failing on audit becomes a decision of its own
    // when data-rights workflows land in JM-023.
    logError("audit.write.failed", error, { action });
  }
}
