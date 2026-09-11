import { runAdapter } from "./run-adapter";
import type {
  ActivityLookup,
  ActivitySection,
  ListAllResult,
  PlatformActivityEntry,
  UserActivityAdapter,
} from "./types";
import { timelineaiActivityAdapter } from "./adapters/timelineai";
import { viontoActivityAdapter } from "./adapters/vionto";
import { edumatchActivityAdapter } from "./adapters/edumatch";
import { createRemoteAdapter } from "./adapters/remote";

function envUrl(name: string, fallback: string): string {
  return process.env[name] ?? fallback;
}

// Apps with their own isolated database (AppBuilder, Testora, JobMatch,
// TasksAI — see docs/architecture.md "Database Strategy") are read via each
// app's own read-only, bearer-gated /api/internal/user-activity route
// rather than a direct DB connection, so the console never holds a second
// app's DB credentials.
const appbuilderActivityAdapter = createRemoteAdapter({
  app: "appbuilder",
  baseUrl: () => envUrl("NEXT_PUBLIC_APPBUILDER_URL", "http://localhost:3006"),
});
const testoraActivityAdapter = createRemoteAdapter({
  app: "testora",
  baseUrl: () => envUrl("NEXT_PUBLIC_TESTORA_URL", "http://localhost:3005"),
});
const jobmatchActivityAdapter = createRemoteAdapter({
  app: "jobmatch",
  baseUrl: () => envUrl("NEXT_PUBLIC_JOBMATCH_URL", "http://localhost:3012"),
});
const tasksaiActivityAdapter = createRemoteAdapter({
  app: "tasksai",
  baseUrl: () => envUrl("NEXT_PUBLIC_TASKSAI_URL", "http://localhost:3013"),
});

/** Every wired-up adapter, keyed by app slug. Apps without an entry here render as "no adapter yet". */
export const activityAdapters: Record<string, UserActivityAdapter> = {
  vionto: viontoActivityAdapter,
  timelineai: timelineaiActivityAdapter,
  edumatch: edumatchActivityAdapter,
  appbuilder: appbuilderActivityAdapter,
  testora: testoraActivityAdapter,
  jobmatch: jobmatchActivityAdapter,
  tasksai: tasksaiActivityAdapter,
  // Hub deliberately has no adapter: its checklist items (sign-in events,
  // profile-edit history, storage usage) have no backing data. Auth uses
  // the JWT session strategy with no DB adapter, so Prisma's `Session`
  // table is never populated — using it would silently show "0 sign-ins"
  // instead of the true "not tracked". `User.updatedAt` is a snapshot, not
  // an edit history, and no storage-usage model exists for Hub. Per the
  // issue's "no silent gaps" acceptance criterion, the honest placeholder
  // is "no adapter yet" (rendered by the User 360 page) rather than an
  // adapter that fabricates data these models don't have.
};

/**
 * Runs every registered adapter for one user and returns a section per app,
 * each independently degraded on failure so one app's outage never blanks
 * the rest of the User 360 view.
 */
export async function getAllUserActivity(lookup: ActivityLookup): Promise<ActivitySection[]> {
  return Promise.all(
    Object.values(activityAdapters).map((adapter) => runAdapter(adapter, lookup))
  );
}

/** Apps that support the platform-wide browse view (only those implementing `listAll`). */
export function getPlatformActivityApps(): string[] {
  return Object.values(activityAdapters)
    .filter((adapter) => typeof adapter.listAll === "function")
    .map((adapter) => adapter.app);
}

export interface PlatformActivityOptions {
  limit: number;
  /** Opaque cursor from a previous call's nextCursor — omit for the first page. */
  cursor?: string | null;
  /** Restrict to one app; omit to merge every app that supports listAll. */
  app?: string;
}

/**
 * The superadmin platform-activity browse view: newest-first content across
 * every user, merged across every adapter that implements `listAll` (an app
 * without one — most of them, today — simply doesn't appear, same "no
 * adapter yet" principle as the per-user User 360 explorer).
 *
 * Pagination note: filtered to a single `app`, this is exact (that
 * adapter's own keyset cursor). Merged across apps, each page fetches up to
 * `limit` items from EVERY app and re-sorts, so on a page boundary an app
 * with a slower trickle of new items can occasionally resurface an entry
 * already seen on a previous page. Acceptable for an admin browse tool;
 * revisit with a real merged keyset if this needs to be exact.
 */
export async function listPlatformActivity(
  options: PlatformActivityOptions
): Promise<ListAllResult> {
  const cursors: Record<string, string | null> = options.cursor
    ? (JSON.parse(options.cursor) as Record<string, string | null>)
    : {};

  const adapters = Object.values(activityAdapters).filter(
    (adapter): adapter is UserActivityAdapter & { listAll: NonNullable<UserActivityAdapter["listAll"]> } =>
      typeof adapter.listAll === "function" && (!options.app || adapter.app === options.app)
  );

  const perApp = await Promise.all(
    adapters.map(async (adapter) => {
      try {
        return { app: adapter.app, result: await adapter.listAll({ limit: options.limit, cursor: cursors[adapter.app] }) };
      } catch {
        // One app's outage never blanks the rest of the merged feed.
        return { app: adapter.app, result: { entries: [], nextCursor: null } as ListAllResult };
      }
    })
  );

  const merged: PlatformActivityEntry[] = perApp
    .flatMap((r) => r.result.entries)
    .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime())
    .slice(0, options.limit);

  const nextCursors: Record<string, string | null> = {};
  for (const { app, result } of perApp) {
    if (result.nextCursor) nextCursors[app] = result.nextCursor;
  }
  const hasMore = Object.keys(nextCursors).length > 0;

  return {
    entries: merged,
    nextCursor: hasMore ? JSON.stringify(nextCursors) : null,
  };
}
