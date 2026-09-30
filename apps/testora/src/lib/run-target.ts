import { z } from "zod";
import {
  TargetPolicyError,
  assertRunnableTarget,
  targetPolicyErrorBody,
  type LookupFn,
} from "@/lib/target-policy";

/**
 * Which deployment a run targets (#699). A run names a stored
 * target_environments row of its own project by `targetId`; raw
 * `baseUrl`/`apiUrl` overrides are admin/superadmin-only. Either way the
 * resulting URLs must pass the network policy (lib/target-policy.ts).
 * Neither given = the fixtures' own (admin-authored) URLs.
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

    if (baseUrl) await assertRunnableTarget(baseUrl, { ...policy, stored: false });
    if (apiUrl) await assertRunnableTarget(apiUrl, { ...policy, stored: false });
    return { ok: true, target: { baseUrl, apiUrl } };
  } catch (error) {
    if (error instanceof TargetPolicyError) {
      return { ok: false, status: error.status, body: targetPolicyErrorBody(error) };
    }
    throw error;
  }
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
