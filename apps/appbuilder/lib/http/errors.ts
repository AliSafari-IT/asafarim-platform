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
import { ConfirmationExpiredError, ConfirmationInvalidError } from "../repositories/modificationJobs";
import { RepairConfirmationExpiredError, RepairConfirmationInvalidError } from "../repositories/repairAttempts";
import { InvalidSelectionError, StaleSelectionError } from "../modification/selectionContext";
import { RecordValidationError, StaleRecordRevisionError, UniqueConstraintError } from "../generated-data/records";
import { FileTooLargeError, SignedLinkExpiredError, UnsupportedMimeTypeError } from "../generated-data/files";
import { RuntimePermissionDeniedError } from "../generated-data/runtimeAuth";
import { ReleaseNotEligibleError, StaleApprovalError } from "../deployment/errors";

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
    return NextResponse.json({ error: err.message, code: "invalid_selection" }, { status: 404 });
  }
  if (err instanceof NotFoundError) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }
  if (err instanceof RuntimePermissionDeniedError) {
    return NextResponse.json({ error: err.message, code: "runtime_permission_denied" }, { status: 403 });
  }
  if (err instanceof ForbiddenError) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  if (err instanceof RecordValidationError) {
    return NextResponse.json({ error: err.message, code: "record_validation_failed", errors: err.errors }, { status: 400 });
  }
  if (err instanceof StaleRecordRevisionError) {
    return NextResponse.json(
      { error: err.message, code: "stale_revision", currentRevision: err.currentRevision, baseRevision: err.baseRevision },
      { status: 409 },
    );
  }
  if (err instanceof UniqueConstraintError) {
    return NextResponse.json({ error: err.message, code: "unique_constraint" }, { status: 409 });
  }
  if (err instanceof FileTooLargeError || err instanceof UnsupportedMimeTypeError) {
    return NextResponse.json({ error: err.message, code: "invalid_file" }, { status: 400 });
  }
  if (err instanceof SignedLinkExpiredError) {
    return NextResponse.json({ error: err.message, code: "link_expired" }, { status: 410 });
  }
  if (err instanceof OperationValidationError) {
    return NextResponse.json({ error: err.message, code: "operation_validation_failed", errors: err.errors }, { status: 400 });
  }
  if (err instanceof DestructiveConfirmationRequiredError) {
    return NextResponse.json(
      { error: err.message, code: "destructive_confirmation_required", destructive: err.destructive },
      { status: 409 },
    );
  }
  if (err instanceof RestoreRequiredError) {
    return NextResponse.json({ error: err.message, code: "restore_required" }, { status: 409 });
  }
  if (err instanceof StaleSelectionError) {
    return NextResponse.json({ error: err.message, code: "stale_selection" }, { status: 409 });
  }
  if (err instanceof StaleVersionError) {
    return NextResponse.json(
      {
        error: err.message,
        code: "stale_version",
        currentVersionNumber: err.currentVersionNumber,
        baseVersionNumber: err.baseVersionNumber,
      },
      { status: 409 },
    );
  }
  if (err instanceof ConfirmationExpiredError) {
    return NextResponse.json({ error: err.message, code: "confirmation_expired" }, { status: 409 });
  }
  if (err instanceof ConfirmationInvalidError) {
    return NextResponse.json({ error: err.message, code: "confirmation_invalid" }, { status: 409 });
  }
  if (err instanceof RepairConfirmationExpiredError) {
    return NextResponse.json({ error: err.message, code: "confirmation_expired" }, { status: 409 });
  }
  if (err instanceof RepairConfirmationInvalidError) {
    return NextResponse.json({ error: err.message, code: "confirmation_invalid" }, { status: 409 });
  }
  if (err instanceof ReleaseNotEligibleError) {
    return NextResponse.json({ error: err.message, code: "release_not_eligible", reasons: err.reasons }, { status: 409 });
  }
  if (err instanceof StaleApprovalError) {
    return NextResponse.json({ error: err.message, code: "stale_approval", reasons: err.reasons }, { status: 409 });
  }
  if (err instanceof ConflictError) {
    return NextResponse.json({ error: err.message, code: "conflict" }, { status: 409 });
  }
  console.error("[appbuilder][api]", err);
  return NextResponse.json({ error: "Internal server error" }, { status: 500 });
}

export function unauthorized(): NextResponse {
  return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
}
