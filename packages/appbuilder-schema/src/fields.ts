import { z } from "zod";
import { StableId, DisplayName } from "./ids";
import { LIMITS } from "./constants";

const SelectOption = z.object({
  value: StableId,
  label: DisplayName,
});
export type SelectOptionType = z.infer<typeof SelectOption>;

const baseField = {
  id: StableId,
  machineName: StableId,
  name: DisplayName,
  description: z.string().max(LIMITS.MAX_SHORT_TEXT_LENGTH).optional(),
  required: z.boolean().default(false),
  unique: z.boolean().default(false),
  archived: z.boolean().default(false),
};

const TextField = z.object({
  ...baseField,
  type: z.literal("text"),
  maxLength: z.number().int().positive().max(LIMITS.MAX_SHORT_TEXT_LENGTH).optional(),
});

const LongTextField = z.object({
  ...baseField,
  type: z.literal("longText"),
  maxLength: z.number().int().positive().max(LIMITS.MAX_LONG_TEXT_LENGTH).optional(),
});

const IntegerField = z.object({
  ...baseField,
  type: z.literal("integer"),
  min: z.number().int().optional(),
  max: z.number().int().optional(),
});

const DecimalField = z.object({
  ...baseField,
  type: z.literal("decimal"),
  min: z.number().optional(),
  max: z.number().optional(),
  decimalPlaces: z.number().int().min(0).max(10).default(2),
});

const BooleanField = z.object({
  ...baseField,
  type: z.literal("boolean"),
  defaultValue: z.boolean().default(false),
});

const DateField = z.object({
  ...baseField,
  type: z.literal("date"),
});

const DateTimeField = z.object({
  ...baseField,
  type: z.literal("datetime"),
});

const SelectField = z.object({
  ...baseField,
  type: z.literal("select"),
  multiple: z.boolean().default(false),
  options: z.array(SelectOption).min(1).max(LIMITS.MAX_SELECT_OPTIONS),
});

const EmailField = z.object({
  ...baseField,
  type: z.literal("email"),
});

const UrlField = z.object({
  ...baseField,
  type: z.literal("url"),
});

/** References a top-level `Relation` record (see relations.ts) — never inlines its own target/cardinality. */
const RelationField = z.object({
  ...baseField,
  type: z.literal("relation"),
  relationId: StableId,
});

const FileField = z.object({
  ...baseField,
  type: z.literal("file"),
  maxSizeMb: z.number().positive().max(1000).optional(),
  acceptedMimeTypes: z.array(z.string().max(100)).max(50).optional(),
});

const ImageField = z.object({
  ...baseField,
  type: z.literal("image"),
  maxSizeMb: z.number().positive().max(1000).optional(),
});

/**
 * The bounded MVP field-type union — see constants.ts#FIELD_TYPES. Adding a
 * new type is a schema-version-bumping change, never a silent extension.
 */
export const Field = z.discriminatedUnion("type", [
  TextField,
  LongTextField,
  IntegerField,
  DecimalField,
  BooleanField,
  DateField,
  DateTimeField,
  SelectField,
  EmailField,
  UrlField,
  RelationField,
  FileField,
  ImageField,
]);

export type FieldType = z.infer<typeof Field>;
