import type { ActivityLookup, ActivitySection, UserActivityAdapter } from "../types";

/** Wire shape of one entry as returned by an app's /api/internal/user-activity route (dates as ISO strings). */
export interface RemoteActivityEntryDto {
  id: string;
  type: string;
  title: string;
  status: string;
  createdAt: string;
  updatedAt: string;
  href: string | null;
  metadata: Record<string, unknown>;
}

export interface RemoteActivityResponse {
  entries: RemoteActivityEntryDto[];
  summary?: Record<string, unknown>;
}

export interface RemoteAdapterOptions {
  /** Platform app slug, matching the app registry. */
  app: string;
  /** Base URL of the app's own deployment, e.g. `process.env.NEXT_PUBLIC_APPBUILDER_URL ?? "http://localhost:3006"`. */
  baseUrl: () => string;
  /** Env var holding the shared bearer secret both sides check. Defaults to INTERNAL_API_SECRET. */
  secretEnvVar?: string;
  /** Request timeout in ms, so one slow app can't hang the whole User 360 view. Default 5000. */
  timeoutMs?: number;
}

/**
 * Builds a UserActivityAdapter that reads another app's OWN isolated
 * database indirectly, via that app's read-only, bearer-gated
 * /api/internal/user-activity route — the console never holds a second
 * app's DB credentials (issue #301's "adapters, not mega-joins" principle).
 */
export function createRemoteAdapter(options: RemoteAdapterOptions): UserActivityAdapter {
  const secretEnvVar = options.secretEnvVar ?? "INTERNAL_API_SECRET";
  const timeoutMs = options.timeoutMs ?? 5000;

  return {
    app: options.app,
    async getActivity({ userId, email }: ActivityLookup): Promise<ActivitySection> {
      const secret = process.env[secretEnvVar];
      if (!secret) {
        return {
          app: options.app,
          supported: true,
          available: false,
          error: `${secretEnvVar} is not configured`,
          entries: [],
        };
      }

      const url = new URL("/api/internal/user-activity", options.baseUrl());
      url.searchParams.set("userId", userId);
      if (email) url.searchParams.set("email", email);

      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), timeoutMs);
      let response: Response;
      try {
        response = await fetch(url, {
          headers: { authorization: `Bearer ${secret}` },
          cache: "no-store",
          signal: controller.signal,
        });
      } catch (error) {
        return {
          app: options.app,
          supported: true,
          available: false,
          error: error instanceof Error ? error.message : "Request failed",
          entries: [],
        };
      } finally {
        clearTimeout(timeout);
      }

      if (!response.ok) {
        return {
          app: options.app,
          supported: true,
          available: false,
          error: `HTTP ${response.status}`,
          entries: [],
        };
      }

      const body = (await response.json()) as RemoteActivityResponse;
      return {
        app: options.app,
        supported: true,
        available: true,
        entries: body.entries.map((entry) => ({
          ...entry,
          app: options.app,
          createdAt: new Date(entry.createdAt),
          updatedAt: new Date(entry.updatedAt),
        })),
        summary: body.summary,
      };
    },
  };
}
