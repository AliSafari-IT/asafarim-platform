import { resolveTxt } from "node:dns/promises";
import { assertRunnableTarget } from "@/lib/target-policy";
import { checkOwnershipProof, type ProofResult } from "@/lib/ownership";
import { TESTORA_USER_AGENT } from "@/lib/version";

const FETCH_TIMEOUT_MS = 5_000;
const MAX_BODY = 4_096;

/**
 * Read at most `maxBytes` of a response body, cancelling the stream once the
 * cap is reached — res.text() would buffer an arbitrarily large body first.
 */
export async function readCapped(res: Response, maxBytes: number): Promise<string> {
  if (!res.body) return "";
  const reader = res.body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  try {
    while (total < maxBytes) {
      const { done, value } = await reader.read();
      if (done) break;
      const take = value.subarray(0, maxBytes - total);
      chunks.push(take);
      total += take.byteLength;
    }
  } finally {
    await reader.cancel().catch(() => {});
  }
  return new TextDecoder().decode(Buffer.concat(chunks));
}

/**
 * Run the ownership proof (#703) for real: the well-known URL goes through the
 * run-target network policy first (no SSRF via verification), with a short
 * timeout, no redirects and a capped body; DNS TXT via the system resolver.
 */
export function verifyOwnership(host: string, token: string): Promise<ProofResult> {
  return checkOwnershipProof(host, token, {
    fetchText: async (url) => {
      await assertRunnableTarget(url, { isAdmin: true, stored: true });
      const res = await fetch(url, {
        redirect: "error",
        signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
        headers: { "User-Agent": TESTORA_USER_AGENT },
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      return readCapped(res, MAX_BODY);
    },
    resolveTxt: (hostname) => resolveTxt(hostname),
  });
}
