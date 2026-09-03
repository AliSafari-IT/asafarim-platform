import { NextResponse } from "next/server";
import { buildHealthPayload } from "../../../lib/health";

// Unauthenticated by necessity: the showcase proof board and the Docker
// healthcheck both call this with no session cookie.
export const dynamic = "force-dynamic";

export async function GET() {
  const payload = await buildHealthPayload();
  return NextResponse.json(payload, { status: payload.ok ? 200 : 503 });
}
