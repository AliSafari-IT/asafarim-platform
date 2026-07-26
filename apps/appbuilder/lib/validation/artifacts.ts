import { buildKey, putObjectBytes } from "@asafarim/storage";
import { generateId } from "../db/ids";
import { validationArtifacts } from "../db/schema";
import type { Db } from "../db/client";
import type { GateArtifactInput } from "./types";
import { VALIDATION_LIMITS } from "./limits";

/**
 * Persists one gate-produced artifact (screenshot/trace/report/log/summary)
 * through the shared `@asafarim/storage` boundary (same S3-compatible
 * client + local-dev fallback M09's file boundary uses — see
 * lib/generated-data/files.ts) and records a `validation_artifacts` row.
 * `storageKey` is always server-generated via `buildKey`, never derived from
 * a gate's own label — mirrors the "client input never determines the
 * storage path" contract M09 established for uploaded files. Oversized
 * bodies are truncated with a note rather than persisted whole, guarding
 * against a pathological trace/log blowing storage/DB budgets.
 */
export async function persistGateArtifact(
  db: Db,
  input: { runId: string; appId: string; gateKey?: string; artifact: GateArtifactInput },
): Promise<string> {
  const bodyBuffer = Buffer.isBuffer(input.artifact.body) ? input.artifact.body : Buffer.from(input.artifact.body, "utf8");
  const truncated = bodyBuffer.length > VALIDATION_LIMITS.MAX_ARTIFACT_BYTES;
  const bytes = truncated ? bodyBuffer.subarray(0, VALIDATION_LIMITS.MAX_ARTIFACT_BYTES) : bodyBuffer;

  const extension = input.artifact.contentType.includes("png")
    ? "png"
    : input.artifact.contentType.includes("json")
      ? "json"
      : input.artifact.contentType.includes("zip")
        ? "zip"
        : "txt";
  const key = buildKey(`appbuilder-validation/${input.appId}/${input.runId}`, extension);
  await putObjectBytes(key, bytes, input.artifact.contentType, { acl: "private" });

  const [row] = await db
    .insert(validationArtifacts)
    .values({
      id: generateId(),
      runId: input.runId,
      appId: input.appId,
      gateKey: input.gateKey ?? null,
      kind: input.artifact.kind,
      label: truncated ? `${input.artifact.label} (truncated)` : input.artifact.label,
      storageKey: key,
      contentType: input.artifact.contentType,
      sizeBytes: bytes.length,
      retentionExpiresAt: new Date(Date.now() + VALIDATION_LIMITS.ARTIFACT_RETENTION_MS),
    })
    .returning();

  return row.id;
}
