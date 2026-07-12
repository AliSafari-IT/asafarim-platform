/*
 * Vionto pipeline manifest — the schema-validated shape a brief expands into
 * as it moves through the pipeline. Ported concept (not code) from the
 * legacy Vionto render-manifest.ts zod schema: a structured, versioned
 * contract every stage's output must satisfy. Trimmed to generic
 * script/storyboard/asset-plan shapes — no FFmpeg-specific fields, no
 * provider-specific prompts.
 *
 * Uses the same minimal JSON-schema validator style as
 * benchmarks/ai-eval/scoring/scorers.mjs (no zod dependency in this harness).
 */

export function validateSchema(value, schema) {
  const errors = [];
  const check = (val, sch, path) => {
    const t = sch.type;
    if (t === "object") {
      if (typeof val !== "object" || val === null || Array.isArray(val)) {
        errors.push(`${path}: expected object`);
        return;
      }
      for (const req of sch.required || []) {
        if (!(req in val)) errors.push(`${path}.${req}: required`);
      }
      for (const [key, subSchema] of Object.entries(sch.properties || {})) {
        if (key in val) check(val[key], subSchema, `${path}.${key}`);
      }
    } else if (t === "array") {
      if (!Array.isArray(val)) {
        errors.push(`${path}: expected array`);
        return;
      }
      if (sch.minItems != null && val.length < sch.minItems) {
        errors.push(`${path}: expected at least ${sch.minItems} item(s)`);
      }
      if (sch.items) val.forEach((item, i) => check(item, sch.items, `${path}[${i}]`));
    } else if (t === "integer") {
      if (typeof val !== "number" || !Number.isInteger(val)) errors.push(`${path}: expected integer`);
    } else if (t === "number") {
      if (typeof val !== "number" || Number.isNaN(val)) errors.push(`${path}: expected number`);
    } else if (t === "string") {
      if (typeof val !== "string" || val.trim() === "") errors.push(`${path}: expected non-empty string`);
      else if (sch.enum && !sch.enum.includes(val)) errors.push(`${path}: not in enum [${sch.enum}]`);
    } else if (t === "boolean") {
      if (typeof val !== "boolean") errors.push(`${path}: expected boolean`);
    }
  };
  check(value, schema, "$");
  return { valid: errors.length === 0, errors };
}

/** Stage 1 output: brief -> structured script. */
export const SCRIPT_SCHEMA = {
  type: "object",
  required: ["title", "scenes"],
  properties: {
    title: { type: "string" },
    scenes: {
      type: "array",
      minItems: 1,
      items: {
        type: "object",
        required: ["description", "narration"],
        properties: {
          description: { type: "string" },
          narration: { type: "string" },
        },
      },
    },
  },
};

/** Stage 2 output: script -> storyboard (one shot per scene). */
export const STORYBOARD_SCHEMA = {
  type: "object",
  required: ["shots"],
  properties: {
    shots: {
      type: "array",
      minItems: 1,
      items: {
        type: "object",
        required: ["sceneIndex", "shotType", "durationSeconds"],
        properties: {
          sceneIndex: { type: "integer" },
          shotType: { type: "string", enum: ["wide", "medium", "close-up"] },
          durationSeconds: { type: "number" },
        },
      },
    },
  },
};

/** Stage 3 output: storyboard -> asset plan (one placeholder asset per shot). */
export const ASSET_PLAN_SCHEMA = {
  type: "object",
  required: ["assets"],
  properties: {
    assets: {
      type: "array",
      minItems: 1,
      items: {
        type: "object",
        required: ["shotIndex", "assetId", "kind"],
        properties: {
          shotIndex: { type: "integer" },
          assetId: { type: "string" },
          kind: { type: "string", enum: ["placeholder-image", "placeholder-clip"] },
        },
      },
    },
  },
};

const SCHEMAS = {
  script: SCRIPT_SCHEMA,
  storyboard: STORYBOARD_SCHEMA,
  "asset-plan": ASSET_PLAN_SCHEMA,
};

export function validateStageOutput(stage, value) {
  const schema = SCHEMAS[stage];
  if (!schema) throw new Error(`Unknown stage: ${stage}`);
  return validateSchema(value, schema);
}

/**
 * A deterministic, non-cryptographic hash of a JSON-serializable value —
 * used only to fingerprint a stage's inputs for the "records its inputs and
 * configuration version" acceptance criterion. Not for security use.
 */
export function fingerprint(value) {
  const s = JSON.stringify(value);
  let h = 0;
  for (let i = 0; i < s.length; i++) {
    h = (Math.imul(31, h) + s.charCodeAt(i)) | 0;
  }
  return (h >>> 0).toString(16).padStart(8, "0");
}

/** Current schema/config version stamped onto every stage artifact. */
export const CONFIG_VERSION = "v1";
