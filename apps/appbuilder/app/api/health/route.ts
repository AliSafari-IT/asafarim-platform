import { NextResponse } from "next/server";
import { buildHealthPayload } from "../../../lib/health";

export async function GET() {
  const payload = buildHealthPayload();
  return NextResponse.json(payload, { status: payload.ok ? 200 : 503 });
}
