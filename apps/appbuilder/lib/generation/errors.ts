import { ProviderError, type ProviderErrorCode } from "@asafarim/appbuilder-ai";
import type { generationJobFailureCodeEnum } from "../db/schema";
import {
  ConflictError,
  DestructiveConfirmationRequiredError,
  ForbiddenError,
  NotFoundError,
  OperationValidationError,
  StaleVersionError,
} from "../errors";

export type GenerationJobFailureCode = (typeof generationJobFailureCodeEnum.enumValues)[number];

/**
 * A generation job failure carrying both the closed, stable classification
 * (persisted on `generation_jobs.failure_code`, safe to branch UI/retry
 * logic on) and a safe user-facing message (persisted on `failure_message`,
 * never a raw stack trace, provider error string, or SQL detail). Detailed
 * operator diagnostics belong in structured logs (redacted via
 * @asafarim/appbuilder-ai's redact.ts), never on this row.
 */
export class GenerationJobError extends Error {
  readonly code: GenerationJobFailureCode;
  readonly retryable: boolean;

  constructor(code: GenerationJobFailureCode, safeMessage: string, options?: { retryable?: boolean; cause?: unknown }) {
    super(safeMessage, options?.cause !== undefined ? { cause: options.cause } : undefined);
    this.name = "GenerationJobError";
    this.code = code;
    this.retryable = options?.retryable ?? RETRYABLE_FAILURE_CODES.has(code);
  }
}

export const RETRYABLE_FAILURE_CODES: ReadonlySet<GenerationJobFailureCode> = new Set([
  "provider_rate_limit",
  "provider_unavailable",
  "worker_infrastructure_error",
]);

const PROVIDER_CODE_TO_FAILURE_CODE: Record<ProviderErrorCode, GenerationJobFailureCode> = {
  authentication_error: "provider_configuration_error",
  rate_limit: "provider_rate_limit",
  timeout: "provider_unavailable",
  unavailable: "provider_unavailable",
  malformed_response: "malformed_provider_response",
  invalid_request: "invalid_request",
  cancelled: "cancelled",
  unknown: "worker_infrastructure_error",
};

const SAFE_MESSAGES: Record<GenerationJobFailureCode, string> = {
  invalid_request: "The request could not be processed as submitted.",
  provider_configuration_error: "The AI provider is not configured correctly. An operator has been notified.",
  provider_rate_limit: "The AI provider is temporarily rate-limited. This will be retried automatically.",
  provider_unavailable: "The AI provider was temporarily unavailable. This will be retried automatically.",
  malformed_provider_response: "The AI provider returned an unexpected response. This will be retried automatically.",
  forbidden_operation: "The AI proposed a change outside what this platform allows, so it was rejected.",
  specification_validation_failed: "The proposed changes did not pass specification validation.",
  stale_base_version: "The application was edited elsewhere while generation was in progress.",
  authorization_lost: "You no longer have access to make changes to this application.",
  preview_failed: "The application was generated, but building its preview failed.",
  worker_infrastructure_error: "An internal error interrupted generation. An operator has been notified.",
  cancelled: "Generation was cancelled.",
};

export function safeFailureMessage(code: GenerationJobFailureCode): string {
  return SAFE_MESSAGES[code];
}

/**
 * Maps any error the pipeline might throw (a ProviderError from
 * @asafarim/appbuilder-ai, one of this app's own repository errors, or
 * anything else) onto a `GenerationJobError` with a stable, closed
 * classification — the only shape the pipeline ever persists to
 * `generation_jobs.failure_code`/`failure_message`. Never rethrows a raw
 * error as-is from the pipeline's top-level catch.
 */
export function classifyGenerationError(err: unknown): GenerationJobError {
  if (err instanceof GenerationJobError) return err;

  if (err instanceof ProviderError) {
    const code = PROVIDER_CODE_TO_FAILURE_CODE[err.code];
    return new GenerationJobError(code, safeFailureMessage(code), { cause: err });
  }

  if (err instanceof StaleVersionError) {
    return new GenerationJobError("stale_base_version", safeFailureMessage("stale_base_version"), { cause: err });
  }
  if (err instanceof DestructiveConfirmationRequiredError) {
    return new GenerationJobError("forbidden_operation", safeFailureMessage("forbidden_operation"), { cause: err });
  }
  if (err instanceof OperationValidationError) {
    return new GenerationJobError(
      "specification_validation_failed",
      safeFailureMessage("specification_validation_failed"),
      { cause: err },
    );
  }
  if (err instanceof ForbiddenError || err instanceof NotFoundError) {
    return new GenerationJobError("authorization_lost", safeFailureMessage("authorization_lost"), { cause: err });
  }
  if (err instanceof ConflictError) {
    return new GenerationJobError("stale_base_version", safeFailureMessage("stale_base_version"), { cause: err });
  }

  return new GenerationJobError("worker_infrastructure_error", safeFailureMessage("worker_infrastructure_error"), {
    cause: err,
  });
}
