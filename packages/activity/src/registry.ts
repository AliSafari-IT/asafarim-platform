import { runAdapter } from "./run-adapter";
import type { ActivityLookup, ActivitySection, UserActivityAdapter } from "./types";
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
