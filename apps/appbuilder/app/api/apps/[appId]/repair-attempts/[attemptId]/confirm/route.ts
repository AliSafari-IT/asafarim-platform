import { NextResponse } from "next/server";
import { z } from "zod";
import { getActor } from "@/lib/auth/session";
import { getDb } from "@/lib/db/client";
import { confirmRepair } from "@/lib/repositories/repairAttempts";
import { nudgeRepairWorker } from "@/lib/server/queue";
import { errorResponse, unauthorized } from "@/lib/http/errors";

interface RouteParams {
  params: Promise<{ appId: string; attemptId: string }>;
}

const ConfirmRepairBody = z.object({ checksum: z.string().min(1) });

/**
 * Confirms a destructive repair proposal — bound to the requesting actor
 * (only the person who requested the repair), this app, the attempt's base
 * version, and the exact proposal checksum the client must echo back (see
 * lib/repair/confirmation.ts), exactly mirroring M08's
 * modification-confirmation contract. Never trusted from the model.
 */
export async function POST(request: Request, { params }: RouteParams) {
  const actor = await getActor();
  if (!actor) return unauthorized();

  const { appId, attemptId } = await params;
  const raw = await request.json().catch(() => null);
  const parsed = ConfirmRepairBody.safeParse(raw);
  if (!parsed.success) {
    return NextResponse.json({ error: "A checksum is required to confirm this repair." }, { status: 400 });
  }

  try {
    const db = getDb();
    const attempt = await confirmRepair(db, actor, appId, attemptId, parsed.data);
    await nudgeRepairWorker(attempt.id, { cause: "resume" });
    return NextResponse.json({ attempt });
  } catch (err) {
    return errorResponse(err);
  }
}
