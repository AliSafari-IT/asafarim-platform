import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { openapiDocument } from "./openapi";

describe("openapi contract", () => {
  it("the checked-in docs/api/openapi.json matches the served document", () => {
    const onDisk = readFileSync(join(__dirname, "../../docs/api/openapi.json"), "utf8");
    expect(onDisk).toBe(JSON.stringify(openapiDocument, null, 2) + "\n");
  });

  it("declares every implemented route", () => {
    const paths = Object.keys(openapiDocument.paths);
    expect(paths).toEqual(
      expect.arrayContaining([
        "/workspaces",
        "/workspaces/{slug}/projects",
        "/workspaces/{slug}/projects/{id}",
        "/workspaces/{slug}/tasks",
        "/workspaces/{slug}/tasks/{id}",
        "/workspaces/{slug}/tasks/{id}/complete",
        "/workspaces/{slug}/tasks/{id}/links",
      ]),
    );
  });

  it("keeps the error code enum aligned with lib/errors", async () => {
    const { ERROR } = await import("../errors");
    const specCodes = [
      ...openapiDocument.components.schemas.Error.properties.error.properties.code.enum,
    ].sort();
    expect(specCodes).toEqual(Object.keys(ERROR).sort());
  });
});
