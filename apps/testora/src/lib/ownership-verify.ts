import { resolveTxt } from "node:dns/promises";
import { assertRunnableTarget } from "@/lib/target-policy";
import { checkOwnershipProof, type ProofResult } from "@/lib/ownership";
import { TESTORA_USER_AGENT } from "@/lib/version";

const FETCH_TIMEOUT_MS = 5_000;
const MAX_BODY = 4_096;

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
      return (await res.text()).slice(0, MAX_BODY);
    },
    resolveTxt: (hostname) => resolveTxt(hostname),
  });
}
