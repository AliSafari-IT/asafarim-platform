import { and, eq } from "drizzle-orm";
import { NextResponse } from "next/server";
import { getObjectBytes } from "@asafarim/storage";
import { getActor } from "@/lib/auth/session";
import { getDb } from "@/lib/db/client";
import { validationArtifacts } from "@/lib/db/schema";
import { getValidationRunForActor } from "@/lib/repositories/validationRuns";
import { NotFoundError } from "@/lib/errors";
import { errorResponse, unauthorized } from "@/lib/http/errors";

interface RouteParams {
  params: Promise<{ appId: string; runId: string; artifactId: string }>;
}

/**
 * Streams one artifact's raw bytes. Gated by the SAME session +
 * `app.viewValidation` capability check as the run itself (never a
 * signed-token indirection like the generated-app file boundary — this is
 * a builder-only surface, not reachable by a generated-app end user) —
 * unrelated actors get the identical 404 an existence-hiding NotFoundError
 * produces everywhere else in this codebase.
 */
export async function GET(_request: Request, { params }: RouteParams) {
  const actor = await getActor();
  if (!actor) return unauthorized();

  const { appId, runId, artifactId } = await params;
  try {
    const db = getDb();
    await getValidationRunForActor(db, actor, appId, runId); // capability + existence + app-scoping check

    const [artifact] = await db
      .select()
      .from(validationArtifacts)
      .where(and(eq(validationArtifacts.id, artifactId), eq(validationArtifacts.runId, runId), eq(validationArtifacts.appId, appId)))
      .limit(1);
    if (!artifact) throw new NotFoundError("Validation artifact", artifactId);

    if (artifact.retentionExpiresAt && artifact.retentionExpiresAt.getTime() < Date.now()) {
      return NextResponse.json({ error: "This artifact has passed its retention window and is no longer available." }, { status: 410 });
    }

    const object = await getObjectBytes(artifact.storageKey);
    if (!object) throw new NotFoundError("Validation artifact object", artifactId);

    return new NextResponse(new Uint8Array(object.body), {
      status: 200,
      headers: {
        "Content-Type": object.contentType,
        "Content-Disposition": `inline; filename="${artifact.label.replace(/["\\]/g, "_")}"`,
        "Cache-Control": "private, no-store",
      },
    });
  } catch (err) {
    return errorResponse(err);
  }
}
