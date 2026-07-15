import { NextResponse } from "next/server";
import { z } from "zod";

import { badRequest, getAuthedUser, serverError, unauthorized } from "@/lib/server/auth";
import { touchGooglePhotosImportedAt } from "@/lib/server/google-photos/connection";
import { importMediaItems } from "@/lib/server/google-photos/ingest";
import { listPickedItems } from "@/lib/server/google-photos/picker";
import { authErrorResponse } from "@/lib/server/google-photos/route-helpers";
import { getValidGooglePhotosAccessToken } from "@/lib/server/google-photos/tokens";
import { getSessionForUser } from "@/lib/server/upload-session";

export const runtime = "nodejs";

const importSchema = z.object({
  uploadSessionId: z.string().min(1),
  pickerSessionId: z.string().min(1),
});

/**
 * POST /api/integrations/google-photos/import
 *
 * Server-side import of the items a user selected in a picker session into the
 * given upload session. Items are fetched from Google here (not trusted from
 * the client) and staged exactly like uploaded files.
 */
export async function POST(req: Request) {
  try {
    const user = await getAuthedUser();
    if (!user) return unauthorized();

    const parsed = importSchema.safeParse(await req.json().catch(() => null));
    if (!parsed.success) return badRequest("Invalid import request");
    const { uploadSessionId, pickerSessionId } = parsed.data;

    // Ownership of the target upload session.
    if (!getSessionForUser(uploadSessionId, user.id)) {
      return badRequest("Invalid or expired upload session");
    }

    const accessToken = await getValidGooglePhotosAccessToken(user.id);
    const items = await listPickedItems(accessToken, pickerSessionId);
    if (items.length === 0) {
      return badRequest("No photos were selected");
    }

    const summary = await importMediaItems(user.id, uploadSessionId, items, { accessToken });
    if (summary.failed > 0) {
      const failures = summary.results.filter((r) => r.status === "failed");
      console.error("[google-photos/import] failures:", JSON.stringify(failures, null, 2));
    }
    if (summary.imported > 0) {
      await touchGooglePhotosImportedAt(user.id).catch(() => {});
    }

    return NextResponse.json(summary);
  } catch (error) {
    return authErrorResponse(error) ?? serverError("google-photos/import", error);
  }
}
