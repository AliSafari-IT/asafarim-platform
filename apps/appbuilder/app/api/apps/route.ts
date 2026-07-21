import { NextResponse } from "next/server";
import { getActor } from "@/lib/auth/session";
import { getDb } from "@/lib/db/client";
import { createApp, listAppsForActor } from "@/lib/repositories/apps";
import { errorResponse, unauthorized } from "@/lib/http/errors";

/** Every app the signed-in actor owns or collaborates on. Never an unscoped "list all". */
export async function GET() {
  const actor = await getActor();
  if (!actor) return unauthorized();

  const apps = await listAppsForActor(getDb(), actor);
  return NextResponse.json({ apps });
}

/**
 * Creates an app owned by the signed-in actor. `ownerPrincipalId` always
 * comes from the session (via `actor`), never from the request body — any
 * such field in the body is ignored.
 */
export async function POST(request: Request) {
  const actor = await getActor();
  if (!actor) return unauthorized();

  const body = await request.json().catch(() => null);
  if (
    !body ||
    typeof body.name !== "string" ||
    typeof body.slug !== "string" ||
    typeof body.idempotencyKey !== "string"
  ) {
    return NextResponse.json(
      { error: "name, slug, and idempotencyKey are required strings" },
      { status: 400 },
    );
  }

  try {
    const app = await createApp(
      getDb(),
      actor,
      { name: body.name, slug: body.slug },
      body.idempotencyKey,
    );
    return NextResponse.json({ app }, { status: 201 });
  } catch (err) {
    return errorResponse(err);
  }
}
