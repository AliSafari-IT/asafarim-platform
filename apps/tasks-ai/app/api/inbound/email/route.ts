import { NextResponse } from "next/server";
import { z } from "zod";
import { correlationId, fail } from "../../../../lib/api/http";
import { ApiError } from "../../../../lib/errors";
import { receiveInboundEmail } from "../../../../lib/capture/inbound";

/**
 * Mail-provider webhook. Carries no session — it authenticates its own
 * bearer token in constant time and 404s outright when the secret is unset,
 * matching the platform's machine-endpoint pattern. Listed in proxy.ts
 * publicRoutes for that reason.
 */
export const dynamic = "force-dynamic";

const bodySchema = z.object({
  localPart: z.string().min(3).max(64),
  messageId: z.string().min(1).max(400),
  subject: z.string().max(2000).default(""),
  text: z.string().max(200000).default(""),
  from: z.string().max(400).default("unknown"),
});

export async function POST(req: Request) {
  const cid = correlationId(req);
  try {
    const secret = process.env.TASKSAI_INBOUND_WEBHOOK_SECRET;
    if (!secret) return new NextResponse("Not found", { status: 404 });
    const auth = req.headers.get("authorization") ?? "";
    const presented = auth.replace(/^Bearer\s+/i, "");
    if (presented.length !== secret.length || presented !== secret) {
      throw new ApiError("unauthenticated");
    }
    const parsed = bodySchema.parse(await req.json().catch(() => ({})));
    const result = await receiveInboundEmail(parsed, cid);
    return NextResponse.json({ data: result }, { status: 201 });
  } catch (err) {
    return fail(err, cid);
  }
}
