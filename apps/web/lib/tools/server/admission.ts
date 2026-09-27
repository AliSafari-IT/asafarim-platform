import "server-only";
import { createHash, randomBytes } from "node:crypto";

/**
 * Abuse and spend controls for anonymous live runs (#680). In-process, like
 * the idempotency store: the web container runs one replica. A multi-replica
 * deployment must move these counters to a shared store (threat model R4).
 *
 * Layers, checked in order, all before any spend:
 * 1. per-client request rate (every POST, including examples and invalid input)
 * 2. per-client, per-tool live-run rate
 * 3. per-client live-run rate across tools
 * 4. concurrency: one live call per client, `maxConcurrent` in total
 * 5. daily spend: each live call reserves its worst-case cost; the reservation
 *    is settled to the recorded estimate afterwards (or kept, if unknown)
 *
 * Clients are identified by a salted one-way hash of their address. The salt
 * is random per process, so the hash can't be reversed or linked across
 * restarts, and raw addresses are never stored or logged.
 */
export interface AdmissionLimits {
  requests: { limit: number; windowMs: number };
  perTool: { limit: number; windowMs: number };
  perClient: { limit: number; windowMs: number };
  maxConcurrent: number;
  dailyBudgetMicros: bigint;
}

export const DEFAULT_LIMITS: AdmissionLimits = {
  requests: { limit: 120, windowMs: 5 * 60_000 },
  perTool: { limit: 10, windowMs: 10 * 60_000 },
  perClient: { limit: 30, windowMs: 60 * 60_000 },
  maxConcurrent: 4,
  dailyBudgetMicros: BigInt(5_000_000),
};

export type Denial = { ok: false; code: "rate_limited" | "quota_exceeded"; retryAfterSeconds?: number };
export type Lease = { ok: true; release(recordedMicros: bigint | null): void };

export interface AdmissionController {
  /** Coarse per-client limit for every request. */
  request(client: string): Denial | null;
  /** Live-run admission. A granted lease must be released exactly once. */
  admitLive(client: string, slug: string, worstCaseMicros: bigint): Denial | Lease;
  /** Operational snapshot for tests and health checks (no client data). */
  snapshot(): { inFlight: number; reservedMicros: bigint; day: string; trackedClients: number };
}

const MAX_KEYS = 20_000;

export function createAdmissionController(limits: AdmissionLimits = DEFAULT_LIMITS, now: () => number = Date.now): AdmissionController {
  const windows = new Map<string, number[]>();
  const perClientInFlight = new Map<string, number>();
  let inFlight = 0;
  let day = utcDay(now());
  let reservedMicros = BigInt(0);

  const rollDay = () => {
    const today = utcDay(now());
    if (today !== day) {
      day = today;
      reservedMicros = BigInt(0);
    }
  };

  const longestWindow = Math.max(limits.requests.windowMs, limits.perTool.windowMs, limits.perClient.windowMs);
  let calls = 0;
  /** Forgets clients with no hits inside the longest window, so hashes don't outlive it. */
  const sweep = (t: number) => {
    for (const [key, hits] of windows) if (!hits.length || hits[hits.length - 1] <= t - longestWindow) windows.delete(key);
  };

  /** Sliding-window check; records the hit only when `commit` is true. */
  const check = (key: string, rule: { limit: number; windowMs: number }, commit: boolean): number | null => {
    const t = now();
    if (++calls % 500 === 0) sweep(t);
    const hits = (windows.get(key) ?? []).filter((h) => h > t - rule.windowMs);
    if (hits.length >= rule.limit) {
      windows.set(key, hits);
      return Math.max(1, Math.ceil((hits[0] + rule.windowMs - t) / 1000));
    }
    if (commit) {
      hits.push(t);
      if (!windows.has(key) && windows.size >= MAX_KEYS) windows.delete(windows.keys().next().value as string);
      windows.set(key, hits);
    }
    return null;
  };

  return {
    request(client) {
      const wait = check(`req:${client}`, limits.requests, true);
      return wait === null ? null : { ok: false, code: "rate_limited", retryAfterSeconds: wait };
    },

    admitLive(client, slug, worstCaseMicros) {
      rollDay();
      // Check every rule before recording any, so a denial doesn't use up another bucket.
      const waits = [check(`tool:${client}:${slug}`, limits.perTool, false), check(`client:${client}`, limits.perClient, false)].filter(
        (w): w is number => w !== null
      );
      if (waits.length) return { ok: false, code: "rate_limited", retryAfterSeconds: Math.max(...waits) };
      if (inFlight >= limits.maxConcurrent || (perClientInFlight.get(client) ?? 0) >= 1) {
        return { ok: false, code: "rate_limited", retryAfterSeconds: 30 };
      }
      if (reservedMicros + worstCaseMicros > limits.dailyBudgetMicros) {
        return { ok: false, code: "quota_exceeded", retryAfterSeconds: secondsToNextUtcDay(now()) };
      }

      check(`tool:${client}:${slug}`, limits.perTool, true);
      check(`client:${client}`, limits.perClient, true);
      inFlight += 1;
      perClientInFlight.set(client, (perClientInFlight.get(client) ?? 0) + 1);
      reservedMicros += worstCaseMicros;
      const reservedDay = day;
      let released = false;

      return {
        ok: true,
        release(recordedMicros) {
          if (released) return;
          released = true;
          inFlight -= 1;
          const left = (perClientInFlight.get(client) ?? 1) - 1;
          if (left > 0) perClientInFlight.set(client, left);
          else perClientInFlight.delete(client);
          // Settle to the recorded estimate when known; an unknown cost keeps the worst case.
          if (recordedMicros !== null && reservedDay === day) {
            reservedMicros += (recordedMicros < worstCaseMicros ? recordedMicros : worstCaseMicros) - worstCaseMicros;
          }
        },
      };
    },

    snapshot() {
      rollDay();
      sweep(now());
      return { inFlight, reservedMicros, day, trackedClients: windows.size };
    },
  };
}

