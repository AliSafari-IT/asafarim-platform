import { zodResponseFormat } from "openai/helpers/zod";
import type { ZodType } from "zod";

/**
 * Bridges our domain zod schemas (which use plain `.optional()`, never
 * `.nullable()` — see docs on why `Operation` et al. are reused verbatim
 * from @asafarim/appbuilder-schema) to OpenAI's structured-outputs API,
 * which requires every property to be listed as "required" and rejects
 * `.optional()`'s encoding outright.
 *
 * `openai/helpers/zod`'s `zodResponseFormat` marks every property required
 * (as the API demands) but represents a plain `.optional()` field as
 * `{"anyOf": [{"not": {}}, <realSchema>]}` — a legacy trick meaning "this
 * branch matches nothing, i.e. the field is absent". The SDK itself warns
 * this is deprecated ("uses `.optional()` without `.nullable()`"), and
 * OpenAI's API now hard-rejects it: `400 In context=('anyOf','0','not'),
 * schema must have a 'type' key.`
 *
 * `toStrictJsonSchema` rewrites that `{"not": {}}` branch into `{"type":
 * "null"}` — the API-accepted way to express the same "may be absent"
 * intent (the model sends `null` instead of omitting the key).
 * `nullsToUndefinedDeep` then converts the model's `null`s back to
 * `undefined` before the response is validated against the original,
 * unmodified `.optional()` zod schema — so the schema used to talk to
 * OpenAI and the schema used to validate its answer can differ in this one
 * encoding detail without either one needing to change.
 *
 * Separately, any zod field with `.default(...)` that gets hoisted into
 * `definitions` (because the same shape repeats — e.g. `ProposedOperation`
 * inside an array) comes back from zod-to-json-schema as `{"$ref": "...",
 * "default": <value>}`. OpenAI's strict mode forbids any sibling keyword
 * next to `$ref` at all (`400 $ref cannot have keywords {'default'}`), so
 * this rewrites such nodes down to a bare `{"$ref": ...}` — the default
 * value is a client-side authoring convenience only; the model still emits
 * a real value for the field either way.
 *
 * The response is still sent with `strict: false`, not `true`. Structured
 * outputs' strict mode additionally requires *every* object schema to
 * enumerate a fixed `properties` list with `additionalProperties: false` —
 * fundamentally incompatible with `ComponentPatch.config`'s
 * `z.record(z.string(), z.unknown())` (an intentionally open-ended
 * component-config bag; see operations/types.ts), which strict mode
 * rejects as `400 object schema missing properties` no matter how the rest
 * of the schema is sanitized above. With `strict: false`, OpenAI treats the
 * schema as guidance rather than a constrained-decoding grammar — which is
 * fine here, because this codebase never trusts the model's structural
 * claims anyway (see `modelBelievesDestructive`): `schema.safeParse()`
 * below is already the real, non-optional enforcement layer, and a
 * response that fails it is just the ordinary `malformed_response` /
 * retry path, not a new failure mode.
 */
export interface StrictJsonSchema {
  name: string;
  schema: Record<string, unknown>;
  strict: false;
}

function isEmptyNotSchema(node: unknown): node is { not: Record<string, never> } {
  return (
    typeof node === "object" &&
    node !== null &&
    !Array.isArray(node) &&
    Object.keys(node).length === 1 &&
    "not" in node &&
    typeof (node as { not: unknown }).not === "object" &&
    (node as { not: unknown }).not !== null &&
    Object.keys((node as { not: object }).not).length === 0
  );
}

function sanitizeOptionalEncoding(node: unknown): unknown {
  if (Array.isArray(node)) return node.map(sanitizeOptionalEncoding);
  if (node === null || typeof node !== "object") return node;

  const obj = node as Record<string, unknown>;

  // `$ref` must be the only key on its node (barring recursive schemas,
  // which this codebase's bounded, non-recursive operation/spec shapes
  // never produce) — drop siblings like a hoisted `.default(...)` rather
  // than recursing into them.
  if (typeof obj.$ref === "string") return { $ref: obj.$ref };

  if (Array.isArray(obj.anyOf) && obj.anyOf.length === 2 && isEmptyNotSchema(obj.anyOf[0])) {
    return { ...obj, anyOf: [{ type: "null" }, sanitizeOptionalEncoding(obj.anyOf[1])] };
  }

  const out: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(obj)) out[key] = sanitizeOptionalEncoding(value);
  return out;
}

/** Builds an OpenAI-json-schema-response-format-compatible schema from a domain zod schema, without modifying the schema itself. */
export function toStrictJsonSchema(schema: ZodType, name: string): StrictJsonSchema {
  const responseFormat = zodResponseFormat(schema, name);
  const sanitized = sanitizeOptionalEncoding(responseFormat.json_schema.schema) as Record<string, unknown>;
  return { name, schema: sanitized, strict: false };
}

/** Recursively converts `null` back to `undefined` so a response built against the strict schema above validates against the original `.optional()` (non-nullable) zod schema. */
export function nullsToUndefinedDeep<T>(value: T): T {
  if (Array.isArray(value)) return value.map((item) => nullsToUndefinedDeep(item)) as unknown as T;
  if (value === null) return undefined as unknown as T;
  if (typeof value === "object") {
    const out: Record<string, unknown> = {};
    for (const [key, item] of Object.entries(value as Record<string, unknown>)) {
      out[key] = nullsToUndefinedDeep(item);
    }
    return out as T;
  }
  return value;
}
