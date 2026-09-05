/**
 * Stable, machine-readable error codes for /api/v1. The string values are
 * part of the API contract — never repurpose one. HTTP status is derived
 * from the code so handlers only choose the code.
 */
export const ERROR = {
  validation_failed: { status: 422, message: "The request body or query failed validation." },
  unauthenticated: { status: 401, message: "Authentication is required." },
  forbidden: { status: 403, message: "You do not have permission to perform this action." },
  not_found: { status: 404, message: "The resource does not exist or is not visible to you." },
  conflict_version: { status: 409, message: "The resource changed since you last read it." },
  conflict_unique: { status: 409, message: "A resource with these values already exists." },
  idempotency_mismatch: {
    status: 409,
    message: "This Idempotency-Key was used with a different request.",
  },
  rate_limited: { status: 429, message: "Too many requests. Retry after the indicated delay." },
  workspace_required: { status: 400, message: "A workspace context is required." },
  internal: { status: 500, message: "An unexpected error occurred." },
} as const;

export type ErrorCode = keyof typeof ERROR;

export class ApiError extends Error {
  readonly code: ErrorCode;
  readonly status: number;
  readonly details?: unknown;

  constructor(code: ErrorCode, details?: unknown, message?: string) {
    super(message ?? ERROR[code].message);
    this.name = "ApiError";
    this.code = code;
    this.status = ERROR[code].status;
    this.details = details;
  }

  toBody() {
    return {
      error: {
        code: this.code,
        message: this.message,
        ...(this.details === undefined ? {} : { details: this.details }),
      },
    };
  }
}

/** Narrow a Prisma known error to an ApiError where it maps cleanly. */
export function fromPrismaError(err: unknown): ApiError | undefined {
  if (typeof err !== "object" || err === null || !("code" in err)) return undefined;
  const code = (err as { code?: unknown }).code;
  if (code === "P2002") return new ApiError("conflict_unique");
  if (code === "P2025") return new ApiError("not_found");
  return undefined;
}
