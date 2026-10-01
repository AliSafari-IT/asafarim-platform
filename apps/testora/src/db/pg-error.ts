/**
 * Postgres SQLSTATE lookup for errors thrown by drizzle queries.
 *
 * Since drizzle-orm 0.44 a failed query throws a `DrizzleQueryError` whose
 * `cause` is the node-postgres error carrying the SQLSTATE `code`; checking
 * `error.code` on the thrown error alone silently stops matching. This walks
 * the cause chain so both the wrapped and the bare shapes work.
 */

const PG_UNIQUE_VIOLATION = "23505";
const PG_FOREIGN_KEY_VIOLATION = "23503";

const MAX_CAUSE_DEPTH = 5;

export function pgErrorCode(error: unknown): string | undefined {
  let current = error;
  for (let depth = 0; depth < MAX_CAUSE_DEPTH; depth++) {
    if (typeof current !== "object" || current === null) return undefined;
    const code = (current as { code?: unknown }).code;
    if (typeof code === "string") return code;
    current = (current as { cause?: unknown }).cause;
  }
  return undefined;
}

export function isUniqueViolation(error: unknown): boolean {
  return pgErrorCode(error) === PG_UNIQUE_VIOLATION;
}

export function isForeignKeyViolation(error: unknown): boolean {
  return pgErrorCode(error) === PG_FOREIGN_KEY_VIOLATION;
}
