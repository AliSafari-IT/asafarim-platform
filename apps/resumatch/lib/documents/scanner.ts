import { Socket } from "node:net";
import { logError, log } from "../observability/logger";

/**
 * Malware scanning and quarantine (JM-018, issue #203).
 *
 * The rule this module exists to enforce: **an unscanned document is
 * treated exactly like an infected one.** No parser, no OCR worker, and no
 * model ever sees bytes that have not come back clean from a scanner.
 *
 * That makes "the scanner is down" an availability problem rather than a
 * security one, which is the correct trade: a candidate waiting to upload
 * is recoverable, a parser handed a malicious document is not. So the
 * default when no scanner is configured is `unavailable`, which quarantines
 * — never `clean`. A fail-open default is the kind of thing that looks like
 * a sensible dev-mode convenience right up until it ships.
 *
 * `unavailable` is one outcome for the pipeline (fail closed, full stop),
 * but it is not one outcome for an operator: a timeout, a refused
 * connection, and a daemon sending back garbage are different failures
 * with different fixes. `detail` carries that distinction into the logs
 * only — it never reaches the database `reasonCode` or the candidate-facing
 * message, both of which stay the single word `SCANNER_UNAVAILABLE`.
 */

export type ScannerUnavailableDetail =
  | "not-configured"
  | "connection-error"
  | "timeout"
  | "malformed-response"
  | "size-limit-exceeded";

export type ScanVerdict =
  | { outcome: "clean"; scannerName: string }
  | { outcome: "infected"; scannerName: string; signature: string }
  | { outcome: "unavailable"; scannerName: string; detail: ScannerUnavailableDetail };

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
    return { outcome: "unavailable", scannerName: "none-configured", detail: "not-configured" };
  },
};

/** ClamAV's INSTREAM chunk size cap is configurable server-side (StreamMaxLength);
 *  1 MB chunks are comfortably under any realistic deployment's setting and
 *  keep memory bounded regardless of how large a single write buffer gets. */
const INSTREAM_CHUNK_BYTES = 1024 * 1024;

/** Low enough that a candidate is not left staring at a spinner, high enough
 *  that a 10 MB document (the app's own upload cap) has time to scan on a
 *  loaded daemon. */
const DEFAULT_SCAN_TIMEOUT_MS = 20_000;
const DEFAULT_PING_TIMEOUT_MS = 3_000;

export interface ClamAvConnection {
  connect(): void;
  write(data: Buffer): void;
  end?(): void;
  destroy(): void;
  on(event: "connect" | "data" | "error" | "close", listener: (arg?: unknown) => void): void;
}

/** Real socket by default; tests inject a fake so the protocol logic is
 *  exercised without a running daemon. */
function defaultConnectionFactory(host: string, port: number): ClamAvConnection {
  const socket = new Socket();
  return {
    connect: () => socket.connect(port, host),
    write: (data) => {
      socket.write(data);
    },
    end: () => socket.end(),
    destroy: () => socket.destroy(),
    on: (event, listener) => {
      socket.on(event, listener as (...args: unknown[]) => void);
    },
  };
}

type InstreamResult =
  | { kind: "ok" }
  | { kind: "found"; signature: string }
  | { kind: "unavailable"; detail: ScannerUnavailableDetail };

/**
 * One request/response cycle of ClamAV's `INSTREAM` protocol: a length-
 * prefixed chunk stream terminated by a zero-length chunk, and a single
 * text response line terminated by the connection closing (or a NUL byte,
 * which some ClamAV versions send instead of closing promptly).
 *
 * Framed as its own function, independent of what the response means for
 * the document pipeline, so the wire protocol can be unit-tested against a
 * fake `ClamAvConnection` without a real daemon.
 */
function runInstream(
  bytes: Uint8Array,
  connectionFactory: (host: string, port: number) => ClamAvConnection,
  host: string,
  port: number,
  timeoutMs: number,
): Promise<InstreamResult> {
  return new Promise((resolve) => {
    const connection = connectionFactory(host, port);
    let settled = false;
    let responseChunks: Buffer[] = [];

    const timer = setTimeout(() => finish({ kind: "unavailable", detail: "timeout" }), timeoutMs);

    function finish(result: InstreamResult) {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      connection.destroy();
      resolve(result);
    }

    connection.on("error", () => finish({ kind: "unavailable", detail: "connection-error" }));

    connection.on("connect", () => {
      try {
        connection.write(Buffer.from("zINSTREAM\0", "ascii"));
        const buf = Buffer.from(bytes);
        for (let offset = 0; offset < buf.length; offset += INSTREAM_CHUNK_BYTES) {
          const chunk = buf.subarray(offset, Math.min(offset + INSTREAM_CHUNK_BYTES, buf.length));
          const header = Buffer.alloc(4);
          header.writeUInt32BE(chunk.length, 0);
          connection.write(header);
          connection.write(chunk);
        }
        // Zero-length chunk terminates the stream and tells ClamAV to scan
        // what it has received. An empty file (four zero bytes with nothing
        // before them) is valid and simply scans an empty stream.
        connection.write(Buffer.alloc(4));
      } catch {
        finish({ kind: "unavailable", detail: "connection-error" });
      }
    });

    connection.on("data", (data) => {
      responseChunks.push(data as Buffer);
    });

    connection.on("close", () => {
      const text = Buffer.concat(responseChunks).toString("utf8").replace(/\0/g, "").trim();
      if (!text) return finish({ kind: "unavailable", detail: "malformed-response" });
      if (/\bOK$/.test(text)) return finish({ kind: "ok" });
      const found = text.match(/:\s*(.+?)\s+FOUND$/);
      if (found) return finish({ kind: "found", signature: found[1] });
      if (/size limit exceeded/i.test(text)) {
        return finish({ kind: "unavailable", detail: "size-limit-exceeded" });
      }
      // Anything else — "INSTREAM: Unknown command", a truncated line, a
      // protocol version JobMatch does not recognise — is treated the same
      // as a daemon that is not there at all: fail closed, log the detail.
      return finish({ kind: "unavailable", detail: "malformed-response" });
    });

    connection.connect();
  });
}

