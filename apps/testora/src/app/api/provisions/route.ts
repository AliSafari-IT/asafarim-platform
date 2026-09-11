import { NextResponse } from "next/server";
import { ProvisionTestsRequest, ProvisionTestsResponse } from "@asafarim/testora-tasksai-contract";
import { hasProvisionServiceToken } from "@/lib/provision-access";
import { ProvisionError, provisionScenarios } from "@/lib/provision-service";

/**
 * POST /api/provisions — the TDD-gate inbound endpoint (issue #262).
 * Service-token auth (`TESTORA_PROVISION_TOKEN`, not the bundle-read one —
 * this writes data). Idempotent on the request's `taskRef`.
 */
export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  if (!hasProvisionServiceToken(request)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body: unknown = await request.json().catch(() => null);
  const parsed = ProvisionTestsRequest.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }

  try {
    const outcome = await provisionScenarios(parsed.data);
    const response = ProvisionTestsResponse.parse({
      v: 1,
      provisionId: outcome.provisionId,
      scenarios: outcome.scenarios,
    });
    return NextResponse.json(response, { status: 201 });
  } catch (error) {
    if (error instanceof ProvisionError) {
      return NextResponse.json({ error: error.message }, { status: error.status });
    }
    throw error;
  }
}
