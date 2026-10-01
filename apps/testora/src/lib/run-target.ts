import { z } from "zod";
import {
  TargetPolicyError,
  assertRunnableTarget,
  targetPolicyErrorBody,
  type LookupFn,
} from "@/lib/target-policy";

/**
 * Which deployment a run targets (#699). A run names a stored
 * target_environments row of its own project by `targetId`. Raw
 * `baseUrl`/`apiUrl` overrides are admin/superadmin-only — unless they are
 * exactly the URLs of one of the project's stored targets, or the project's
 * own URLs (an app with no targets yet; an environment saved in the browser
 * before targetId existed). Either way the resulting URLs must pass the
 * network policy (lib/target-policy.ts). Neither given = the fixtures' own
 * (admin-authored) URLs.
 */
export const runTargetSchema = z.object({
  targetId: z.string().min(1).optional(),
  baseUrl: z.string().url().optional(),
  apiUrl: z.string().url().optional(),
  /** Admin raw override only — a stored target carries its own Hub URL. */
  hubUrl: z.string().url().optional(),
});

export interface StoredTarget {
  id: string;
  projectId: string;
  name: string;
  baseUrl: string;
  apiUrl: string;
  hubUrl?: string | null;
}

/** A URL set already stored for a project (a target, or the project's own URLs). */
export interface StoredUrlSet {
  /** The target row's id (absent for the project's own URLs). */
  id?: string;
  baseUrl: string;
  apiUrl: string;
  hubUrl?: string | null;
}

export interface ResolvedRunTarget {
  /** The stored target the run uses (its secrets apply, #702). */
  targetId?: string;
  baseUrl?: string;
  apiUrl?: string;
  /** The Hub the target signs in through (SSO scripts follow it, #700). */
  hubUrl?: string;
  /** The stored target's name, for the run log. */
  targetName?: string;
}

export type RunTargetResult =
  | { ok: true; target: ResolvedRunTarget }
  | { ok: false; status: number; body: { error: string; code: string } };

export async function resolveRunTarget(
  body: unknown,
  context: {
    projectId: string;
    isAdmin: boolean;
    findTarget: (id: string) => Promise<StoredTarget | null | undefined>;
    /** URL pairs already stored for this project: its targets and its own URLs. */
    storedUrlPairs?: () => Promise<StoredUrlSet[]>;
    production?: boolean;
    lookup?: LookupFn;
  },
): Promise<RunTargetResult> {
  const parsed = runTargetSchema.safeParse(body ?? {});
  if (!parsed.success) {
    return {
      ok: false,
      status: 400,
      body: { error: "Target URLs must be absolute http(s) URLs.", code: "INVALID_TARGET_URL" },
    };
  }
  const { targetId, baseUrl, apiUrl, hubUrl } = parsed.data;
  const policy = { isAdmin: context.isAdmin, production: context.production, lookup: context.lookup };

  try {
    if (targetId) {
      if (baseUrl || apiUrl || hubUrl) {
        return {
          ok: false,
          status: 400,
          body: { error: "Send either targetId or raw URLs, not both.", code: "AMBIGUOUS_TARGET" },
        };
      }
      const stored = await context.findTarget(targetId);
      if (!stored || stored.projectId !== context.projectId) {
        return {
          ok: false,
          status: 404,
          body: { error: "That target doesn't exist for this app.", code: "TARGET_NOT_FOUND" },
        };
      }
      await assertRunnableTarget(stored.baseUrl, { ...policy, stored: true });
      await assertRunnableTarget(stored.apiUrl, { ...policy, stored: true });
      if (stored.hubUrl) await assertRunnableTarget(stored.hubUrl, { ...policy, stored: true });
      return {
        ok: true,
        target: {
          targetId: stored.id,
          baseUrl: stored.baseUrl,
          apiUrl: stored.apiUrl,
          ...(stored.hubUrl ? { hubUrl: stored.hubUrl } : {}),
          targetName: stored.name,
        },
      };
    }

    // Raw URLs matching a stored set count as stored, and inherit its Hub URL.
    const match =
      (baseUrl || apiUrl) && context.storedUrlPairs
        ? (await context.storedUrlPairs()).find(
            (pair) => sameUrl(pair.baseUrl, baseUrl) && sameUrl(pair.apiUrl, apiUrl),
          )
        : undefined;
    const stored = !context.isAdmin && match !== undefined;
    if (baseUrl) await assertRunnableTarget(baseUrl, { ...policy, stored });
    if (apiUrl) await assertRunnableTarget(apiUrl, { ...policy, stored });
    // A raw Hub URL is an admin override (stored: false → admin-only).
    if (hubUrl) await assertRunnableTarget(hubUrl, { ...policy, stored: false });
    const effectiveHub = hubUrl ?? match?.hubUrl ?? undefined;
    return {
      ok: true,
      target: {
        ...(match?.id ? { targetId: match.id } : {}),
        baseUrl,
        apiUrl,
        ...(effectiveHub ? { hubUrl: effectiveHub } : {}),
      },
    };
  } catch (error) {
    if (error instanceof TargetPolicyError) {
      return { ok: false, status: error.status, body: targetPolicyErrorBody(error) };
    }
    throw error;
  }
}

/** Whether a sent URL (possibly omitted) matches a stored one ("" = not set). */
function sameUrl(stored: string, sent: string | undefined): boolean {
  return (stored || "") === (sent ?? "");
}

/**
 * Validate the URLs an admin is saving on a target or project row. Empty
 * strings (a project without URLs) are allowed. Returns the error response
 * body, or null when the URLs are fine.
 */
export async function checkStoredUrls(
  urls: (string | undefined | null)[],
  options: { production?: boolean; lookup?: LookupFn } = {},
): Promise<{ status: number; body: { error: string; code: string } } | null> {
  try {
    for (const url of urls) {
      if (url) await assertRunnableTarget(url, { isAdmin: true, stored: true, ...options });
    }
    return null;
  } catch (error) {
    if (error instanceof TargetPolicyError) {
      return { status: error.status, body: targetPolicyErrorBody(error) };
    }
    throw error;
  }
}
