import type { Pool, PoolClient } from "pg";

/**
 * Durable run queue + log (#716, ADR 0004 step 1) on Testora's Postgres:
 *   runs        one row per run — queue entry, lease, outcome
 *   run_events  append-only log per run (seq 1..n) that the SSE stream tails
 *
 * Admission and dequeue run in one transaction under an advisory lock, and
 * claim queued rows with SELECT … FOR UPDATE SKIP LOCKED, so the concurrency
 * limit holds across processes. A running row carries a lease (owner +
 * expiry) that its process renews; a row whose lease lapsed belongs to a dead
 * process and is failed as "runner lost" (not re-queued — a half-run suite
 * may already have written data). Queued rows simply wait for a free slot.
 *
 * Plain SQL over a pg Pool (not Drizzle) for the locking clauses, and so the
 * integration tests can point it at a throwaway database.
 */

export type RunRowStatus = "created" | "queued" | "running" | "done" | "error" | "cancelled";

export interface RunRow {
  id: string;
  projectId: string | null;
  ownerId: string | null;
  ownerName: string | null;
  targetId: string | null;
  rateKey: string | null;
  label: string | null;
  status: RunRowStatus;
  total: number | null;
  error: string | null;
  queuedAt: Date;
  startedAt: Date | null;
  finishedAt: Date | null;
  leaseOwner: string | null;
  leaseExpiresAt: Date | null;
  cancelRequested: boolean;
  jobEnc: string | null;
  runnerLeaseTokenHash: string | null;
}

export interface RunEventRow {
  seq: number;
  kind: string;
  payload: unknown;
}

export type AdmitResult =
  | { status: "running" }
  | { status: "queued"; position: number }
  | { status: "rejected"; reason: "queue-full" };

export const RUN_EVENTS_CHANNEL = "testora_run_events";
/** Serialises admission/dequeue across processes (any constant works). */
const QUEUE_LOCK_KEY = 716_0001;

const ACTIVE = ["queued", "running"] as const;

function toRow(r: Record<string, unknown>): RunRow {
  return {
    id: r.id as string,
    projectId: (r.project_id as string) ?? null,
    ownerId: (r.owner_id as string) ?? null,
    ownerName: (r.owner_name as string) ?? null,
    targetId: (r.target_id as string) ?? null,
    rateKey: (r.rate_key as string) ?? null,
    label: (r.label as string) ?? null,
    status: r.status as RunRowStatus,
    total: (r.total as number) ?? null,
    error: (r.error as string) ?? null,
    queuedAt: r.queued_at as Date,
    startedAt: (r.started_at as Date) ?? null,
    finishedAt: (r.finished_at as Date) ?? null,
    leaseOwner: (r.lease_owner as string) ?? null,
    leaseExpiresAt: (r.lease_expires_at as Date) ?? null,
    cancelRequested: Boolean(r.cancel_requested),
    jobEnc: (r.job_enc as string) ?? null,
    runnerLeaseTokenHash: (r.runner_lease_token_hash as string) ?? null,
  };
}

export interface RunStoreOptions {
  /** Max runs executing at once (TESTORA_MAX_CONCURRENT_RUNS). */
  limit: number;
  /** Max runs waiting (TESTORA_MAX_QUEUED_RUNS). */
  maxQueue: number;
  /** How long a lease lasts without renewal. */
  leaseMs: number;
}

