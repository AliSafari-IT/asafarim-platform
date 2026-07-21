import { z } from "zod";
import { LIMITS } from "./constants";

/**
 * Stable opaque identifiers. Every entity/field/page/component/role/... is
 * referenced *only* by one of these — never by its mutable display name.
 * The format (lowercase, alnum/underscore/hyphen, bounded length) exists so
 * a raw string can never smuggle a script/SQL payload through an id field;
 * it carries no semantic meaning beyond "a stable slug".
 */
const idPattern = /^[a-z][a-z0-9_-]*$/;

export const StableId = z
  .string()
  .min(1)
  .max(LIMITS.MAX_ID_LENGTH)
  .regex(idPattern, "must be lowercase letters, digits, underscore, or hyphen, starting with a letter");

export type StableIdType = z.infer<typeof StableId>;

/** A human-facing name — freely editable, never used as a reference key. */
export const DisplayName = z.string().min(1).max(LIMITS.MAX_NAME_LENGTH);

export const MachineName = StableId;
