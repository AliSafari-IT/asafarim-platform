import { createHash } from "node:crypto";

/**
 * Duplicate detection for bug reports. Two failures are "the same bug" when
 * they come from the same app and test case and their error reads the same
 * once run-specific noise (ids, numbers, timings, paths) is stripped.
 *
 * The fingerprint is stored on the issue row and embedded in the GitHub issue
 * body as a hidden HTML comment, so a report filed from another environment
 * (e.g. production vs. local) still matches.
 */

const MARKER_RE = /<!--\s*testora:fingerprint=([a-f0-9]{16})\s*-->/i;

/** First meaningful line of an error, with volatile parts normalized away. */
export function normalizeError(message: string | null | undefined): string {
  const firstLine =
    (message ?? "")
      .split(/\r?\n/)
      .map((line) => line.trim())
      .find((line) => line.length > 0) ?? "";
  return firstLine
    .toLowerCase()
    .replace(/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/g, "<uuid>")
    .replace(/\b[0-9a-f]{12,}\b/g, "<hex>")
    .replace(/(?:[a-z]:)?[\\/][\w.\-\\/]+/g, "<path>")
    .replace(/\d+(\.\d+)?/g, "<n>")
    .replace(/\s+/g, " ")
    .slice(0, 240);
}

export function issueFingerprint(input: {
  projectId: string;
  caseId: string | null | undefined;
  errorMessage: string | null | undefined;
}): string {
  const key = [input.projectId, input.caseId ?? "", normalizeError(input.errorMessage)].join("\u0000");
  return createHash("sha256").update(key).digest("hex").slice(0, 16);
}

export function fingerprintMarker(fingerprint: string): string {
  return `<!-- testora:fingerprint=${fingerprint} -->`;
}

/** The body with exactly one marker for `fingerprint` appended. */
export function withFingerprintMarker(body: string, fingerprint: string): string {
  const clean = body.replace(MARKER_RE, "").trimEnd();
  return `${clean}\n\n${fingerprintMarker(fingerprint)}\n`;
}

export function extractFingerprint(body: string | null | undefined): string | null {
  return MARKER_RE.exec(body ?? "")?.[1]?.toLowerCase() ?? null;
}
