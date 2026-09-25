import { timingSafeEqual } from "node:crypto";
import { isProjectViewable, isViewerAuthenticated } from "@/lib/app-access";

/**
 * Shared access gate for the cross-app run-artifact endpoints (#258 / #259).
 * A locked private app's data is withheld unless the caller presents the
 * machine-to-machine service token, so TasksAI can read without a user session.
 */
export function hasBundleServiceToken(request: Request): boolean {
  const expected = process.env.TESTORA_BUNDLE_READ_TOKEN;
  if (!expected) return false;
  const header = request.headers.get("authorization") ?? "";
  const match = /^Bearer\s+(.+)$/i.exec(header.trim());
  if (!match?.[1]) return false;
  const got = Buffer.from(match[1]);
  const want = Buffer.from(expected);
  return got.length === want.length && timingSafeEqual(got, want);
}

/** Whether this request may read the artifacts of a result in `projectId`. */
export async function canReadResultArtifacts(
  request: Request,
  projectId: string | null,
): Promise<boolean> {
  if (hasBundleServiceToken(request)) return true;
  // These routes bypass the proxy's session gate (so TasksAI's token can
  // reach them), which means the "signed in" rule has to be enforced here:
  // results are for signed-in platform users only, public app or not.
  if (!(await isViewerAuthenticated())) return false;
  return isProjectViewable(projectId);
}
