import { timingSafeEqual } from "node:crypto";

/**
 * Service-token gate for the inbound provision API (issue #262). Distinct
 * from the bundle-read token (`lib/bundle-access.ts`) — provisioning writes
 * data, so it gets its own, more sensitive secret.
 */
export function hasProvisionServiceToken(request: Request): boolean {
  const expected = process.env.TESTORA_PROVISION_TOKEN;
  if (!expected) return false;
  const header = request.headers.get("authorization") ?? "";
  const match = /^Bearer\s+(.+)$/i.exec(header.trim());
  if (!match?.[1]) return false;
  const got = Buffer.from(match[1]);
  const want = Buffer.from(expected);
  return got.length === want.length && timingSafeEqual(got, want);
}
