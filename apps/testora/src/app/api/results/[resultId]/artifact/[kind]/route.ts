import { NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { getObjectBytes } from "@asafarim/storage";
import { db } from "@/db/client";
import { testResults } from "@/db/schema";
import { canReadResultArtifacts } from "@/lib/bundle-access";
import type { ArtifactKind, StoredArtifactRef } from "@/test-engine/artifact-timeline";

export const dynamic = "force-dynamic";

const KINDS: ArtifactKind[] = ["screenshot", "domSnapshot", "video"];

/**
 * GET /api/results/{resultId}/artifact/{kind}
 *
 * Streams a captured failure artifact (screenshot / DOM snapshot / video,
 * issue #259) from object storage, behind the same access gate as the bundle
 * API. Returns 410 once the artifact is past its retention window.
 */
export async function GET(
  request: Request,
  { params }: { params: Promise<{ resultId: string; kind: string }> },
) {
  const { resultId, kind } = await params;
  if (!KINDS.includes(kind as ArtifactKind)) {
    return NextResponse.json({ error: "Unknown artifact kind" }, { status: 404 });
  }

  const row = await db.query.testResults.findFirst({
    where: eq(testResults.id, resultId),
    with: {
      case: {
        with: {
          fixture: { with: { suite: { with: { functionalRequirement: true } } } },
        },
      },
    },
  });

  if (!row) {
    return NextResponse.json({ error: "Result not found" }, { status: 404 });
  }

  const projectId =
    row.case?.fixture?.suite?.functionalRequirement?.projectId ?? null;
  if (!(await canReadResultArtifacts(request, projectId))) {
    return NextResponse.json({ error: "App is locked" }, { status: 403 });
  }

  const refs = (row.details as Record<string, unknown> | null)?.artifactRefs as
    | Partial<Record<ArtifactKind, StoredArtifactRef>>
    | undefined;
  const ref = refs?.[kind as ArtifactKind];
  if (!ref || typeof ref.key !== "string") {
    return NextResponse.json({ error: "Artifact not found" }, { status: 404 });
  }

  const expiresMs = Date.parse(ref.expiresAt);
  if (Number.isFinite(expiresMs) && expiresMs < Date.now()) {
    return NextResponse.json({ error: "Artifact expired" }, { status: 410 });
  }

  const object = await getObjectBytes(ref.key);
  if (!object) {
    return NextResponse.json({ error: "Artifact no longer available" }, { status: 404 });
  }

  return new Response(new Uint8Array(object.body), {
    status: 200,
    headers: {
      "content-type": ref.contentType || object.contentType,
      "content-length": String(object.body.length),
      "cache-control": "private, max-age=300",
    },
  });
}
