/**
 * Keeps checking the runner's egress fence while it runs (#718 follow-up,
 * architect note on #723, 2026-10-02T20:06:03Z).
 *
 * The start-up self-test proves the host filter held when the runner started.
 * The filter can disappear later — a `ufw reload`/`ufw enable` on the VPS can
 * drop the chains — and a running runner wouldn't notice until the next
 * deploy. So the guard re-runs the built-in probes:
 *   - every `intervalMs` (5 minutes in production), and
 *   - before a lease, when the last passing check is older than `maxAgeMs`
 *     (i.e. after an idle period).
 * The first failure is final: `onFail` runs once, and every later call reports
 * the fence as broken, so no slot leases again.
 *
 * Probe and clock are injected so it can be unit-tested.
 */
import type { SelfTestReport } from "./egress-check";

export const EGRESS_SELF_TEST_FAILED = "EGRESS_SELF_TEST_FAILED";

export interface EgressGuardOptions {
  probe: () => Promise<SelfTestReport>;
  intervalMs: number;
  maxAgeMs: number;
  onFail: (report: SelfTestReport) => void;
  /**
   * After each passing *interval* check — one call per `intervalMs`, so the
   * log shows the fence is still being checked. Pre-lease checks don't call
   * it: after idle they can run every lease.
   */
  onPeriodicPass?: () => void;
  now?: () => number;
}

export class EgressGuard {
  private lastPassAt = Number.NEGATIVE_INFINITY;
  private inflight: Promise<boolean> | null = null;
  private timer: ReturnType<typeof setInterval> | null = null;
  private failedReport: SelfTestReport | null = null;

  constructor(private readonly opts: EgressGuardOptions) {}

  get failed(): boolean {
    return this.failedReport !== null;
  }

  /** Run the probes now (single-flight). Resolves true while the fence holds. */
  check(): Promise<boolean> {
    if (this.failedReport) return Promise.resolve(false);
    this.inflight ??= this.opts
      .probe()
      .catch((error): SelfTestReport => ({
        passed: false,
        lines: [`self-test crashed: ${error instanceof Error ? error.message : String(error)}`],
      }))
      .then((report) => {
        if (report.passed) {
          this.lastPassAt = this.now();
          return true;
        }
        if (!this.failedReport) {
          this.failedReport = report;
          this.stop();
          this.opts.onFail(report);
        }
        return false;
      })
      .finally(() => {
        this.inflight = null;
      });
    return this.inflight;
  }

  /** Before a lease: re-check when the last pass is stale. */
  ensureFresh(): Promise<boolean> {
    if (this.failedReport) return Promise.resolve(false);
    if (this.now() - this.lastPassAt <= this.opts.maxAgeMs) return Promise.resolve(true);
    return this.check();
  }

  /** Record a pass made elsewhere (the start-up self-test). */
  markPassed(): void {
    this.lastPassAt = this.now();
  }

  start(): void {
    if (this.timer || this.failedReport) return;
    this.timer = setInterval(
      () => void this.check().then((ok) => ok && this.opts.onPeriodicPass?.()),
      this.opts.intervalMs,
    );
  }

  stop(): void {
    if (this.timer) clearInterval(this.timer);
    this.timer = null;
  }

  private now(): number {
    return (this.opts.now ?? Date.now)();
  }
}
