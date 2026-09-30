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
});

export interface StoredTarget {
  id: string;
  projectId: string;
  name: string;
  baseUrl: string;
  apiUrl: string;
}

export interface ResolvedRunTarget {
  baseUrl?: string;
  apiUrl?: string;
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
    storedUrlPairs?: () => Promise<{ baseUrl: string; apiUrl: string }[]>;
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
  const { targetId, baseUrl, apiUrl } = parsed.data;
  const policy = { isAdmin: context.isAdmin, production: context.production, lookup: context.lookup };

  try {
    if (targetId) {
      if (baseUrl || apiUrl) {
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
      return {
        ok: true,
        target: { baseUrl: stored.baseUrl, apiUrl: stored.apiUrl, targetName: stored.name },
      };
    }

    const stored =
      !context.isAdmin && (baseUrl || apiUrl) && context.storedUrlPairs
        ? (await context.storedUrlPairs()).some(
            (pair) => sameUrl(pair.baseUrl, baseUrl) && sameUrl(pair.apiUrl, apiUrl),
          )
        : false;
    if (baseUrl) await assertRunnableTarget(baseUrl, { ...policy, stored });
    if (apiUrl) await assertRunnableTarget(apiUrl, { ...policy, stored });
    return { ok: true, target: { baseUrl, apiUrl } };
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
