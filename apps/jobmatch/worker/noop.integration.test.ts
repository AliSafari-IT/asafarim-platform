import { describe, expect, it } from "vitest";
import { Queue, Worker } from "bullmq";
import IORedis from "ioredis";
import { JOB, QUEUE } from "./queues";

/**
 * Smoke test proving the `noop` job round-trips through
 * enqueue -> process -> complete against a real Redis, per issue #246's
 * acceptance criteria. Skipped when no `REDIS_URL` is configured (mirrors
 * apps/tasks-ai/lib/db/readiness.integration.test.ts's skipIf-on-missing-env
 * pattern) rather than requiring Redis in every sandbox — CI's services
 * block or a developer's local `pnpm db:up` supply it when this needs to
 * actually run.
 */
describe.skipIf(!process.env.REDIS_URL)("noop job (integration)", () => {
  it("round-trips through the maintenance queue", async () => {
    const connection = new IORedis(process.env.REDIS_URL as string, {
      maxRetriesPerRequest: null,
    });
    const queueName = `${QUEUE.maintenance}.test.${Date.now()}`;
    const queue = new Queue(queueName, { connection });

    const completed = new Promise<unknown>((resolve, reject) => {
      const worker = new Worker(
        queueName,
        async (job) => {
          if (job.name !== JOB.noop) return undefined;
          return { ok: true, jobId: job.id };
        },
        { connection },
      );
      worker.on("completed", (job, result) => {
        void worker.close().then(() => resolve(result));
      });
      worker.on("failed", (job, err) => {
        void worker.close().then(() => reject(err));
      });
    });

    await queue.add(JOB.noop, {}, { removeOnComplete: true, removeOnFail: true });
    const result = await completed;
    expect(result).toMatchObject({ ok: true });

    await queue.close();
    await connection.quit();
  }, 15_000);
});
