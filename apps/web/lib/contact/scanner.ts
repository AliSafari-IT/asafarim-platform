import { Socket } from "node:net";

/**
 * Antivirus for contact-form attachments, through ClamAV's INSTREAM protocol (the same
 * `clamav` sidecar the production stack already runs for ResuMatch).
 *
 * The rule: **an unscanned file is treated exactly like an infected one.** No scanner
 * configured, unreachable, slow, or answering nonsense all mean "do not accept the file".
 *
 * Configure with CONTACT_SCANNER_URL (for example tcp://clamav:3310). In development only,
 * CONTACT_SCANNER=insecure-accept-all lets uploads through without a scanner; it is ignored
 * when NODE_ENV is production.
 */

export type ScanVerdict =
  | { outcome: "clean"; scanner: string }
  | { outcome: "infected"; scanner: string; signature: string }
  | { outcome: "unavailable"; scanner: string; detail: string };

export interface Scanner {
  readonly name: string;
  scan(bytes: Uint8Array): Promise<ScanVerdict>;
}

export interface ClamConnection {
  connect(): void;
  write(data: Buffer): void;
  destroy(): void;
  on(
    event: "connect" | "data" | "error" | "close",
    listener: (arg?: unknown) => void
  ): void;
}

const CHUNK = 1024 * 1024;
const SCAN_TIMEOUT_MS = 30_000;

function socketFactory(host: string, port: number): ClamConnection {
  const socket = new Socket();
  return {
    connect: () => socket.connect(port, host),
    write: (data) => void socket.write(data),
    destroy: () => socket.destroy(),
    on: (event, listener) =>
      void socket.on(event, listener as (...args: unknown[]) => void),
  };
}

export function createClamScanner(
  host: string,
  port: number,
  options: {
    timeoutMs?: number;
    connectionFactory?: (host: string, port: number) => ClamConnection;
  } = {}
): Scanner {
  const name = `clamav:${host}:${port}`;
  const timeoutMs = options.timeoutMs ?? SCAN_TIMEOUT_MS;
  const open = options.connectionFactory ?? socketFactory;
  return {
    name,
    scan(bytes) {
      return new Promise<ScanVerdict>((resolve) => {
        const connection = open(host, port);
        const chunks: Buffer[] = [];
        let done = false;
        const finish = (verdict: ScanVerdict) => {
          if (done) return;
          done = true;
          clearTimeout(timer);
          connection.destroy();
          resolve(verdict);
        };
        const unavailable = (detail: string) =>
          finish({ outcome: "unavailable", scanner: name, detail });
        const timer = setTimeout(() => unavailable("timeout"), timeoutMs);

        connection.on("error", () => unavailable("connection-error"));
        connection.on("connect", () => {
          try {
            connection.write(Buffer.from("zINSTREAM\0", "ascii"));
            const buf = Buffer.from(bytes);
            for (let offset = 0; offset < buf.length; offset += CHUNK) {
              const chunk = buf.subarray(
                offset,
                Math.min(offset + CHUNK, buf.length)
              );
              const header = Buffer.alloc(4);
              header.writeUInt32BE(chunk.length, 0);
              connection.write(header);
              connection.write(chunk);
            }
            connection.write(Buffer.alloc(4)); // zero-length chunk: scan now
          } catch {
            unavailable("connection-error");
          }
        });
        connection.on("data", (data) => void chunks.push(data as Buffer));
        connection.on("close", () => {
          const text = Buffer.concat(chunks)
            .toString("utf8")
            .replace(/\0/g, "")
            .trim();
          if (!text) return unavailable("malformed-response");
          if (/\bOK$/.test(text))
            return finish({ outcome: "clean", scanner: name });
          const found = /:\s*(.+?)\s+FOUND$/.exec(text);
          if (found)
            return finish({
              outcome: "infected",
              scanner: name,
              signature: found[1]!,
            });
          return unavailable(
            /size limit exceeded/i.test(text)
              ? "size-limit-exceeded"
              : "malformed-response"
          );
        });
        connection.connect();
      });
    },
  };
}

const notConfigured: Scanner = {
  name: "none-configured",
  async scan() {
    return {
      outcome: "unavailable",
      scanner: "none-configured",
      detail: "not-configured",
    };
  },
};

const insecureDev: Scanner = {
  name: "insecure-dev-accept-all",
  async scan() {
    return { outcome: "clean", scanner: "insecure-dev-accept-all" };
  },
};

export function createScanner(
  env: Record<string, string | undefined> = process.env
): Scanner {
  if (
    env.CONTACT_SCANNER === "insecure-accept-all" &&
    env.NODE_ENV !== "production"
  )
    return insecureDev;
  const url = env.CONTACT_SCANNER_URL;
  if (!url) return notConfigured;
  try {
    const parsed = new URL(url);
    return createClamScanner(parsed.hostname, Number(parsed.port) || 3310);
  } catch {
    return notConfigured; // a broken URL must never mean "no scanning needed"
  }
}
