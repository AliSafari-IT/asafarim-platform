import { zodToJsonSchema } from "zod-to-json-schema";
import { ApplicationSpecification } from "./specification";

/**
 * Generates a JSON Schema for `ApplicationSpecification` on demand — used
 * by external tooling (editors, the future builder UI, migration scripts)
 * that wants a schema artifact without a Zod dependency. `scripts/
 * generate-json-schema.ts` writes this to `dist/specification.schema.json`
 * via `pnpm build:json-schema`.
 */
export function getSpecificationJsonSchema(): Record<string, unknown> {
  return zodToJsonSchema(ApplicationSpecification, {
    name: "ApplicationSpecification",
    $refStrategy: "none",
  }) as Record<string, unknown>;
}
