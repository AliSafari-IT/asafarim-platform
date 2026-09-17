import { NextResponse } from "next/server";
import { getIngestionHealth } from "../../../lib/ingestion/status";
import { getCurrentWorkspace } from "../../../lib/workspace";

export const dynamic = "force-dynamic";

/**
 * Ingestion health for a signed-in operator.
 *
 * Authenticated but not role-gated: it reports source names, agreement
 * expiry and run counts, and carries no candidate data and no credentials.
 * Restricting it further belongs with the admin roles M11 introduces, not
 * with a half-measure now.
 */
export async function GET() {
  const workspace = await getCurrentWorkspace();
  if (!workspace) return NextResponse.json({ error: "Not authorized" }, { status: 401 });

  return NextResponse.json({ sources: await getIngestionHealth() });
}
