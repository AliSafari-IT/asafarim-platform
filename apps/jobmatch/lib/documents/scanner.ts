/**
 * Malware scanning and quarantine (JM-018).
 *
 * The rule this module exists to enforce: **an unscanned document is
 * treated exactly like an infected one.** No parser, no OCR worker, and no
 * model ever sees bytes that have not come back clean from a scanner.
 *
 * That makes "the scanner is down" a availability problem rather than a
 * security one, which is the correct trade: a candidate waiting to upload
 * is recoverable, a parser handed a malicious document is not. So the
 * default when no scanner is configured is `unavailable`, which quarantines
 * — never `clean`. A fail-open default is the kind of thing that looks like
 * a sensible dev-mode convenience right up until it ships.
 */

export type ScanVerdict =
  | { outcome: "clean"; scannerName: string }
  | { outcome: "infected"; scannerName: string; signature: string }
  | { outcome: "unavailable"; scannerName: string };

export interface DocumentScanner {
  readonly name: string;
  scan(bytes: Uint8Array): Promise<ScanVerdict>;
}

/**
 * The scanner used when none is configured. Always `unavailable`, so a
 * deployment without JOBMATCH_SCANNER_URL quarantines every upload and the
 * misconfiguration is loudly visible in the UI instead of silently
 * disabling the control.
 */
export const nullScanner: DocumentScanner = {
  name: "none-configured",
  async scan() {
    return { outcome: "unavailable", scannerName: "none-configured" };
  },
};

/**
 * ClamAV over its INSTREAM TCP protocol, the standard way to run it as a
 * sidecar. Kept behind the interface so the rest of the pipeline never
 * learns which scanner is in use, and so tests drive the state machine with
 * a fake rather than a container.
 *
 * Not wired to a live daemon in this milestone — no ClamAV service is
 * deployed yet, so `createScanner` returns the null scanner and everything
 * quarantines. Standing the sidecar up is deployment work, not code work,
 * and the interface it plugs into is what M2 owes.
 */
export function createClamAvScanner(host: string, port: number): DocumentScanner {
  return {
    name: `clamav:${host}:${port}`,
    async scan(): Promise<ScanVerdict> {
      // Intentionally not implemented: returning `unavailable` is the
      // honest answer until the sidecar exists, and it fails closed.
      return { outcome: "unavailable", scannerName: `clamav:${host}:${port}` };
    },
  };
}

/**
 * A scanner that approves everything. It exists so the pipeline can be
 * exercised locally before a ClamAV sidecar exists, and every part of how
 * it is reached is designed to make shipping it impossible by accident:
 *
 * - It is opted into by an exact literal, `insecure-accept-all`, so no
 *   plausible typo or truthy value selects it.
 * - `createScanner` refuses it outside development, whatever the variable
 *   says, so setting it on a deployed environment changes nothing.
 * - Its name is recorded on every document it clears, so a row scanned this
 *   way is identifiable forever rather than indistinguishable from a real
 *   clean verdict.
 */
export const INSECURE_DEV_SCANNER_VALUE = "insecure-accept-all";

export const insecureDevScanner: DocumentScanner = {
  name: "insecure-dev-accept-all",
  async scan() {
    return { outcome: "clean", scannerName: "insecure-dev-accept-all" };
  },
};

export function createScanner(env: Record<string, string | undefined> = process.env): DocumentScanner {
  if (env.JOBMATCH_SCANNER === INSECURE_DEV_SCANNER_VALUE) {
    // The environment check is here rather than at the call site because a
    // call site can be forgotten. A deployed environment falls through to
    // the normal path and quarantines, exactly as if this were unset.
    const deployed =
      env.JOBMATCH_ENVIRONMENT === "production" ||
      env.JOBMATCH_ENVIRONMENT === "staging" ||
      env.NODE_ENV === "production";
    if (!deployed) return insecureDevScanner;
  }

  const url = env.JOBMATCH_SCANNER_URL;
  if (!url) return nullScanner;

  try {
    const parsed = new URL(url);
    return createClamAvScanner(parsed.hostname, Number(parsed.port) || 3310);
  } catch {
    // A malformed scanner URL must not silently become "no scanning".
    return nullScanner;
  }
}

/** What the pipeline should do with a document, given a verdict. */
export type ScanDecision =
  | { advance: true }
  | { advance: false; reasonCode: "MALWARE_DETECTED" | "SCANNER_UNAVAILABLE" };

/**
 * The single place a scan verdict turns into a pipeline decision. Exhaustive
 * over the verdict union, so a new outcome cannot be added without this
 * failing to compile.
 */
export function decideFromVerdict(verdict: ScanVerdict): ScanDecision {
  switch (verdict.outcome) {
    case "clean":
      return { advance: true };
    case "infected":
      return { advance: false, reasonCode: "MALWARE_DETECTED" };
    case "unavailable":
      return { advance: false, reasonCode: "SCANNER_UNAVAILABLE" };
  }
}
