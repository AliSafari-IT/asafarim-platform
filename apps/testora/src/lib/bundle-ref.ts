import { randomUUID } from "node:crypto";

export const DEFAULT_PUBLIC_URL = process.env.TESTORA_PUBLIC_URL ?? "http://localhost:3005";

/**
 * A contract BundleReference pointing a consumer at the access-controlled
 * bundle endpoint (#258/#259). `bundleId` is a fresh identifier here, not a
 * lookup key — the bundle API mints the real bundle (and its own bundleId)
 * on read, from `url`.
 */
export function bundleRef(
  resultId: string,
  baseUrl: string,
): { bundleId: string; url: string } {
  return {
    bundleId: randomUUID(),
    url: `${baseUrl.replace(/\/+$/, "")}/api/results/${resultId}/bundle`,
  };
}
