import { prisma } from "@asafarim/db";
import type {
  ActivityLookup,
  ActivitySection,
  ListAllOptions,
  ListAllResult,
  UserActivityAdapter,
} from "../types";

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

/** Same as RemoteActivityEntryDto, plus the platform user id who owns it — the browse endpoint has no single "the user" to key by. */
export interface RemoteListAllEntryDto extends RemoteActivityEntryDto {
  ownerUserId: string;
}

export interface RemoteListAllResponse {
  entries: RemoteListAllEntryDto[];
  nextCursor: string | null;
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
  /**
   * Path of the app's own cross-user "browse everyone's flagship content"
   * endpoint (e.g. "/api/internal/user-activity/browse"), queried with
   * `?limit=&cursor=`. Omit when the app has no such endpoint yet — the
   * resulting adapter simply has no `listAll`, same "no adapter yet"
   * principle as an app with no adapter at all (it won't appear as a
   * Platform Activity filter chip until this is added).
   */
  listAllPath?: string;
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

    ...(options.listAllPath
      ? {
          /**
           * Browses the remote app's own cross-user "flagship content"
           * endpoint, then resolves owner email/name locally — the remote
           * app only knows the opaque platform userId (it holds no copy of
           * the platform's User table), so this batch-resolves against the
           * console's own DB, same as the shared-DB adapters' listAll.
           */
          async listAll({ limit, cursor }: ListAllOptions): Promise<ListAllResult> {
            const empty: ListAllResult = { entries: [], nextCursor: null };
            const secret = process.env[secretEnvVar];
            if (!secret) return empty;

            const url = new URL(options.listAllPath!, options.baseUrl());
            url.searchParams.set("limit", String(limit));
            if (cursor) url.searchParams.set("cursor", cursor);

            const controller = new AbortController();
            const timeout = setTimeout(() => controller.abort(), timeoutMs);
            let response: Response;
            try {
              response = await fetch(url, {
                headers: { authorization: `Bearer ${secret}` },
                cache: "no-store",
                signal: controller.signal,
              });
            } catch {
              return empty;
            } finally {
              clearTimeout(timeout);
            }
            if (!response.ok) return empty;

            const body = (await response.json()) as RemoteListAllResponse;
            const owners = await prisma.user.findMany({
              where: { id: { in: [...new Set(body.entries.map((e) => e.ownerUserId))] } },
              select: { id: true, email: true, name: true },
            });
            const ownerById = new Map(owners.map((u) => [u.id, u]));

            return {
              entries: body.entries.map((entry) => {
                const owner = ownerById.get(entry.ownerUserId);
                return {
                  ...entry,
                  app: options.app,
                  createdAt: new Date(entry.createdAt),
                  updatedAt: new Date(entry.updatedAt),
                  owner: {
                    userId: entry.ownerUserId,
                    email: owner?.email ?? null,
                    name: owner?.name ?? null,
                  },
                };
              }),
              nextCursor: body.nextCursor,
            };
          },
        }
      : {}),
  };
}
