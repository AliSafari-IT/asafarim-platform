import "server-only";
import { createHmac, timingSafeEqual } from "node:crypto";
import type { ExportFormat } from "./services/export";

/**
 * Short-lived, server-signed authorization for the internal Puppeteer
 * request that renders a public timeline page during export (see
 * lib/server/services/export.ts and app/api/exports/route.ts).
 *
 * The internal render request carries no owner session or guest IP
 * identity, so it cannot pass the normal view-authorization check for a
 * private/pending timeline. This grant lets the export API — which DID
 * authorize the real caller — vouch for exactly one render of exactly one
 * (publicId, format) pair, for a few seconds, to the bare-render page path
 * only. `x-timelineai-render: bare` alone must never be treated as
 * authorization; only a grant that verifies here does.
 */

const GRANT_TTL_MS = 30_000;

function secret(): string {
  const key = process.env.TIMELINEAI_RENDER_GRANT_SECRET;
  if (!key) {
    throw new Error(
      "TIMELINEAI_RENDER_GRANT_SECRET is not configured — export rendering is unavailable."
    );
  }
  return key;
}

function sign(payload: string): string {
  return createHmac("sha256", secret()).update(payload).digest("base64url");
}

/** Issued by the export API after it has authorized the caller to view this timeline. */
export function createRenderGrant(publicId: string, format: ExportFormat): string {
  const exp = Date.now() + GRANT_TTL_MS;
  const payload = `${publicId}.${format}.${exp}`;
  return `${payload}.${sign(payload)}`;
}

/**
 * Verified only on the internal bare-render page path, and only against the
 * exact publicId being requested — a grant minted for one timeline can
 * never authorize rendering a different one.
 */
export function verifyRenderGrant(token: string | null, publicId: string): boolean {
  if (!token) return false;
  const parts = token.split(".");
  if (parts.length !== 4) return false;
  const [grantPublicId, , expStr, signature] = parts;
  const payload = `${grantPublicId}.${parts[1]}.${expStr}`;

  const expected = sign(payload);
  const a = Buffer.from(signature ?? "", "utf8");
  const b = Buffer.from(expected, "utf8");
  if (a.length !== b.length || !timingSafeEqual(a, b)) return false;

  const exp = Number.parseInt(expStr ?? "", 10);
  if (!Number.isFinite(exp) || Date.now() > exp) return false;

  return grantPublicId === publicId;
}
