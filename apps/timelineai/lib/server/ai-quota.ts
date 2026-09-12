import "server-only";
import { getRedis } from "./redis";
import { checkRateLimit } from "../rate-limit";

/**
 * AI generation quota, keyed by user id (or guest hash). Unlike guest
 * content rate limits (guest-rate-limit.ts), which fail OPEN so an
 * unrelated Redis outage never blocks core timeline editing, this fails
 * CLOSED — AI calls are billable, and spec §"fails closed with an honest
 * degraded state" applies to the whole AI boundary, not just missing
 * provider config.
 */
const AI_GENERATION_LIMIT = { limit: 20, windowSeconds: 60 * 60 }; // 20 generations/hour/identity

export class AiQuotaExceededError extends Error {
  readonly status = 429;
  constructor(public readonly retryAfterMs: number) {
    super("You've reached the AI generation limit for now. Please try again later.");
    this.name = "AiQuotaExceededError";
  }
}

export class AiUnavailableError extends Error {
  readonly status = 503;
  constructor(message = "AI features are temporarily unavailable. Please try again shortly.") {
    super(message);
    this.name = "AiUnavailableError";
  }
}

const CHECK_TIMEOUT_MS = 1500;

export async function enforceAiQuota(identity: string): Promise<void> {
  let result;
  try {
    result = await Promise.race([
      checkRateLimit(getRedis(), "ai_generate", identity, AI_GENERATION_LIMIT),
      new Promise<never>((_, reject) =>
        setTimeout(() => reject(new Error("AI quota check timed out")), CHECK_TIMEOUT_MS)
      ),
    ]);
  } catch (error) {
    console.error("[timelineai] AI quota check failed, failing closed:", error);
    throw new AiUnavailableError();
  }
  if (!result.allowed) {
    throw new AiQuotaExceededError(result.retryAfterMs);
  }
}