/**
 * ClamAV over its INSTREAM TCP protocol, the standard way to run it as a
 * sidecar. Kept behind the `DocumentScanner` interface so the rest of the
 * pipeline never learns which scanner is in use, and so tests drive the
 * state machine with a fake connection rather than a container.
 */
export function createClamAvScanner(
  host: string,
  port: number,
  options: {
    timeoutMs?: number;
    connectionFactory?: (host: string, port: number) => ClamAvConnection;
  } = {},
): DocumentScanner {
  const timeoutMs = options.timeoutMs ?? DEFAULT_SCAN_TIMEOUT_MS;
  const connectionFactory = options.connectionFactory ?? defaultConnectionFactory;
  const scannerName = `clamav:${host}:${port}`;

  return {
    name: scannerName,
    async scan(bytes: Uint8Array): Promise<ScanVerdict> {
      const result = await runInstream(bytes, connectionFactory, host, port, timeoutMs);
      switch (result.kind) {
        case "ok":
          return { outcome: "clean", scannerName };
        case "found":
          return { outcome: "infected", scannerName, signature: result.signature };
        case "unavailable":
          // Logged here, not just returned: this is the one place the
          // detail is guaranteed to be observed even if a caller only ever
          // inspects the ScanVerdict's outcome field.
          log.warn("document.scan.unavailable", { outcome: result.detail, scannerName });
          return { outcome: "unavailable", scannerName, detail: result.detail };
      }
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

/** Parsed once so createScanner() and getScannerHealth() resolve the exact
 *  same host/port from the exact same environment. */
function resolveClamAvTarget(
  env: Record<string, string | undefined>,
): { host: string; port: number } | null {
  const url = env.JOBMATCH_SCANNER_URL;
  if (!url) return null;
  try {
    const parsed = new URL(url);
    return { host: parsed.hostname, port: Number(parsed.port) || 3310 };
  } catch {
    return null;
  }
}

/**
 * Whether the insecure dev bypass actually takes effect for this
 * environment — shared by `createScanner` and `getScannerHealth` so the two
 * can never disagree about it. A deployed environment falls through in
 * both, exactly as if `JOBMATCH_SCANNER` were unset.
 */
function isInsecureDevScannerActive(env: Record<string, string | undefined>): boolean {
  if (env.JOBMATCH_SCANNER !== INSECURE_DEV_SCANNER_VALUE) return false;
  const deployed =
    env.JOBMATCH_ENVIRONMENT === "production" ||
    env.JOBMATCH_ENVIRONMENT === "staging" ||
    env.NODE_ENV === "production";
  return !deployed;
}

export function createScanner(env: Record<string, string | undefined> = process.env): DocumentScanner {
  if (isInsecureDevScannerActive(env)) return insecureDevScanner;

  const target = resolveClamAvTarget(env);
  // A malformed scanner URL must not silently become "no scanning" — both
  // paths return nullScanner, but a set-and-broken JOBMATCH_SCANNER_URL is
  // exactly the misconfiguration getScannerHealth() below is meant to catch.
  if (!target) return nullScanner;
  return createClamAvScanner(target.host, target.port);
}

export interface ScannerHealth {
  configured: boolean;
  reachable: boolean;
  scannerName: string;
}

/**
 * A cheap liveness probe (`PING` rather than a full scan), used by the
 * app's health endpoint so scanner outages are visible in deployment/runtime
 * health signals rather than discovered only when a candidate's upload
 * quarantines (issue #203's "scanner readiness ... visible through
 * deployment/runtime health signals").
 *
 * Deliberately not part of `buildHealthPayload`'s pass/fail `ok` gate: a
 * scanner outage should page someone, but it must not flip the container's
 * own Docker healthcheck to unhealthy and trigger a restart loop that does
 * nothing to fix ClamAV.
 */
export async function getScannerHealth(
  env: Record<string, string | undefined> = process.env,
  timeoutMs = DEFAULT_PING_TIMEOUT_MS,
  connectionFactory: (host: string, port: number) => ClamAvConnection = defaultConnectionFactory,
): Promise<ScannerHealth> {
  if (isInsecureDevScannerActive(env)) {
    return { configured: false, reachable: true, scannerName: "insecure-dev-accept-all" };
  }

  const target = resolveClamAvTarget(env);
  if (!target) return { configured: false, reachable: false, scannerName: "none-configured" };

  const scannerName = `clamav:${target.host}:${target.port}`;
  const reachable = await new Promise<boolean>((resolve) => {
    const connection = connectionFactory(target.host, target.port);
    let settled = false;
    const finish = (ok: boolean) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      connection.destroy();
      resolve(ok);
    };
    const timer = setTimeout(() => finish(false), timeoutMs);
    connection.on("error", () => finish(false));
    connection.on("connect", () => {
      try {
        connection.write(Buffer.from("zPING\0", "ascii"));
      } catch {
        finish(false);
      }
    });
    let responseChunks: Buffer[] = [];
    connection.on("data", (data) => {
      responseChunks.push(data as Buffer);
      const text = Buffer.concat(responseChunks).toString("utf8");
      if (/PONG/.test(text)) finish(true);
    });
    connection.on("close", () => finish(false));
    connection.connect();
  }).catch((error: unknown) => {
    logError("document.scan.health_check_failed", error, { jobId: scannerName });
    return false;
  });

  return { configured: true, reachable, scannerName };
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
