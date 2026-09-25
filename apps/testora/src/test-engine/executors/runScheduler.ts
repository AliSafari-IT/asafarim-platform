/**
 * Concurrency gate for test runs. Each run drives a real headless Chrome
 * through TestCafe inside the Testora server process, so unbounded parallel
 * runs would take the whole VPS. At most `limit` runs execute at once; the
 * rest wait in a FIFO queue (capped at `maxQueue`) and start automatically as
 * slots free up — whether the run before them passed, failed, errored or was
 * cancelled.
 *
 * Pure bookkeeping, no I/O: the caller supplies each job's `start` function
 * and gets callbacks when a job starts or queue positions change.
 */

export type Admission =
  | { status: "running" }
  | { status: "queued"; position: number }
  | { status: "rejected"; reason: "queue-full" };

export interface SchedulerSnapshot {
  limit: number;
  maxQueue: number;
  running: string[];
  /** In start order: queued[0] starts next. */
  queued: string[];
}

export interface RunSchedulerOptions {
  limit: number;
  maxQueue: number;
  /** A job left the queue and is starting now. */
  onStart?: (id: string) => void;
  /** Called with every still-queued job's new 1-based position. */
  onPositions?: (positions: Map<string, number>) => void;
}

export class RunScheduler {
  private readonly running = new Set<string>();
  private readonly queue: { id: string; start: () => Promise<void> }[] = [];

  constructor(private readonly options: RunSchedulerOptions) {}

  get limit(): number {
    return this.options.limit;
  }

  /** Start now if a slot is free, else queue (or refuse when the queue is full). */
  submit(id: string, start: () => Promise<void>): Admission {
    if (this.running.has(id) || this.queue.some((job) => job.id === id)) {
      throw new Error(`Run ${id} is already scheduled`);
    }
    if (this.running.size < this.options.limit && this.queue.length === 0) {
      this.launch(id, start);
      return { status: "running" };
    }
    if (this.queue.length >= this.options.maxQueue) {
      return { status: "rejected", reason: "queue-full" };
    }
    this.queue.push({ id, start });
    return { status: "queued", position: this.queue.length };
  }

  /** Remove a job that hasn't started yet. False if it isn't queued. */
  cancelQueued(id: string): boolean {
    const index = this.queue.findIndex((job) => job.id === id);
    if (index === -1) return false;
    this.queue.splice(index, 1);
    this.notifyPositions();
    return true;
  }

  /**
   * Free a running job's slot now, without waiting for its promise to settle
   * — for a run that was cancelled or timed out but whose browser session
   * never returns. Idempotent: the job settling later changes nothing.
   */
  release(id: string): boolean {
    if (!this.running.delete(id)) return false;
    this.pump();
    return true;
  }

  isRunning(id: string): boolean {
    return this.running.has(id);
  }

  positionOf(id: string): number | null {
    const index = this.queue.findIndex((job) => job.id === id);
    return index === -1 ? null : index + 1;
  }

  snapshot(): SchedulerSnapshot {
    return {
      limit: this.options.limit,
      maxQueue: this.options.maxQueue,
      running: [...this.running],
      queued: this.queue.map((job) => job.id),
    };
  }

  private launch(id: string, start: () => Promise<void>): void {
    this.running.add(id);
    this.options.onStart?.(id);
    // Whatever the outcome, free the slot and hand it to the next job.
    let settled: Promise<void>;
    try {
      settled = Promise.resolve(start());
    } catch (error) {
      settled = Promise.reject(error);
    }
    void settled
      .catch(() => {
        /* the job reports its own failure; the scheduler only needs the slot back */
      })
      .finally(() => {
        // Already released (cancel/timeout)? Then its slot was handed on.
        if (this.running.delete(id)) this.pump();
      });
  }

  private pump(): void {
    let started = false;
    while (this.running.size < this.options.limit && this.queue.length > 0) {
      const next = this.queue.shift()!;
      started = true;
      this.launch(next.id, next.start);
    }
    if (started) this.notifyPositions();
  }

  private notifyPositions(): void {
    if (!this.options.onPositions || this.queue.length === 0) return;
    this.options.onPositions(new Map(this.queue.map((job, index) => [job.id, index + 1])));
  }
}

/** Read an integer setting from the environment, clamped to [min, max]. */
export function intFromEnv(value: string | undefined, fallback: number, min: number, max: number): number {
  const parsed = Number.parseInt(value ?? "", 10);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.min(max, Math.max(min, parsed));
}
