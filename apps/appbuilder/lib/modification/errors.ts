import { ProviderError, type ProviderErrorCode } from "@asafarim/appbuilder-ai";
import type { modificationJobFailureCodeEnum } from "../db/schema";
import {
  ConflictError,
  DestructiveConfirmationRequiredError,
  ForbiddenError,
  NotFoundError,
  OperationValidationError,
  StaleVersionError,
} from "../errors";

export type ModificationJobFailureCode = (typeof modificationJobFailureCodeEnum.enumValues)[number];

/**
 * Mirrors lib/generation/errors.ts#GenerationJobError for modification
 * jobs: a stable, closed classification (persisted on
 * modification_jobs.failure_code) plus a safe user-facing message — never a
 * raw stack trace, provider error string, or SQL detail.
 */
export class ModificationJobError extends Error {
  readonly code: ModificationJobFailureCode;
  readonly retryable: boolean;

  constructor(code: ModificationJobFailureCode, safeMessage: string, options?: { retryable?: boolean; cause?: unknown }) {
    super(safeMessage, options?.cause !== undefined ? { cause: options.cause } : undefined);
    this.name = "ModificationJobError";
    this.code = code;
    this.retryable = options?.retryable ?? RETRYABLE_FAILURE_CODES.has(code);
  }
}

export const RETRYABLE_FAILURE_CODES: ReadonlySet<ModificationJobFailureCode> = new Set([
  "provider_rate_limit",
  "provider_unavailable",
  "worker_infrastructure_error",
]);

const PROVIDER_CODE_TO_FAILURE_CODE: Record<ProviderErrorCode, ModificationJobFailureCode> = {
  authentication_error: "provider_configuration_error",
  rate_limit: "provider_rate_limit",
  timeout: "provider_unavailable",
  unavailable: "provider_unavailable",
  malformed_response: "malformed_provider_response",
  invalid_request: "invalid_request",
  cancelled: "cancelled",
  unknown: "worker_infrastructure_error",
};

const SAFE_MESSAGES: Record<ModificationJobFailureCode, string> = {
  invalid_request: "The request could not be processed as submitted.",
  provider_configuration_error: "The AI provider is not configured correctly. An operator has been notified.",
  provider_rate_limit: "The AI provider is temporarily rate-limited. This will be retried automatically.",
  provider_unavailable: "The AI provider was temporarily unavailable. This will be retried automatically.",
  malformed_provider_response: "The AI provider returned an unexpected response. This will be retried automatically.",
  forbidden_operation: "The AI proposed a change outside what this platform allows, so it was rejected.",
  specification_validation_failed: "The proposed change did not pass specification validation.",
  stale_base_version: "The application was edited elsewhere while this change was in progress. Refresh to see the latest version and try again.",
  authorization_lost: "You no longer have access to make changes to this application.",
  preview_failed: "The change was applied, but building its preview failed.",
  confirmation_expired: "The confirmation window for this change expired. Ask again to get a fresh proposal.",
  confirmation_invalid: "This confirmation could not be verified and was not applied.",
  worker_infrastructure_error: "An internal error interrupted this change. An operator has been notified.",
  cancelled: "This change was cancelled.",
};

export function safeFailureMessage(code: ModificationJobFailureCode): string {
  return SAFE_MESSAGES[code];
}

/**
 * Maps any error the modification pipeline might throw onto a
 * ModificationJobError with a stable, closed classification — the only
 * shape ever persisted to modification_jobs.failure_code/failure_message.
 */
export function classifyModificationError(err: unknown): ModificationJobError {
  if (err instanceof ModificationJobError) return err;

  if (err instanceof ProviderError) {
    const code = PROVIDER_CODE_TO_FAILURE_CODE[err.code];
    return new ModificationJobError(code, safeFailureMessage(code), { cause: err });
  }

  if (err instanceof StaleVersionError) {
    return new ModificationJobError("stale_base_version", safeFailureMessage("stale_base_version"), { cause: err });
  }
  if (err instanceof DestructiveConfirmationRequiredError) {
    return new ModificationJobError("forbidden_operation", safeFailureMessage("forbidden_operation"), { cause: err });
  }
  if (err instanceof OperationValidationError) {
    return new ModificationJobError(
      "specification_validation_failed",
      safeFailureMessage("specification_validation_failed"),
      { cause: err },
    );
  }
  if (err instanceof ForbiddenError || err instanceof NotFoundError) {
    return new ModificationJobError("authorization_lost", safeFailureMessage("authorization_lost"), { cause: err });
  }
  if (err instanceof ConflictError) {
    return new ModificationJobError("stale_base_version", safeFailureMessage("stale_base_version"), { cause: err });
  }

  return new ModificationJobError("worker_infrastructure_error", safeFailureMessage("worker_infrastructure_error"), {
    cause: err,
  });
}
