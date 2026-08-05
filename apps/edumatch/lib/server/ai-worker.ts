/**
 * Phase 2.2 — AI worker entry point.
 *
 * This file is intended to be run as a standalone Node.js process for
 * background job processing. In development you can skip this and use the
 * synchronous streaming endpoint; in production run:
 *
 *   npx tsx lib/server/ai-worker.ts
 *
 * Or via PM2 / Docker sidecar.
 */

import { createAiWorker } from "./queue";
import { orchestrateResponse } from "./ai-orchestrator";

const worker = createAiWorker(async (job) => {
  const { inquiryId, studentId, forceProvider } = job.data;
  console.log(`[AI Worker] Processing inquiry ${inquiryId} for student ${studentId}`);

  const start = Date.now();
  const result = await orchestrateResponse(inquiryId, forceProvider);
  const latencyMs = Date.now() - start;

  if ("error" in result) {
    console.error(`[AI Worker] Failed inquiry ${inquiryId}: ${result.error}`);
    return {
      success: false,
      inquiryId,
      error: result.error,
      latencyMs,
    };
  }

  console.log(
    `[AI Worker] Completed inquiry ${inquiryId} via ${result.provider} (${result.model}) in ${latencyMs}ms`,
  );
  return {
    success: true,
    inquiryId,
    responseId: result.responseId,
    provider: result.provider,
    model: result.model,
    promptTokens: result.promptTokens,
    completionTokens: result.completionTokens,
    totalTokens: result.totalTokens,
    latencyMs,
  };
});

if (worker) {
  console.log("[AI Worker] Started and listening for jobs...");

  process.on("SIGTERM", async () => {
    console.log("[AI Worker] SIGTERM received, closing...");
    await worker.close();
    process.exit(0);
  });
} else {
  console.error("[AI Worker] Redis not configured. Set REDIS_URL to start worker.");
  process.exit(1);
}