export function createRunStore(pool: Pool, options: RunStoreOptions) {
  async function tx<T>(work: (client: PoolClient) => Promise<T>): Promise<T> {
    const client = await pool.connect();
    try {
      await client.query("BEGIN");
      const out = await work(client);
      await client.query("COMMIT");
      return out;
    } catch (error) {
      await client.query("ROLLBACK").catch(() => {});
      throw error;
    } finally {
      client.release();
    }
  }

  /** Claim queued rows (oldest first) into free slots, for `leaseOwner`. */
  async function claimInTx(
    client: PoolClient,
    leaseOwner: string,
    opts: { max?: number; leaseTokenHash?: string } = {},
  ): Promise<RunRow[]> {
    const { rows: countRows } = await client.query(
      "SELECT count(*)::int AS n FROM runs WHERE status = 'running'",
    );
    const free = Math.min(options.limit - (countRows[0]!.n as number), opts.max ?? Infinity);
    if (free <= 0) return [];
    const { rows } = await client.query(
      `UPDATE runs SET status = 'running', started_at = now(),
              lease_owner = $1, lease_expires_at = now() + make_interval(secs => $2),
              runner_lease_token_hash = $4
        WHERE id IN (
          SELECT id FROM runs WHERE status = 'queued'
           ORDER BY queued_at, id
           FOR UPDATE SKIP LOCKED
           LIMIT $3)
        RETURNING *`,
      [leaseOwner, options.leaseMs / 1000, free, opts.leaseTokenHash ?? null],
    );
    return rows.map(toRow).sort((a, b) => a.queuedAt.getTime() - b.queuedAt.getTime());
  }

  return {
    limit: options.limit,
    maxQueue: options.maxQueue,

    /** A run that exists (for the log) but hasn't been admitted yet. */
    async create(run: {
      id: string;
      projectId?: string | null;
      ownerId?: string | null;
      ownerName?: string | null;
      targetId?: string | null;
      rateKey?: string | null;
    }): Promise<void> {
      await pool.query(
        `INSERT INTO runs (id, project_id, owner_id, owner_name, target_id, rate_key, status)
         VALUES ($1, $2, $3, $4, $5, $6, 'created')`,
        [run.id, run.projectId ?? null, run.ownerId ?? null, run.ownerName ?? null, run.targetId ?? null, run.rateKey ?? null],
      );
    },

    async setMeta(runId: string, total: number, label: string): Promise<void> {
      await pool.query("UPDATE runs SET total = $2, label = $3 WHERE id = $1", [runId, total, label]);
    },

    /**
     * Queue a created run with its frozen job, then fill free slots (this run
     * included, FIFO). Returns where this run ended up, plus every run this
     * process just claimed and must start.
     */
    async admit(
      runId: string,
      jobEnc: string,
      leaseOwner: string,
      admitOptions: { claim?: boolean } = {},
    ): Promise<{ admission: AdmitResult; claimed: RunRow[] }> {
      return tx(async (client) => {
        await client.query("SELECT pg_advisory_xact_lock($1)", [QUEUE_LOCK_KEY]);
        const { rows: q } = await client.query("SELECT count(*)::int AS n FROM runs WHERE status = 'queued'");
        const { rows: r } = await client.query("SELECT count(*)::int AS n FROM runs WHERE status = 'running'");
        // Full when every slot is busy and the waiting line is at its cap.
        if ((r[0]!.n as number) >= options.limit && (q[0]!.n as number) >= options.maxQueue) {
          await client.query(
            "UPDATE runs SET status = 'error', error = 'The test queue is full', finished_at = now() WHERE id = $1",
            [runId],
          );
          return { admission: { status: "rejected", reason: "queue-full" } as AdmitResult, claimed: [] };
        }
        await client.query(
          "UPDATE runs SET status = 'queued', job_enc = $2, queued_at = now() WHERE id = $1 AND status = 'created'",
          [runId, jobEnc],
        );
        // Remote runner mode: only queue — the runner claims via its lease call.
        const claimed = admitOptions.claim === false ? [] : await claimInTx(client, leaseOwner);
        if (claimed.some((row) => row.id === runId)) return { admission: { status: "running" } as AdmitResult, claimed };
        const position = await positionInTx(client, runId);
        return { admission: { status: "queued", position: position ?? 1 } as AdmitResult, claimed };
      });
    },

    /** Fill free slots from the queue (after a run ends, on the worker tick). */
    async claimNext(leaseOwner: string): Promise<RunRow[]> {
      return tx(async (client) => {
        await client.query("SELECT pg_advisory_xact_lock($1)", [QUEUE_LOCK_KEY]);
        return claimInTx(client, leaseOwner);
      });
    },

    /**
     * Remote runner (#717): claim one queued run for `runnerOwner` (within the
     * concurrency limit) and bind it to a lease token (hash stored).
     */
    async claimForRunner(runnerOwner: string, leaseTokenHash: string): Promise<RunRow | null> {
      return tx(async (client) => {
        await client.query("SELECT pg_advisory_xact_lock($1)", [QUEUE_LOCK_KEY]);
        const [row] = await claimInTx(client, runnerOwner, { max: 1, leaseTokenHash });
        return row ?? null;
      });
    },

    /** Remote runner: extend one job's lease; returns whether a cancel was requested. */
    async renewRunnerLease(runId: string): Promise<{ cancel: boolean } | null> {
      const { rows } = await pool.query(
        `UPDATE runs SET lease_expires_at = now() + make_interval(secs => $2)
          WHERE id = $1 AND status = 'running' AND runner_lease_token_hash IS NOT NULL
          RETURNING cancel_requested`,
        [runId, options.leaseMs / 1000],
      );
      return rows[0] ? { cancel: Boolean(rows[0].cancel_requested) } : null;
    },

    /**
     * Renew the leases of the runs this process executes; returns the ids
     * whose cancel was requested (by any process).
     */
    async heartbeat(leaseOwner: string, runIds: string[]): Promise<{ renewed: string[]; cancel: string[] }> {
      if (runIds.length === 0) return { renewed: [], cancel: [] };
      const { rows } = await pool.query(
        `UPDATE runs SET lease_expires_at = now() + make_interval(secs => $3)
          WHERE id = ANY($2) AND lease_owner = $1 AND status = 'running'
          RETURNING id, cancel_requested`,
        [leaseOwner, runIds, options.leaseMs / 1000],
      );
      return {
        renewed: rows.map((r) => r.id as string),
        cancel: rows.filter((r) => r.cancel_requested).map((r) => r.id as string),
      };
    },

    /**
     * Fail running rows whose process is gone: the lease lapsed, or (at boot)
     * it belongs to an earlier instance on this same host. Returns their ids.
     */
    async sweepLost(options2: { deadOwnerPrefix?: string; currentOwner?: string } = {}): Promise<string[]> {
      // A lost run whose cancel was already requested just ends cancelled.
      const { rows } = await pool.query(
        `UPDATE runs SET status = CASE WHEN cancel_requested THEN 'cancelled' ELSE 'error' END,
                error = CASE WHEN cancel_requested THEN 'Run cancelled' ELSE 'runner lost' END,
                finished_at = now(), job_enc = NULL, runner_lease_token_hash = NULL
          WHERE status = 'running'
            AND (lease_expires_at < now()
                 OR ($1::text IS NOT NULL AND lease_owner LIKE $1 || '%' AND lease_owner <> $2))
          RETURNING id, cancel_requested`,
        [options2.deadOwnerPrefix ?? null, options2.currentOwner ?? ""],
      );
      // Only the ones that really were lost need a "runner lost" event.
      return rows.filter((r) => !r.cancel_requested).map((r) => r.id as string);
    },

    /** Append one event (seq = next), and notify listeners. */
    async append(runId: string, kind: string, payload: unknown): Promise<number> {
      // Writes for one run are serialised by its process; two processes
      // writing the same run at once (a cancel elsewhere) can race on seq —
      // retry on the primary-key conflict.
      for (let attempt = 1; ; attempt++) {
        try {
          return await appendOnce(runId, kind, payload);
        } catch (error) {
          if ((error as { code?: string }).code !== "23505" || attempt >= 5) throw error;
        }
      }
    },

    async eventsAfter(runId: string, afterSeq: number): Promise<RunEventRow[]> {
      const { rows } = await pool.query(
        "SELECT seq, kind, payload FROM run_events WHERE run_id = $1 AND seq > $2 ORDER BY seq",
        [runId, afterSeq],
      );
      return rows.map((r) => ({ seq: r.seq as number, kind: r.kind as string, payload: r.payload }));
    },

    /** Finish a run (done/error/cancelled); drops its frozen job. False if it was already finished. */
    async finish(runId: string, status: "done" | "error" | "cancelled", error?: string): Promise<boolean> {
      const { rowCount } = await pool.query(
        `UPDATE runs SET status = $2, error = $3, finished_at = now(), job_enc = NULL,
                lease_owner = NULL, lease_expires_at = NULL, runner_lease_token_hash = NULL
          WHERE id = $1 AND status IN ('created', 'queued', 'running')`,
        [runId, status, error ?? null],
      );
      return (rowCount ?? 0) > 0;
    },

    /** Cancel: a queued run leaves the queue; a running one is flagged for its process. */
    async requestCancel(runId: string): Promise<"dequeued" | "flagged" | null> {
      const dequeued = await pool.query(
        `UPDATE runs SET status = 'cancelled', error = 'Run cancelled', finished_at = now(), job_enc = NULL
          WHERE id = $1 AND status IN ('created', 'queued') RETURNING id`,
        [runId],
      );
      if ((dequeued.rowCount ?? 0) > 0) return "dequeued";
      const flagged = await pool.query(
        "UPDATE runs SET cancel_requested = true WHERE id = $1 AND status = 'running' AND NOT cancel_requested RETURNING id",
        [runId],
      );
      return (flagged.rowCount ?? 0) > 0 ? "flagged" : null;
    },

    async get(runId: string): Promise<RunRow | null> {
      const { rows } = await pool.query("SELECT * FROM runs WHERE id = $1", [runId]);
      return rows[0] ? toRow(rows[0]) : null;
    },

    async position(runId: string): Promise<number | null> {
      const client = await pool.connect();
      try {
        return await positionInTx(client, runId);
      } finally {
        client.release();
      }
    },

    async activeFor(ownerId: string | null): Promise<RunRow | null> {
      const { rows } = await pool.query(
        `SELECT * FROM runs WHERE owner_id IS NOT DISTINCT FROM $1 AND status = ANY($2) AND NOT cancel_requested
          ORDER BY queued_at DESC LIMIT 1`,
        [ownerId, [...ACTIVE]],
      );
      return rows[0] ? toRow(rows[0]) : null;
    },

    async snapshot(): Promise<{ running: RunRow[]; queued: RunRow[] }> {
      const { rows } = await pool.query(
        "SELECT * FROM runs WHERE status = ANY($1) ORDER BY queued_at, id",
        [[...ACTIVE]],
      );
      const all = rows.map(toRow);
      return {
        running: all.filter((r) => r.status === "running").sort((a, b) => (a.startedAt?.getTime() ?? 0) - (b.startedAt?.getTime() ?? 0)),
        queued: all.filter((r) => r.status === "queued"),
      };
    },

    /** When runs with this rate key were created in the last `windowMs`. */
    async recentRunTimes(rateKey: string, windowMs: number): Promise<number[]> {
      const { rows } = await pool.query(
        `SELECT queued_at FROM runs WHERE rate_key = $1 AND queued_at > now() - make_interval(secs => $2)
          ORDER BY queued_at`,
        [rateKey, windowMs / 1000],
      );
      return rows.map((r) => (r.queued_at as Date).getTime());
    },

    /** Delete finished runs (and their events) older than `ageMs`. */
    async prune(ageMs: number): Promise<number> {
      const { rowCount } = await pool.query(
        `DELETE FROM runs WHERE status IN ('done', 'error', 'cancelled')
           AND finished_at < now() - make_interval(secs => $1)`,
        [ageMs / 1000],
      );
      return rowCount ?? 0;
    },
  };

  async function appendOnce(runId: string, kind: string, payload: unknown): Promise<number> {
    const { rows } = await pool.query(
      `WITH ins AS (
         INSERT INTO run_events (run_id, seq, kind, payload)
         VALUES ($1, (SELECT coalesce(max(seq), 0) + 1 FROM run_events WHERE run_id = $1), $2, $3)
         RETURNING run_id, seq)
       SELECT seq, pg_notify($4, run_id) FROM ins`,
      [runId, kind, JSON.stringify(payload ?? null), RUN_EVENTS_CHANNEL],
    );
    return rows[0]!.seq as number;
  }

  async function positionInTx(client: PoolClient, runId: string): Promise<number | null> {
    const { rows } = await client.query(
      `SELECT pos FROM (
         SELECT id, row_number() OVER (ORDER BY queued_at, id) AS pos FROM runs WHERE status = 'queued'
       ) q WHERE id = $1`,
      [runId],
    );
    return rows[0] ? Number(rows[0].pos) : null;
  }
}

export type RunStore = ReturnType<typeof createRunStore>;
