import { NextResponse } from "next/server";

import { GooglePhotosAuthError } from "./tokens";

/**
 * Map a {@link GooglePhotosAuthError} to a 409 response that tells the client
 * to re-run the connect flow. Returns `null` for other errors so callers can
 * fall through to their generic error handling.
 */
export function authErrorResponse(error: unknown): NextResponse | null {
  if (error instanceof GooglePhotosAuthError) {
    return NextResponse.json(
      { error: "google_photos_reconnect_required", code: error.code },
      { status: 409 },
    );
  }
  return null;
}
