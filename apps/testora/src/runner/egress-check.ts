/**
 * Egress self-test of the runner container (#718, ADR 0004 §7).
 *
 * The host filter on `testora_egress` (infra/scripts/testora-egress-firewall.sh)
 * is the enforcement; this proves it is in place. Every probe below must be
 * BLOCKED — a timeout, an unreachable route or a name that doesn't resolve.
 * A refused connection is NOT blocked: the RST came from the target, so the
 * packet got there. The public Hub must answer an HTTPS GET.
 *
 * Run two ways:
 *   - at runner start-up (TESTORA_EGRESS_SELF_TEST=1): the default probes; a
 *     failure stops the runner before it pulls any job;
 *   - by vps-deploy.sh: `node main.mjs --egress-self-test [host:port …]` with
 *     the host's real addresses added; a failure fails the deploy.
 */
import { readFile } from "node:fs/promises";
import net from "node:net";

export type ProbeOutcome = "connected" | "refused" | "timeout" | "unreachable" | "no-dns" | "error";

export interface Probe {
  host: string;
  port: number;
  /** Why this address must be unreachable (for the report). */
  label: string;
}

export interface ProbeResult extends Probe {
  outcome: ProbeOutcome;
  blocked: boolean;
}

/** Outcomes that prove the packet never reached the target. */
export function isBlocked(outcome: ProbeOutcome): boolean {
  return outcome === "timeout" || outcome === "unreachable" || outcome === "no-dns";
}

/** Map a socket error code to an outcome. */
export function outcomeOf(code: string | undefined): ProbeOutcome {
  switch (code) {
    case "ECONNREFUSED":
    case "ECONNRESET":
      return "refused";
    case "ETIMEDOUT":
      return "timeout";
    case "EHOSTUNREACH":
    case "ENETUNREACH":
    case "EACCES":
    case "EPERM":
      return "unreachable";
    case "ENOTFOUND":
    case "EAI_AGAIN":
      return "no-dns";
    default:
      return "error";
  }
}

/** Parse `host:port` (IPv4 or a name). */
export function parseProbe(spec: string, label = "extra"): Probe {
  const at = spec.lastIndexOf(":");
  const host = spec.slice(0, at);
  const port = Number(spec.slice(at + 1));
  if (at <= 0 || !Number.isInteger(port) || port < 1 || port > 65535) {
    throw new Error(`Bad probe "${spec}" — expected host:port`);
  }
  return { host, port, label };
}

/**
 * The container's default gateway (the `testora_egress` bridge on the host)
 * from /proc/net/route, or null when there is none / not on Linux.
 */
export function defaultGateway(procNetRoute: string): string | null {
  for (const line of procNetRoute.split("\n").slice(1)) {
    const cols = line.trim().split(/\s+/);
    if (cols[1] === "00000000" && cols[2] && cols[2] !== "00000000") {
      const hex = cols[2];
      // Little-endian hex → dotted quad.
      return [6, 4, 2, 0].map((i) => parseInt(hex.slice(i, i + 2), 16)).join(".");
    }
  }
  return null;
}

/** Probes that must fail from any runner container, wherever it runs. */
export async function defaultProbes(): Promise<Probe[]> {
  const probes: Probe[] = [
    { host: "testora-postgres", port: 5432, label: "testora's database (asafarim_net)" },
    { host: "redis", port: 6379, label: "platform redis (asafarim_net)" },
    { host: "169.254.169.254", port: 80, label: "cloud metadata (link-local)" },
    { host: "10.0.0.1", port: 80, label: "an RFC1918 address" },
  ];
  const gateway = defaultGateway(await readFile("/proc/net/route", "utf8").catch(() => ""));
  if (gateway) probes.push({ host: gateway, port: 22, label: "the host via its testora_egress gateway" });
  return probes;
}

export function probeTcp(probe: Probe, timeoutMs = 3_000): Promise<ProbeResult> {
  return new Promise((resolve) => {
    const socket = net.connect({ host: probe.host, port: probe.port, family: 4 });
    const done = (outcome: ProbeOutcome) => {
      clearTimeout(timer);
      socket.destroy();
      resolve({ ...probe, outcome, blocked: isBlocked(outcome) });
    };
    const timer = setTimeout(() => done("timeout"), timeoutMs);
    socket.once("connect", () => done("connected"));
    socket.once("error", (error: NodeJS.ErrnoException) => done(outcomeOf(error.code)));
  });
}

/** The one thing that must work: an HTTPS GET to the public Hub. */
export async function probePublic(url: string, timeoutMs = 10_000): Promise<{ url: string; ok: boolean; detail: string }> {
  try {
    const res = await fetch(url, { redirect: "manual", signal: AbortSignal.timeout(timeoutMs) });
    return { url, ok: res.status < 500, detail: `HTTP ${res.status}` };
  } catch (error) {
    const cause = (error as { cause?: { code?: string } }).cause?.code;
    return { url, ok: false, detail: cause ?? (error instanceof Error ? error.message : String(error)) };
  }
}

export interface SelfTestReport {
  passed: boolean;
  lines: string[];
}

export async function runEgressSelfTest(opts: {
  extra?: Probe[];
  publicUrl?: string;
  /** false at start-up: a Hub outage must not stop a correctly fenced runner. */
  requirePublic?: boolean;
}): Promise<SelfTestReport> {
  const probes = [...(await defaultProbes()), ...(opts.extra ?? [])];
  const results = await Promise.all(probes.map((p) => probeTcp(p)));
  const lines = results.map(
    (r) => `${r.blocked ? "✔ blocked" : "✖ REACHABLE"}  ${r.host}:${r.port}  (${r.label}) → ${r.outcome}`,
  );
  let passed = results.every((r) => r.blocked);
  if (opts.publicUrl) {
    const pub = await probePublic(opts.publicUrl);
    lines.push(`${pub.ok ? "✔ reachable" : "✖ UNREACHABLE"}  ${pub.url} → ${pub.detail}`);
    if (!pub.ok && opts.requirePublic !== false) passed = false;
  }
  lines.push(passed ? "EGRESS SELF-TEST PASSED" : "EGRESS SELF-TEST FAILED");
  return { passed, lines };
}
