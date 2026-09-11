// Pulls in next-auth's Session/User module augmentation (session.user.roles)
// that packages/auth/src/roles.ts depends on but doesn't import itself.
import "@asafarim/auth/types";
import { PLATFORM_APPS } from "@asafarim/auth/apps";
import { activityAdapters, getAllUserActivity } from "./registry";
import type { ActivityEntry, ActivityLookup, ActivitySection } from "./types";

export interface ActivityFilters {
  app?: string;
  type?: string;
  from?: string;
  to?: string;
}

/**
 * Every platform app that has (or ever had) activity data, one section
 * each — apps with no registered adapter come back `supported: false` so
 * the User 360 explorer can render "no adapter yet" instead of a silent gap.
 */
export async function loadUserActivity(lookup: ActivityLookup): Promise<ActivitySection[]> {
  const live = await getAllUserActivity(lookup);
  const liveByApp = new Map(live.map((section) => [section.app, section]));

  return PLATFORM_APPS.filter((app) => app.key in activityAdapters || liveByApp.has(app.key)).map(
    (app) =>
      liveByApp.get(app.key) ?? {
        app: app.key,
        supported: false,
        available: false,
        entries: [],
      }
  );
}

/** Distinct entry types across every section, for a type filter's options. */
export function collectEntryTypes(sections: ActivitySection[]): string[] {
  const types = new Set<string>();
  for (const section of sections) {
    for (const entry of section.entries) types.add(entry.type);
  }
  return [...types].sort();
}

export function filterEntries(sections: ActivitySection[], filters: ActivityFilters): ActivityEntry[] {
  const from = filters.from ? new Date(filters.from) : null;
  // Inclusive end-of-day so a "to" date filter matches entries made that day.
  const to = filters.to ? new Date(`${filters.to}T23:59:59.999Z`) : null;

  const merged = sections
    .filter((section) => !filters.app || section.app === filters.app)
    .flatMap((section) => section.entries)
    .filter((entry) => !filters.type || entry.type === filters.type)
    .filter((entry) => !from || entry.createdAt >= from)
    .filter((entry) => !to || entry.createdAt <= to);

  return merged.sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());
}

export function formatBytes(bytes: number | null | undefined): string | null {
  if (bytes == null) return null;
  if (bytes < 1024) return `${bytes} B`;
  const units = ["KB", "MB", "GB"];
  let value = bytes / 1024;
  let unit = 0;
  while (value >= 1024 && unit < units.length - 1) {
    value /= 1024;
    unit += 1;
  }
  return `${value.toFixed(1)} ${units[unit]}`;
}

export function formatDuration(seconds: number | null | undefined): string | null {
  if (seconds == null) return null;
  const mins = Math.floor(seconds / 60);
  const secs = seconds % 60;
  return mins > 0 ? `${mins}m ${secs}s` : `${secs}s`;
}
