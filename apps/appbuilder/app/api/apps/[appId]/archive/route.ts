import { NextResponse } from "next/server";
import { getActor } from "@/lib/auth/session";
import { getDb } from "@/lib/db/client";
import { archiveApp } from "@/lib/repositories/apps";
import { errorResponse, unauthorized } from "@/lib/http/errors";

interface RouteParams {
  params: Promise<{ appId: string }>;
}

/**
 * Owner-only, idempotent archival. `archiveApp` enforces the "app.archive"
 * capability (owner-only, see authz.ts) and never leaks whether an
 * inaccessible app exists — an unrelated caller gets the same 404 as a
 * nonexistent id. Archiving an already-archived app is a no-op success,
 * not an error, so a retried/duplicate request is safe.
 */
export async function POST(_request: Request, { params }: RouteParams) {
  const actor = await getActor();
  if (!actor) return unauthorized();

  const { appId } = await params;
  try {
    const app = await archiveApp(getDb(), actor, appId);
    return NextResponse.json({ app });
  } catch (err) {
    return errorResponse(err);
  }
}
