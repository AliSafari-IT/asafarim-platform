import { NextResponse } from "next/server";
import { loadFitContext, type FitContext } from "../../../../lib/tailoring/fit/service";

/** Shared request handling for the fit routes (#971). */

const ID = /^[A-Za-z0-9_-]{1,64}$/;

export function isId(value: unknown): value is string {
  return typeof value === "string" && ID.test(value);
}

export async function readBody(request: Request): Promise<Record<string, unknown> | null> {
  try {
    const body = await request.json();
    return body && typeof body === "object" && !Array.isArray(body) ? (body as Record<string, unknown>) : null;
  } catch {
    return null;
  }
}

/** The context for this workspace's job and profile version, or the error
 *  response to send. Another workspace's job or version is "not found". */
export async function contextOrError(
  workspaceId: string,
  targetJobId: unknown,
  profileVersionId: unknown,
): Promise<{ context: FitContext } | { response: NextResponse }> {
  if (!isId(targetJobId) || !isId(profileVersionId)) {
    return { response: NextResponse.json({ error: "targetJobId and profileVersionId are required." }, { status: 400 }) };
  }
  const loaded = await loadFitContext(workspaceId, targetJobId, profileVersionId);
  if (loaded.ok) return { context: loaded.context };
  if (loaded.error === "profile_not_confirmed") {
    return { response: NextResponse.json({ error: "Confirm your profile first.", code: "PROFILE_NOT_CONFIRMED" }, { status: 409 }) };
  }
  return {
    response: NextResponse.json(
      { error: loaded.error === "job_not_found" ? "That job has no fetched text to compare." : "Profile version not found." },
      { status: 404 },
    ),
  };
}