/**
 * Limits from the environment, falling back to the defaults for anything
 * missing or malformed (so a typo never removes a limit).
 */
export function limitsFromEnv(env: Record<string, string | undefined>): AdmissionLimits {
  const int = (name: string, fallback: number) => {
    const n = Number(env[name]);
    return Number.isInteger(n) && n > 0 ? n : fallback;
  };
  const usd = Number(env.AI_TOOLS_DAILY_BUDGET_USD);
  return {
    requests: { limit: int("AI_TOOLS_REQUESTS_PER_5_MIN", DEFAULT_LIMITS.requests.limit), windowMs: DEFAULT_LIMITS.requests.windowMs },
    perTool: { limit: int("AI_TOOLS_RUNS_PER_TOOL_PER_10_MIN", DEFAULT_LIMITS.perTool.limit), windowMs: DEFAULT_LIMITS.perTool.windowMs },
    perClient: { limit: int("AI_TOOLS_RUNS_PER_HOUR", DEFAULT_LIMITS.perClient.limit), windowMs: DEFAULT_LIMITS.perClient.windowMs },
    maxConcurrent: int("AI_TOOLS_MAX_CONCURRENT", DEFAULT_LIMITS.maxConcurrent),
    dailyBudgetMicros: Number.isFinite(usd) && usd > 0 ? BigInt(Math.round(usd * 1_000_000)) : DEFAULT_LIMITS.dailyBudgetMicros,
  };
}

// ── Client identity ──────────────────────────────────────────────────────────
const SALT = randomBytes(16);

/**
 * A one-way, per-process identifier for the caller. Behind Caddy (the only
 * way to reach the web container: it publishes no ports), X-Forwarded-For's
 * rightmost entry is the address Caddy saw; Caddy replaces any value a client
 * sends. Without the header every caller shares one "unknown" bucket, which
 * fails safe (restrictive), never open.
 */
export function clientKey(headers: Headers, salt: Buffer = SALT): string {
  const forwarded = headers.get("x-forwarded-for");
  const address = forwarded?.split(",").map((s) => s.trim()).filter(Boolean).at(-1) ?? headers.get("x-real-ip")?.trim() ?? "unknown";
  return createHash("sha256").update(salt).update(address.slice(0, 64)).digest("hex").slice(0, 32);
}

/**
 * Browsers send Sec-Fetch-Site and Origin on every cross-origin POST; a
 * request carrying either must come from this site. Requests without both
 * (curl, server-to-server) are allowed: they can't ride a visitor's session,
 * and the per-client limits still apply to them.
 */
export function isSameOrigin(request: Request): boolean {
  const site = request.headers.get("sec-fetch-site");
  if (site && site !== "same-origin" && site !== "none") return false;
  const origin = request.headers.get("origin");
  if (!origin) return true;
  const host = request.headers.get("x-forwarded-host") ?? request.headers.get("host");
  try {
    return new URL(origin).host === host;
  } catch {
    return false;
  }
}

function utcDay(t: number): string {
  return new Date(t).toISOString().slice(0, 10);
}

function secondsToNextUtcDay(t: number): number {
  const d = new Date(t);
  const next = Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate() + 1);
  return Math.max(1, Math.ceil((next - t) / 1000));
}

/**
 * Reads at most `maxBytes` of the body; returns null if it's larger, without
 * buffering the rest. A declared Content-Length over the cap is refused
 * before anything is read.
 */
export async function readBodyLimited(request: Request, maxBytes: number): Promise<string | null> {
  const declared = Number(request.headers.get("content-length"));
  if (Number.isFinite(declared) && declared > maxBytes) return null;
  if (!request.body) return "";
  const reader = request.body.getReader();
  const chunks: Uint8Array[] = [];
  let size = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    size += value.byteLength;
    if (size > maxBytes) {
      await reader.cancel();
      return null;
    }
    chunks.push(value);
  }
  return Buffer.concat(chunks).toString("utf8");
}
