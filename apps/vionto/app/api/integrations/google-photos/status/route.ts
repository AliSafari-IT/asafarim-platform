import { NextResponse } from "next/server";

import { getAuthedUser, serverError, unauthorized } from "@/lib/server/auth";
import { isGooglePhotosConfigured } from "@/lib/server/google-photos/config";
import { getGooglePhotosConnection } from "@/lib/server/google-photos/connection";

export const runtime = "nodejs";

/**
 * GET /api/integrations/google-photos/status
 *
 * Reports whether the caller has a usable Google Photos connection, for the
 * connect/disconnect UI.
 */
export async function GET() {
  try {
    const user = await getAuthedUser();
    if (!user) return unauthorized();

    const configured = isGooglePhotosConfigured();
    const connection = await getGooglePhotosConnection(user.id);

    return NextResponse.json({
      configured,
      connected: Boolean(connection && connection.status === "active"),
      status: connection?.status ?? null,
      googleAccountEmail: connection?.googleAccountEmail ?? null,
      scopes: connection?.scopes ?? [],
      expiresAt: connection?.expiresAt ?? null,
      lastImportedAt: connection?.lastImportedAt ?? null,
    });
  } catch (error) {
    return serverError("google-photos/status", error);
  }
}
