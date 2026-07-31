import { NextResponse } from "next/server";
import {
  ConflictError,
  DestructiveConfirmationRequiredError,
  ForbiddenError,
  NotFoundError,
  OperationValidationError,
  RestoreRequiredError,
  StaleVersionError,
} from "../errors";
import {
  ConfirmationExpiredError,
  ConfirmationInvalidError,
} from "../repositories/modificationJobs";
import {
  RepairConfirmationExpiredError,
  RepairConfirmationInvalidError,
} from "../repositories/repairAttempts";
import {
  InvalidSelectionError,
  StaleSelectionError,
} from "../modification/selectionContext";
import {
  RecordValidationError,
  StaleRecordRevisionError,
  UniqueConstraintError,
} from "../generated-data/records";
import {
  FileTooLargeError,
  SignedLinkExpiredError,
  UnsupportedMimeTypeError,
} from "../generated-data/files";
import { RuntimePermissionDeniedError } from "../generated-data/runtimeAuth";
import {
  AttachmentAlreadyClaimedError,
  AttachmentMismatchError,
  AttachmentNotReadyError,
  AttachmentScanFailedError,
  AttachmentTooLargeError,
  TooManyAttachmentsError,
  UnsupportedAttachmentTypeError,
} from "../attachments/errors";
import {
  ReferenceFetchFailedError,
  ReferenceNoContentError,
  ReferenceRateLimitedError,
  ReferenceTimeoutError,
  ReferenceTooLargeError,
  ReferenceTooManyRedirectsError,
  ReferenceUrlNotAllowedError,
  UnsupportedReferenceContentTypeError,
} from "../references/errors";
import {
  ReleaseNotEligibleError,
  StaleApprovalError,
} from "../deployment/errors";
import { QuotaExceededError } from "../quotas/errors";
import { CustomDomainsDisabledError } from "../customDomains/requests";
import { FeatureDisabledError } from "../features/errors";

/**
 * Maps a repository error to the right JSON status — never HTML for API
 * routes, never a raw stack trace/SQL detail/provider response body. The
 * more specific M04/M08 error subclasses are checked before their generic
 * base class (ConflictError/NotFoundError) so the client gets an actionable
 * `code` and structured payload (destructive classification, version
 * numbers, validation issues) instead of just a message string to parse.
 */
