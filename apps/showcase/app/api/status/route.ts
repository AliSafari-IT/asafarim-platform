import { NextResponse } from "next/server";

// Public, unauthenticated liveness endpoint for the proof board
// (apps/showcase/app/proof). Showcase has no database of its own, so this
// is a pure "the app process is up and responding" check — no db field.
export const dynamic = "force-dynamic";

export async function GET() {
  return NextResponse.json({
    app: "showcase",
    status: "ok",
    timestamp: new Date().toISOString(),
    responseTimeMs: 0,
  });
}
