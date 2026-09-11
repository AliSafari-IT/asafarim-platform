import type { ActivityLookup, ActivitySection, UserActivityAdapter } from "./types";

/**
 * Runs an adapter and converts a thrown error into `available: false` so a
 * single app's DB outage degrades gracefully instead of failing the whole
 * User 360 view. Adapters should still prefer to catch their own errors and
 * return a section directly — this is the last line of defense.
 */
export async function runAdapter(
  adapter: UserActivityAdapter,
  lookup: ActivityLookup
): Promise<ActivitySection> {
  try {
    return await adapter.getActivity(lookup);
  } catch (error) {
    return {
      app: adapter.app,
      supported: true,
      available: false,
      error: error instanceof Error ? error.message : "Unknown error",
      entries: [],
    };
  }
}
