import { NextResponse } from "next/server";
import { checkRateLimit } from "../../../lib/search/rateLimit";
import { parseSearchQuery } from "../../../lib/search/query";
import { searchJobs } from "../../../lib/search/service";
import { getCurrentWorkspace } from "../../../lib/workspace";

export const dynamic = "force-dynamic";

/**
 * Job search (JM-035, JM-037).
 *
 * Authenticated like every other candidate-data route, which here protects
 * something slightly different: not the candidate's own data, but JobMatch's
 * ingested job data from being scraped back out at scale through a signed-in
 * account. The rate limit is the second layer of that same protection.
 */
export async function GET(request: Request) {
  const workspace = await getCurrentWorkspace();
  if (!workspace) return NextResponse.json({ error: "Not authorized" }, { status: 401 });

  const limit = checkRateLimit(workspace.id);
  if (!limit.allowed) {
    return NextResponse.json(
      { error: "Too many search requests. Slow down and try again shortly." },
      { status: 429, headers: { "retry-after": String(limit.retryAfterSeconds) } },
    );
  }

  const url = new URL(request.url);
  const parsed = parseSearchQuery(url.searchParams);
  if (!parsed.ok) {
    return NextResponse.json({ error: "That search could not be understood." }, { status: 400 });
  }

  const result = await searchJobs(workspace.id, parsed.query);
  return NextResponse.json(result);
}
