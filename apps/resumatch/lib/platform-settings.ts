import { createSettingsClient } from "@asafarim/settings-client";

/**
 * Admin-console overrides for ResuMatch's operational knobs, read over
 * Admin's internal settings API (ResuMatch runs on its own isolated
 * database, so it can't query PlatformSetting in-process).
 *
 * Every read takes the current env-derived value as its fallback, so
 * ResuMatch behaves exactly as before until an admin sets an override —
 * and falls back to it again if the settings API is unreachable.
 */
const client = createSettingsClient({
  baseUrl: process.env.NEXT_PUBLIC_ADMIN_URL ?? "http://localhost:3003",
  secret: process.env.INTERNAL_API_SECRET,
  scope: "resumatch",
  onError: (error) =>
    console.warn(
      "[resumatch] platform settings unavailable, using env defaults:",
      error instanceof Error ? error.message : error,
    ),
});

export const getPlatformSetting = client.getSetting;
