import { z } from "zod";
import { StableId, DisplayName } from "./ids";
import { Field } from "./fields";
import { LIMITS } from "./constants";

export const Index = z.object({
  id: StableId,
  name: DisplayName,
  fieldIds: z.array(StableId).min(1).max(LIMITS.MAX_FIELDS_PER_ENTITY),
  unique: z.boolean().default(false),
});
export type IndexType = z.infer<typeof Index>;

export const Entity = z.object({
  id: StableId,
  machineName: StableId,
  name: DisplayName,
  description: z.string().max(LIMITS.MAX_SHORT_TEXT_LENGTH).optional(),
  fields: z.array(Field).max(LIMITS.MAX_FIELDS_PER_ENTITY),
  indexes: z.array(Index).max(LIMITS.MAX_INDEXES_PER_ENTITY).default([]),
  archived: z.boolean().default(false),
});
export type EntityType = z.infer<typeof Entity>;
