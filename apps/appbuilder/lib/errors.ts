export class NotFoundError extends Error {
  constructor(entity: string, id: string) {
    super(`${entity} ${id} not found`);
    this.name = "NotFoundError";
  }
}

export class ForbiddenError extends Error {
  constructor(message = "Actor is not authorized for this app") {
    super(message);
    this.name = "ForbiddenError";
  }
}

export class ConflictError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ConflictError";
  }
}

/**
 * Optimistic-concurrency conflict: the caller's `baseVersionNumber` no
 * longer matches the draft's actual current version — someone else's edit
 * landed first. Carries enough for the caller to refresh and retry;
 * neither user's work is lost (the stale write is simply never applied).
 */
export class StaleVersionError extends ConflictError {
  constructor(
    public readonly currentVersionNumber: number,
    public readonly baseVersionNumber: number,
  ) {
    super(
      `Specification has moved on: base version ${baseVersionNumber} is stale, current version is ${currentVersionNumber}`,
    );
    this.name = "StaleVersionError";
  }
}

/** A structural/semantic validation failure from the pure operation engine. */
export class OperationValidationError extends Error {
  constructor(public readonly errors: Array<{ path: (string | number)[]; code: string; message: string }>) {
    super(`Operation failed validation: ${errors.map((e) => e.message).join("; ")}`);
    this.name = "OperationValidationError";
  }
}

/**
 * The engine classified this change as destructive and the caller did not
 * pass `confirmDestructive: true`. Nothing was persisted.
 */
export class DestructiveConfirmationRequiredError extends ConflictError {
  constructor(public readonly destructive: { classification: string; details: string[] }) {
    super(`This change (${destructive.classification}) is destructive and requires explicit confirmation`);
    this.name = "DestructiveConfirmationRequiredError";
  }
}

/** No safe inverse exists for the operation being undone — use restoreVersion instead. */
export class RestoreRequiredError extends Error {
  constructor(message = "No safe inverse exists for this operation; restore an earlier version instead") {
    super(message);
    this.name = "RestoreRequiredError";
  }
}
