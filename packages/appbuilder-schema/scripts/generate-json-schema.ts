import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { getSpecificationJsonSchema } from "../src/jsonSchema";

const outDir = join(process.cwd(), "dist");
mkdirSync(outDir, { recursive: true });

const outFile = join(outDir, "specification.schema.json");
writeFileSync(outFile, `${JSON.stringify(getSpecificationJsonSchema(), null, 2)}\n`);

console.log(`Wrote ${outFile}`);
