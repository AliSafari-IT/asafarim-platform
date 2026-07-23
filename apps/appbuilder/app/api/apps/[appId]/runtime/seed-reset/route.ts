import { NextResponse } from "next/server";
import { getActor } from "@/lib/auth/session";
import { getDb } from "@/lib/db/client";
import { resetGeneratedData } from "@/lib/generated-data/seed";
import { SeedResetBody } from "@/lib/validation/runtime";
import { errorResponse, unauthorized } from "@/lib/http/errors";

interface RouteParams {
  params: Promise<{ appId: string }>;
}

/**
 * Preview-only demo-data reset — builder-authorized (`app.resetGeneratedData`,
 * editor+), requires an explicit `{"confirm":true}` body, blocked outright
 * for any app with a published release, and never reachable from any
 * generated-app end-user surface (there is no equivalent capability check
 * anywhere in this module that a generated-app member, as opposed to a
 * BUILDER, could ever satisfy).
 */
export async function POST(request: Request, { params }: RouteParams) {
  const actor = await getActor();
  if (!actor) return unauthorized();

  const { appId } = await params;
  const raw = await request.json().catch(() => null);
  const parsed = SeedResetBody.safeParse(raw);
  if (!parsed.success) {
    return NextResponse.json({ error: "Explicit confirmation is required." }, { status: 400 });
  }

  try {
    await resetGeneratedData(getDb(), actor, appId, parsed.data);
    return NextResponse.json({ ok: true });
  } catch (err) {
    return errorResponse(err);
  }
}
