import { createHash } from "node:crypto";
import { NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { putObjectBytes } from "@asafarim/storage";
import { db } from "@/db/client";
import { testResults } from "@/db/schema";
import { jobForLease, runnerAuthError } from "@/lib/runner-routes";
import {
  ARTIFACT_CONTENT_TYPE,
  ARTIFACT_MAX_BYTES,
  artifactExpiry,
  artifactStorageKey,
  type ArtifactKind,
  type StoredArtifactRef,
} from "@/test-engine/artifact-timeline";

export const dynamic = "force-dynamic";

const KINDS: ArtifactKind[] = ["screenshot", "domSnapshot", "video"];
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * PUT /internal/runner/jobs/:id/artifacts/:kind/:resultId — one failure
 * artifact from the runner (#717). Content-type allow-listed and size-capped
 * per kind; stored via @asafarim/storage under the result's own key. The
 * signed body for binary uploads is the sha256 hex of the bytes. A result id
 * that already exists is refused, so a runner can't overwrite another run's
 * evidence.
 */
export async function PUT(
  request: Request,
  { params }: { params: Promise<{ id: string; kind: string; name: string }> },
) {
  const { id, kind, name } = await params;
  const bytes = Buffer.from(await request.arrayBuffer());
  const denied = runnerAuthError(request, createHash("sha256").update(bytes).digest("hex"), id);
  if (denied) return denied;
  const job = await jobForLease(request, id);
  if (job instanceof NextResponse) return job;

  if (!KINDS.includes(kind as ArtifactKind) || !UUID.test(name)) {
    return NextResponse.json({ error: "bad_artifact" }, { status: 400 });
  }
  const artifactKind = kind as ArtifactKind;
  const contentType = (request.headers.get("content-type") ?? "").toLowerCase();
  if (contentType !== ARTIFACT_CONTENT_TYPE[artifactKind].toLowerCase()) {
    return NextResponse.json({ error: "content_type_not_allowed" }, { status: 415 });
  }
  if (bytes.byteLength === 0 || bytes.byteLength > ARTIFACT_MAX_BYTES[artifactKind]) {
    return NextResponse.json({ error: "size_not_allowed" }, { status: 413 });
  }
  const existing = await db.query.testResults.findFirst({ where: eq(testResults.id, name), columns: { id: true } });
  if (existing) return NextResponse.json({ error: "result_exists" }, { status: 409 });

  const key = artifactStorageKey(name, artifactKind);
  await putObjectBytes(key, bytes, ARTIFACT_CONTENT_TYPE[artifactKind], { acl: "private" });
  const { capturedAt, expiresAt } = artifactExpiry();
  const ref: StoredArtifactRef = {
    key,
    bytes: bytes.byteLength,
    contentType: ARTIFACT_CONTENT_TYPE[artifactKind],
    capturedAt,
    expiresAt,
  };
  return NextResponse.json(ref);
}
