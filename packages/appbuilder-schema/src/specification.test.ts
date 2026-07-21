import { describe, expect, it } from "vitest";
import { ApplicationSpecification } from "./specification";
import { getSpecificationJsonSchema } from "./jsonSchema";
import { constructionTaskManagementFixture } from "./fixtures";
import { SPEC_SCHEMA_VERSION } from "./constants";

describe("ApplicationSpecification parsing", () => {
  it("parses the construction task-management fixture", () => {
    const result = ApplicationSpecification.safeParse(constructionTaskManagementFixture);
    expect(result.success).toBe(true);
  });

  it("rejects a spec with the wrong schemaVersion instead of silently coercing it", () => {
    const result = ApplicationSpecification.safeParse({
      ...constructionTaskManagementFixture,
      schemaVersion: "0.9.0",
    });
    expect(result.success).toBe(false);
  });

  it("rejects a spec missing required app metadata", () => {
    const { app: _app, ...rest } = constructionTaskManagementFixture;
    const result = ApplicationSpecification.safeParse(rest);
    expect(result.success).toBe(false);
  });
});

describe("JSON Schema generation", () => {
  it("generates a JSON Schema referencing ApplicationSpecification", () => {
    const schema = getSpecificationJsonSchema();
    expect(schema.$ref).toBe("#/definitions/ApplicationSpecification");
    const definitions = schema.definitions as Record<string, unknown>;
    expect(definitions.ApplicationSpecification).toBeDefined();
  });

  it("embeds the current schema version as a const", () => {
    const schema = getSpecificationJsonSchema();
    const definitions = schema.definitions as Record<string, any>;
    const schemaVersionProp = definitions.ApplicationSpecification.properties.schemaVersion;
    expect(schemaVersionProp.const).toBe(SPEC_SCHEMA_VERSION);
  });
});
