import { readFile } from "node:fs/promises";
import { putObjectBytes } from "@asafarim/storage";
import {
  ARTIFACT_CONTENT_TYPE,
  ARTIFACT_MAX_BYTES,
  artifactExpiry,
  artifactStorageKey,
  type ArtifactKind,
  type StoredArtifactRef,
  type StoredArtifactRefs,
} from "@/test-engine/artifact-timeline";

/**
 * Uploads point-of-failure artifacts (screenshot, DOM snapshot, video) to
 * object storage via `@asafarim/storage` and returns small refs to persist on
 * `test_results.details.artifactRefs` — the row no longer carries multi-MB
 * data URLs (issue #259). A capture that is missing, empty, over the size cap,
 * or that fails to upload is simply omitted; it never fails the test run.
 */

async function uploadArtifact(
  resultId: string,
  kind: ArtifactKind,
  body: Buffer,
  log?: (line: string) => void,
): Promise<StoredArtifactRef | undefined> {
  if (body.byteLength === 0) return undefined;
  if (body.byteLength > ARTIFACT_MAX_BYTES[kind]) {
    log?.(
      `⚠ ${kind} artifact ${(body.byteLength / 1_000_000).toFixed(1)} MB exceeds ` +
        `${ARTIFACT_MAX_BYTES[kind] / 1_000_000} MB cap; not stored.`,
    );
    return undefined;
  }
  const key = artifactStorageKey(resultId, kind);
  try {
    await putObjectBytes(key, body, ARTIFACT_CONTENT_TYPE[kind], { acl: "private" });
  } catch (err) {
    log?.(`⚠ Failed to store ${kind} artifact: ${err}`);
    return undefined;
  }
  const { capturedAt, expiresAt } = artifactExpiry();
  return {
    key,
    bytes: body.byteLength,
    contentType: ARTIFACT_CONTENT_TYPE[kind],
    capturedAt,
    expiresAt,
  };
}

export interface CaptureFailureArtifactsInput {
  resultId: string;
  screenshotPath?: string;
  domSnapshotPath?: string;
  videoPath?: string;
  log?: (line: string) => void;
}

export async function captureFailureArtifacts(
  input: CaptureFailureArtifactsInput,
): Promise<StoredArtifactRefs> {
  const refs: StoredArtifactRefs = {};

  const jobs: Array<Promise<void>> = [];
  const capture = (kind: ArtifactKind, filePath: string | undefined) => {
    if (!filePath) return;
    jobs.push(
      (async () => {
        let buf: Buffer;
        try {
          buf = await readFile(filePath);
        } catch {
          return;
        }
        const bytes =
          kind === "domSnapshot" && buf.byteLength > ARTIFACT_MAX_BYTES.domSnapshot
            ? buf.subarray(0, ARTIFACT_MAX_BYTES.domSnapshot)
            : buf;
        const ref = await uploadArtifact(input.resultId, kind, Buffer.from(bytes), input.log);
        if (ref) refs[kind] = ref;
      })(),
    );
  };

  capture("screenshot", input.screenshotPath);
  capture("domSnapshot", input.domSnapshotPath);
  capture("video", input.videoPath);
  await Promise.all(jobs);

  return refs;
}
