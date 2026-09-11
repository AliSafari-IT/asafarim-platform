import { NextResponse } from "next/server";
import { correlationId, fail } from "../../../../lib/api/http";
import {
  readTestoraHeaders,
  receiveTestoraWebhook,
} from "../../../../lib/integrations/testora";

/**
 * Testora webhook (issue #264). No session: each per-workspace integration
 * carries its own HMAC secret, verified in-handler over
 * `timestamp.deliveryId.rawBody` with a replay window. Listed in
 * proxy.ts publicRoutes.
 */
export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  const cid = correlationId(req);
  try {
    const rawBody = await req.text();
    const result = await receiveTestoraWebhook({
      rawBody,
      headers: readTestoraHeaders(req.headers),
    });
    return NextResponse.json({ data: result }, { status: 202 });
  } catch (err) {
    return fail(err, cid);
  }
}
