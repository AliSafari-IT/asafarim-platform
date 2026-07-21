import { z } from "zod";
import { StableId, DisplayName } from "./ids";
import { RELATION_CARDINALITIES, RELATION_DELETE_BEHAVIORS } from "./constants";

/**
 * A named relationship between two entities. A `relation`-typed field
 * (see fields.ts) points at one of these by `relationId` instead of
 * inlining its own target/cardinality/delete-behavior — one record
 * describes the whole relationship, referenced from whichever side(s)
 * need a field for it.
 */
export const Relation = z.object({
  id: StableId,
  name: DisplayName,
  fromEntityId: StableId,
  toEntityId: StableId,
  cardinality: z.enum(RELATION_CARDINALITIES),
  onDelete: z.enum(RELATION_DELETE_BEHAVIORS),
  archived: z.boolean().default(false),
});
export type RelationType = z.infer<typeof Relation>;
