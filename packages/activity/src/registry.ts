import { runAdapter } from "./run-adapter";
import type { ActivityLookup, ActivitySection, UserActivityAdapter } from "./types";
import { timelineaiActivityAdapter } from "./adapters/timelineai";
import { viontoActivityAdapter } from "./adapters/vionto";

/** Every wired-up adapter, keyed by app slug. Apps without an entry here render as "no adapter yet". */
export const activityAdapters: Record<string, UserActivityAdapter> = {
  vionto: viontoActivityAdapter,
  timelineai: timelineaiActivityAdapter,
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
