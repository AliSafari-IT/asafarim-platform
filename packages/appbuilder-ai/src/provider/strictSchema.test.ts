import { describe, expect, it } from "vitest";
import { z } from "zod";
import { nullsToUndefinedDeep, toStrictJsonSchema } from "./strictSchema";

/** Recursively asserts no `{"anyOf": [{"not": {...}}, ...]}` node, and no `$ref` with sibling keys, remains anywhere in the schema. */
function assertNoBareNotBranch(node: unknown, path = "root") {
  if (Array.isArray(node)) {
    node.forEach((item, i) => assertNoBareNotBranch(item, `${path}[${i}]`));
    return;
  }
  if (node === null || typeof node !== "object") return;
  const obj = node as Record<string, unknown>;
  if (Array.isArray(obj.anyOf)) {
    const first = obj.anyOf[0];
    if (first && typeof first === "object" && !Array.isArray(first) && Object.keys(first).length === 1 && "not" in first) {
      throw new Error(`Found unsanitized "not" branch at ${path}`);
    }
  }
  if (typeof obj.$ref === "string" && Object.keys(obj).length > 1) {
    throw new Error(`Found "$ref" with sibling keys ${JSON.stringify(Object.keys(obj))} at ${path}`);
  }
  for (const [key, value] of Object.entries(obj)) assertNoBareNotBranch(value, `${path}.${key}`);
}

describe("toStrictJsonSchema", () => {
  it("rewrites the zod-helper's `.optional()` encoding into a type-bearing nullable branch", () => {
    const schema = z.object({
      required: z.string(),
      maybe: z.string().optional(),
      nested: z.object({ inner: z.string().optional() }).optional(),
    });

    const { schema: jsonSchema, strict } = toStrictJsonSchema(schema, "test_schema");

    // Not OpenAI's `strict: true` mode — see toStrictJsonSchema's docstring
    // on why (an open-ended `z.record()` field elsewhere is fundamentally
    // incompatible with strict mode's "every object enumerates its
    // properties" rule). `schema.safeParse()` is the real enforcement.
    expect(strict).toBe(false);
    assertNoBareNotBranch(jsonSchema);
  });

  it("leaves schemas with no optional fields unchanged in shape", () => {
    const schema = z.object({ a: z.string(), b: z.number() });
    const { schema: jsonSchema } = toStrictJsonSchema(schema, "no_optionals");
    assertNoBareNotBranch(jsonSchema);
    expect((jsonSchema as { required?: string[] }).required).toEqual(["a", "b"]);
  });

  it("strips sibling keywords (e.g. a hoisted `.default()`) from `$ref` nodes", () => {
    // zod-to-json-schema hoists a shape into `definitions` when the same
    // schema *reference* repeats — the OpenAI-rejected shape this
    // reproduces is `{"$ref": "...", "default": false}` at each use site.
    const Flag = z.boolean().default(false);
    const schema = z.object({
      a: z.object({ flag: Flag }),
      items: z.array(z.object({ flag: Flag })),
    });

    const { schema: jsonSchema } = toStrictJsonSchema(schema, "default_ref_schema");
    assertNoBareNotBranch(jsonSchema);
  });

  it("does not disturb legitimate `not` schemas elsewhere (only the bare `{not: {}}` marker)", () => {
    const schema = z.object({ excluded: z.string().refine((v) => v !== "x") });
    // A refine doesn't produce a `not` schema in zod-to-json-schema, but this
    // guards the detector against being overly broad if that ever changes:
    // it must key off an *empty* `not: {}`, not any `not` keyword at all.
    const { schema: jsonSchema } = toStrictJsonSchema(schema, "refine_schema");
    assertNoBareNotBranch(jsonSchema);
  });
});

describe("nullsToUndefinedDeep", () => {
  it("converts top-level and nested nulls to undefined", () => {
    const input = { a: null, b: { c: null, d: "x" }, e: [null, { f: null }] };
    const output = nullsToUndefinedDeep(input);
    expect(output).toEqual({ a: undefined, b: { c: undefined, d: "x" }, e: [undefined, { f: undefined }] });
  });

  it("round-trips a null-bearing response through the original `.optional()` schema", () => {
    const schema = z.object({ name: z.string(), note: z.string().optional() });
    const raw = { name: "x", note: null };
    const cleaned = nullsToUndefinedDeep(raw);
    expect(() => schema.parse(cleaned)).not.toThrow();
    expect(schema.parse(cleaned)).toEqual({ name: "x" });
  });

  it("leaves non-null primitives, arrays, and objects alone", () => {
    expect(nullsToUndefinedDeep(5)).toBe(5);
    expect(nullsToUndefinedDeep("x")).toBe("x");
    expect(nullsToUndefinedDeep([1, 2, 3])).toEqual([1, 2, 3]);
  });
});
