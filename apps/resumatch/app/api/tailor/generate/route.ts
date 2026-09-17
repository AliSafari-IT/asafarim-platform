import { NextResponse } from "next/server";
import { logError } from "../../../../lib/observability/logger";
import { QuotaExceededError } from "../../../../lib/tailoring/ai/quota";
import { generateTailoredResume } from "../../../../lib/tailoring/ai/generate";
import { getCurrentWorkspace } from "../../../../lib/workspace";

export const dynamic = "force-dynamic";

/**
 * Generate a tailored resume for a confirmed profile version against a
 * fetched target job. Always produces a new `TailoredResume` row — see
 * lib/tailoring/ai/generate.ts's module doc comment on why there is no
 * cache here, unlike the old matching product's MatchRun.
 */
export async function POST(request: Request) {
  const workspace = await getCurrentWorkspace();
  if (!workspace) return NextResponse.json({ error: "Not authorized" }, { status: 401 });

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid request body." }, { status: 400 });
  }

  const { profileVersionId, targetJobId, templateKey } = (body ?? {}) as {
    profileVersionId?: unknown;
    targetJobId?: unknown;
    templateKey?: unknown;
  };

  if (typeof profileVersionId !== "string" || typeof targetJobId !== "string") {
    return NextResponse.json(
      { error: "profileVersionId and targetJobId are required." },
      { status: 400 },
    );
  }

  try {
    const result = await generateTailoredResume(workspace.id, profileVersionId, targetJobId, {
      templateKey: typeof templateKey === "string" ? templateKey : undefined,
    });
    return NextResponse.json(result);
  } catch (error) {
    if (error instanceof QuotaExceededError) {
      return NextResponse.json({ error: "Monthly AI budget reached." }, { status: 429 });
    }
    logError("tailor.generate.route_failed", error, { workspaceId: workspace.id, targetJobId });
    return NextResponse.json({ error: "Could not generate a tailored resume." }, { status: 500 });
  }
}
