import { NextResponse } from "next/server";
import { checkRateLimit } from "../../../../../lib/search/rateLimit";
import { getCurrentWorkspace } from "../../../../../lib/workspace";
import { getConfirmedVersion } from "../../../../../lib/profile/versions";
import { evaluateMatch } from "../../../../../lib/matching/ai/evaluate";

export const dynamic = "force-dynamic";

/**
 * The evidence-linked match result for one posting (JM-048), evaluated
 * against the candidate's confirmed profile version.
 *
 * Deliberately its own route rather than inlined into /api/jobs's search
 * response: evaluation is a metered, budget-gated provider call (JM-043,
 * JM-047), and a search results page can list dozens of postings a
 * candidate never opens the match panel for. Fetched on demand, one
 * posting at a time, so a candidate only spends budget on results they
 * actually look at.
 */
export async function GET(request: Request, context: { params: Promise<{ postingId: string }> }) {
  const workspace = await getCurrentWorkspace();
  if (!workspace) return NextResponse.json({ error: "Not authorized" }, { status: 401 });

  const limit = checkRateLimit(`match:${workspace.id}`);
  if (!limit.allowed) {
    return NextResponse.json(
      { error: "Too many match requests. Slow down and try again shortly." },
      { status: 429, headers: { "retry-after": String(limit.retryAfterSeconds) } },
    );
  }

  const { postingId } = await context.params;
  if (!postingId) {
    return NextResponse.json({ error: "A posting id is required." }, { status: 400 });
  }

  const confirmed = await getConfirmedVersion(workspace.id);
  if (!confirmed) {
    return NextResponse.json(
      { error: "Confirm your profile before requesting a match explanation." },
      { status: 409 },
    );
  }

  try {
    const result = await evaluateMatch(workspace.id, confirmed.id, postingId);
    // The confirmed profile's content travels with the result so the client
    // can resolve each MatchEvidence.profileField into a readable fact
    // (explainProfileField) without a second round trip — and so the fact
    // shown is always the one the evaluation actually ran against, not
    // whatever profile happens to be current by the time the panel opens.
    return NextResponse.json({ result, profileVersionId: confirmed.id, profile: confirmed.content });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Match evaluation failed.";
    const notFound = message.includes("not found");
    return NextResponse.json({ error: message }, { status: notFound ? 404 : 500 });
  }
}