export function errorResponse(err: unknown): NextResponse {
  if (err instanceof InvalidSelectionError) {
    return NextResponse.json(
      { error: err.message, code: "invalid_selection" },
      { status: 404 }
    );
  }
  if (err instanceof NotFoundError) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }
  if (err instanceof RuntimePermissionDeniedError) {
    return NextResponse.json(
      { error: err.message, code: "runtime_permission_denied" },
      { status: 403 }
    );
  }
  if (err instanceof ForbiddenError) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  if (err instanceof RecordValidationError) {
    return NextResponse.json(
      {
        error: err.message,
        code: "record_validation_failed",
        errors: err.errors,
      },
      { status: 400 }
    );
  }
  if (err instanceof StaleRecordRevisionError) {
    return NextResponse.json(
      {
        error: err.message,
        code: "stale_revision",
        currentRevision: err.currentRevision,
        baseRevision: err.baseRevision,
      },
      { status: 409 }
    );
  }
  if (err instanceof UniqueConstraintError) {
    return NextResponse.json(
      { error: err.message, code: "unique_constraint" },
      { status: 409 }
    );
  }
  if (
    err instanceof FileTooLargeError ||
    err instanceof UnsupportedMimeTypeError ||
    err instanceof AttachmentTooLargeError ||
    err instanceof UnsupportedAttachmentTypeError
  ) {
    return NextResponse.json(
      { error: err.message, code: "invalid_file" },
      { status: 400 }
    );
  }
  if (err instanceof AttachmentMismatchError) {
    return NextResponse.json(
      { error: err.message, code: "attachment_mismatch" },
      { status: 400 }
    );
  }
  if (err instanceof AttachmentAlreadyClaimedError) {
    return NextResponse.json(
      { error: err.message, code: "attachment_already_claimed" },
      { status: 409 }
    );
  }
  if (err instanceof AttachmentNotReadyError) {
    return NextResponse.json(
      { error: err.message, code: "attachment_not_ready" },
      { status: 409 }
    );
  }
  if (err instanceof AttachmentScanFailedError) {
    return NextResponse.json(
      { error: err.message, code: "attachment_scan_failed" },
      { status: 409 }
    );
  }
  if (err instanceof TooManyAttachmentsError) {
    return NextResponse.json(
      { error: err.message, code: "too_many_attachments" },
      { status: 400 }
    );
  }
  if (err instanceof SignedLinkExpiredError) {
    return NextResponse.json(
      { error: err.message, code: "link_expired" },
      { status: 410 }
    );
  }
  if (err instanceof OperationValidationError) {
    return NextResponse.json(
      {
        error: err.message,
        code: "operation_validation_failed",
        errors: err.errors,
      },
      { status: 400 }
    );
  }
  if (err instanceof DestructiveConfirmationRequiredError) {
    return NextResponse.json(
      {
        error: err.message,
        code: "destructive_confirmation_required",
        destructive: err.destructive,
      },
      { status: 409 }
    );
  }
  if (err instanceof RestoreRequiredError) {
    return NextResponse.json(
      { error: err.message, code: "restore_required" },
      { status: 409 }
    );
  }
  if (err instanceof StaleSelectionError) {
    return NextResponse.json(
      { error: err.message, code: "stale_selection" },
      { status: 409 }
    );
  }
  if (err instanceof StaleVersionError) {
    return NextResponse.json(
      {
        error: err.message,
        code: "stale_version",
        currentVersionNumber: err.currentVersionNumber,
        baseVersionNumber: err.baseVersionNumber,
      },
      { status: 409 }
    );
  }
  if (err instanceof ConfirmationExpiredError) {
    return NextResponse.json(
      { error: err.message, code: "confirmation_expired" },
      { status: 409 }
    );
  }
  if (err instanceof ConfirmationInvalidError) {
    return NextResponse.json(
      { error: err.message, code: "confirmation_invalid" },
      { status: 409 }
    );
  }
  if (err instanceof RepairConfirmationExpiredError) {
    return NextResponse.json(
      { error: err.message, code: "confirmation_expired" },
      { status: 409 }
    );
  }
  if (err instanceof RepairConfirmationInvalidError) {
    return NextResponse.json(
      { error: err.message, code: "confirmation_invalid" },
      { status: 409 }
    );
  }
  if (err instanceof ReleaseNotEligibleError) {
    return NextResponse.json(
      {
        error: err.message,
        code: "release_not_eligible",
        reasons: err.reasons,
      },
      { status: 409 }
    );
  }
  if (err instanceof StaleApprovalError) {
    return NextResponse.json(
      { error: err.message, code: "stale_approval", reasons: err.reasons },
      { status: 409 }
    );
  }
  // M13 slice F — reference import. Every one of these is a 4xx about the
  // URL the caller supplied, never a 5xx: a refused destination, an oversize
  // page, or a rate-limited third party are all expected outcomes of letting
  // someone name an arbitrary public address. The `code` is what the composer
  // branches on; the message is already safe (lib/references/errors.ts) and
  // deliberately never names a resolved address.
  if (err instanceof ReferenceUrlNotAllowedError) {
    return NextResponse.json(
      { error: err.message, code: "reference_url_not_allowed" },
      { status: 400 }
    );
  }
  if (err instanceof UnsupportedReferenceContentTypeError) {
    return NextResponse.json(
      { error: err.message, code: "reference_unsupported_content" },
      { status: 415 }
    );
  }
  if (err instanceof ReferenceTooLargeError) {
    return NextResponse.json(
      { error: err.message, code: "reference_too_large" },
      { status: 413 }
    );
  }
  if (err instanceof ReferenceTooManyRedirectsError) {
    return NextResponse.json(
      { error: err.message, code: "reference_too_many_redirects" },
      { status: 502 }
    );
  }
  if (err instanceof ReferenceTimeoutError) {
    return NextResponse.json(
      { error: err.message, code: "reference_timeout" },
      { status: 504 }
    );
  }
  if (err instanceof ReferenceRateLimitedError) {
    return NextResponse.json(
      {
        error: err.message,
        code: "reference_rate_limited",
        retryAfterSeconds: err.retryAfterSeconds,
      },
      {
        status: 429,
        headers: err.retryAfterSeconds
          ? { "retry-after": String(err.retryAfterSeconds) }
          : undefined,
      }
    );
  }
  if (err instanceof ReferenceNoContentError) {
    return NextResponse.json(
      { error: err.message, code: "reference_no_content" },
      { status: 422 }
    );
  }
  if (err instanceof ReferenceFetchFailedError) {
    return NextResponse.json(
      { error: err.message, code: "reference_fetch_failed" },
      { status: 502 }
    );
  }
  if (err instanceof CustomDomainsDisabledError) {
    return NextResponse.json(
      { error: err.message, code: "custom_domains_disabled" },
      { status: 409 }
    );
  }
  // M13 slice G. `feature` is returned so the composer can disable exactly
  // the one affected control rather than showing a generic error and leaving
  // the user to discover by trial which action is unavailable.
  if (err instanceof FeatureDisabledError) {
    return NextResponse.json(
      { error: err.message, code: "feature_disabled", feature: err.flag },
      { status: 409 }
    );
  }
  if (err instanceof QuotaExceededError) {
    return NextResponse.json(
      {
        error: err.message,
        code: "quota_exceeded",
        metric: err.metric,
        limit: err.limit,
        current: err.current,
      },
      { status: 429 }
    );
  }
  if (err instanceof ConflictError) {
    return NextResponse.json(
      { error: err.message, code: "conflict" },
      { status: 409 }
    );
  }
  console.error("[appbuilder][api]", err);
  return NextResponse.json({ error: "Internal server error" }, { status: 500 });
}

export function unauthorized(): NextResponse {
  return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
}
