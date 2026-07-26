import { ProviderError, type ProviderErrorCode } from "@asafarim/appbuilder-ai";
import type { repairJobFailureCodeEnum } from "../db/schema";
import {
  ConflictError,
  DestructiveConfirmationRequiredError,
  ForbiddenError,
  NotFoundError,
  OperationValidationError,
  StaleVersionError,
} from "../errors";

export type RepairJobFailureCode = (typeof repairJobFailureCodeEnum.enumValues)[number];

/** Mirrors lib/modification/errors.ts#ModificationJobError for repair attempts: a stable, closed classification plus a safe user-facing message. */
export class RepairJobError extends Error {
  readonly code: RepairJobFailureCode;
  readonly retryable: boolean;

  constructor(code: RepairJobFailureCode, safeMessage: string, options?: { retryable?: boolean; cause?: unknown }) {
    super(safeMessage, options?.cause !== undefined ? { cause: options.cause } : undefined);
    this.name = "RepairJobError";
    this.code = code;
    this.retryable = options?.retryable ?? RETRYABLE_FAILURE_CODES.has(code);
  }
}

export const RETRYABLE_FAILURE_CODES: ReadonlySet<RepairJobFailureCode> = new Set([
  "provider_rate_limit",
  "provider_unavailable",
  "worker_infrastructure_error",
]);

const PROVIDER_CODE_TO_FAILURE_CODE: Record<ProviderErrorCode, RepairJobFailureCode> = {
  authentication_error: "provider_configuration_error",
  rate_limit: "provider_rate_limit",
  timeout: "provider_unavailable",
  unavailable: "provider_unavailable",
  malformed_response: "malformed_provider_response",
  invalid_request: "invalid_request",
  cancelled: "cancelled",
  unknown: "worker_infrastructure_error",
};

const SAFE_MESSAGES: Record<RepairJobFailureCode, string> = {
  invalid_request: "The repair request could not be processed as submitted.",
  not_repairable: "This failure is not a supported, repairable configuration error.",
  provider_configuration_error: "The AI provider is not configured correctly. An operator has been notified.",
  provider_rate_limit: "The AI provider is temporarily rate-limited. This will be retried automatically.",
  provider_unavailable: "The AI provider was temporarily unavailable. This will be retried automatically.",
  malformed_provider_response: "The AI provider returned an unexpected response. This will be retried automatically.",
  forbidden_operation: "The AI proposed a change outside what this platform allows, so it was rejected.",
  specification_validation_failed: "The proposed repair did not pass specification validation.",
  stale_base_version: "The application was edited elsewhere while this repair was in progress. Refresh and try again.",
  authorization_lost: "You no longer have access to make changes to this application.",
  preview_failed: "The repair was applied, but building its preview failed.",
  confirmation_expired: "The confirmation window for this repair expired. Request the repair again for a fresh proposal.",
  confirmation_invalid: "This confirmation could not be verified and was not applied.",
  revalidation_failed: "The repair was applied, but the new version did not pass revalidation.",
  repair_budget_exhausted: "The maximum number of repair attempts for this validation run has been reached.",
  worker_infrastructure_error: "An internal error interrupted this repair. An operator has been notified.",
  cancelled: "This repair was cancelled.",
};

export function safeFailureMessage(code: RepairJobFailureCode): string {
  return SAFE_MESSAGES[code];
}

/** Maps any error the repair pipeline might throw onto a RepairJobError with a stable, closed classification. */
export function classifyRepairError(err: unknown): RepairJobError {
  if (err instanceof RepairJobError) return err;

  if (err instanceof ProviderError) {
    const code = PROVIDER_CODE_TO_FAILURE_CODE[err.code];
    return new RepairJobError(code, safeFailureMessage(code), { cause: err });
  }
  if (err instanceof StaleVersionError) {
    return new RepairJobError("stale_base_version", safeFailureMessage("stale_base_version"), { cause: err });
  }
  if (err instanceof DestructiveConfirmationRequiredError) {
    return new RepairJobError("forbidden_operation", safeFailureMessage("forbidden_operation"), { cause: err });
  }
  if (err instanceof OperationValidationError) {
    return new RepairJobError("specification_validation_failed", safeFailureMessage("specification_validation_failed"), { cause: err });
  }
  if (err instanceof ForbiddenError || err instanceof NotFoundError) {
    return new RepairJobError("authorization_lost", safeFailureMessage("authorization_lost"), { cause: err });
  }
  if (err instanceof ConflictError) {
    return new RepairJobError("stale_base_version", safeFailureMessage("stale_base_version"), { cause: err });
  }

  return new RepairJobError("worker_infrastructure_error", safeFailureMessage("worker_infrastructure_error"), { cause: err });
}
