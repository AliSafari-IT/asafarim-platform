import { NextResponse } from "next/server";
import { buildHealthPayload } from "../../../lib/health";

// Unauthenticated by necessity: the Docker healthcheck and the platform
// proof board both call this with no session cookie.
export const dynamic = "force-dynamic";

export async function GET() {
  const payload = await buildHealthPayload();
  return NextResponse.json(payload, { status: payload.ok ? 200 : 503 });
}
