import { NextResponse } from "next/server";
import { getDb } from "@/lib/db/client";
import { downloadFile } from "@/lib/generated-data/files";
import { errorResponse } from "@/lib/http/errors";

interface RouteParams {
  params: Promise<{ appId: string; fileId: string }>;
}

/**
 * The one route that actually streams file bytes — gated ENTIRELY by the
 * signed `?token=` query param minted by the sibling `authorize` route
 * (never by session cookie alone), so an expired or forged token is
 * rejected before any storage read happens. No session/actor lookup here
 * at all: the token itself already encodes a verified, time-bound
 * authorization decision.
 */
export async function GET(request: Request, { params }: RouteParams) {
  const { fileId } = await params;
  const url = new URL(request.url);
  const token = url.searchParams.get("token");
  if (!token) {
    return NextResponse.json({ error: "A download token is required." }, { status: 400 });
  }

  try {
    const db = getDb();
    const { body, contentType, filename } = await downloadFile(db, fileId, token);
    return new NextResponse(new Uint8Array(body), {
      status: 200,
      headers: {
        "Content-Type": contentType,
        "Content-Disposition": `attachment; filename="${filename.replace(/["\\]/g, "_")}"`,
        "Cache-Control": "private, no-store",
      },
    });
  } catch (err) {
    return errorResponse(err);
  }
}
