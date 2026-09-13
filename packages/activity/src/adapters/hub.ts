import { prisma } from "@asafarim/db";
import type { ActivityEntry, ActivityLookup, ActivitySection, UserActivityAdapter } from "../types";

function hubUrl(): string {
  return process.env.NEXT_PUBLIC_HUB_URL ?? "http://localhost:3001";
}

/**
 * Hub adapter. Two entry types, both deliberately narrow rather than
 * fabricated:
 *
 * - "sign_in" entries read back the AuditLog rows packages/auth's
 *   recordSignInEvent now writes on every successful sign-in. This is the
 *   one thing Hub's JWT session strategy genuinely could not answer before
 *   that existed — Prisma's Session table is never populated (no DB
 *   session adapter), so without this row there is no record anywhere
 *   that a sign-in happened at all.
 * - One "profile" entry: the account's *current* snapshot (name, email,
 *   status, created/updated), not an edit history. `User.updatedAt` only
 *   ever reflects the single most recent change with no record of what
 *   changed or when previous edits happened — presenting a snapshot as a
 *   history would be dishonest, so this reports exactly what it is: where
 *   the account stands today, labelled as a snapshot in its own metadata.
 *
 * No storage-usage summary: no storage/usage model exists for Hub (unlike
 * Vionto's ViontoUsageMetric) and none is planned here — omitted per
 * "graceful degradation" rather than invented.
 */
export const hubActivityAdapter: UserActivityAdapter = {
  app: "hub",

  async getActivity({ userId }: ActivityLookup): Promise<ActivitySection> {
    const base = hubUrl();

    const [user, signIns] = await Promise.all([
      prisma.user.findUnique({
        where: { id: userId },
        select: {
          id: true,
          name: true,
          email: true,
          username: true,
          isActive: true,
          createdAt: true,
          updatedAt: true,
        },
      }),
      prisma.auditLog.findMany({
        where: { userId, entity: "auth", action: "sign_in" },
        orderBy: { createdAt: "desc" },
        take: 50,
        select: { id: true, changes: true, createdAt: true, ipAddress: true },
      }),
    ]);

    const entries: ActivityEntry[] = [];

    if (user) {
      entries.push({
        id: user.id,
        app: "hub",
        type: "profile",
        title: user.name ?? user.email,
        status: user.isActive ? "active" : "deactivated",
        createdAt: user.createdAt,
        updatedAt: user.updatedAt,
        href: `${base}/profile`,
        metadata: {
          snapshot: true, // a point-in-time view, not an edit history — see file header
          email: user.email,
          username: user.username,
        },
      });
    }

    for (const event of signIns) {
      const changes = (event.changes as { provider?: string; device?: unknown } | null) ?? {};
      entries.push({
        id: event.id,
        app: "hub",
        type: "sign_in",
        title: `Signed in${changes.provider ? ` via ${changes.provider}` : ""}`,
        status: "completed",
        createdAt: event.createdAt,
        updatedAt: event.createdAt,
        href: null,
        // device is null (not "not recorded" vs "recorded as none" — see
        // packages/auth's parseUserAgent) for sign-ins before issue #349's
        // device-context capture existed, or an unparseable user-agent.
        metadata: {
          provider: changes.provider ?? "credentials",
          device: changes.device ?? null,
          ipAddress: event.ipAddress ?? null,
        },
      });
    }

    return {
      app: "hub",
      supported: true,
      available: true,
      entries,
    };
  },
};
