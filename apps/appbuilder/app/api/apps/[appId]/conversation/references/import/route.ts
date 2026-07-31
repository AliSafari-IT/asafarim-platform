import { NextResponse } from "next/server";
import { getActor } from "@/lib/auth/session";
import { getDb } from "@/lib/db/client";
import { importConversationReference } from "@/lib/repositories/references";
import { describeFreshness } from "@/lib/references/provenance";
import { ImportReferenceBody } from "@/lib/validation/references";
import { errorResponse, unauthorized } from "@/lib/http/errors";
import { correlationIdFrom, withCorrelationId } from "@/lib/observability/correlation";

interface RouteParams {
  params: Promise<{ appId: string }>;
}

/**
 * M13 slice F — imports one explicitly-supplied public HTTPS reference (or
 * refreshes a previously imported one) with full provenance.
 *
 * Everything that makes this safe happens below the route: SSRF policy and
 * per-hop redirect re-validation (lib/references/urlPolicy.ts), the bounded
 * fetch (lib/references/fetchReference.ts), and the cache/quota/authorization
 * rules (lib/repositories/references.ts). The route's own job is to be honest
 * about the outcome — which is why the response always carries `freshness`
 * plus a plain-language `freshnessLabel`, and why a fetch that failed over a
 * still-usable cached copy comes back 200 with `failure` set and freshness
 * `stale`, rather than either a bare error (losing the usable copy) or a
 * clean success (claiming data we could not confirm).
 */
export async function POST(request: Request, { params }: RouteParams) {
  const actor = await getActor();
  if (!actor) return unauthorized();

  const { appId } = await params;
  const raw = await request.json().catch(() => null);
  const parsed = ImportReferenceBody.safeParse(raw);
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.issues[0]?.message ?? "Invalid reference import request." },
      { status: 400 },
    );
  }

  const correlationId = correlationIdFrom(request);
  try {
    const db = getDb();
    const result = await importConversationReference(db, actor, appId, { ...parsed.data, correlationId });
    return withCorrelationId(
      NextResponse.json(
        {
          reference: result.reference,
          fetched: result.fetched,
          freshness: result.freshness,
          freshnessLabel: describeFreshness(result.freshness, result.reference.fetchedAt),
          unchanged: result.unchanged,
          failure: result.failure,
        },
        { status: result.fetched && !result.reference.refreshCount ? 201 : 200 },
      ),
      correlationId,
    );
  } catch (err) {
    return withCorrelationId(errorResponse(err), correlationId);
  }
}
