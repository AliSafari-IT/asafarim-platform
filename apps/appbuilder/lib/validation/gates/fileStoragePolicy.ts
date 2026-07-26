import { getStorageStatus } from "@asafarim/storage";
import type { GateContext, GateDefinition, GateResult } from "../types";
import { redactFailures } from "../redaction";

const DEFAULT_TOKEN_SECRET_MARKERS = ["dev-secret", "changeme", "insecure", ""];

/**
 * Structural file/storage policy checks: (a) the storage boundary resolves
 * without throwing (local fallback engaged in dev/test, or a fully
 * configured remote bucket in production — never a half-configured, silently
 * broken state); (b) every `file`/`image` field in the specification either
 * has no explicit MIME/size config (falls back to the module's documented
 * default allowlist) or a well-formed one; (c) outside dev/test, the
 * download-token secret is not left at an insecure default (see
 * lib/generated-data/files.ts's `getTokenSecret` fallback).
 */
export const fileStoragePolicyGate: GateDefinition = {
  key: "file_storage_policy",
  version: "1.0.0",
  mandatory: true,
  title: "File / storage policy",
  description: "The storage boundary resolves correctly, file-field MIME/size config is well-formed, and the download-token secret is not an insecure default outside dev/test.",
  async execute(ctx: GateContext): Promise<GateResult> {
    const failures: { code: string; message: string; path?: (string | number)[] }[] = [];

    let status: ReturnType<typeof getStorageStatus>;
    try {
      status = getStorageStatus();
    } catch (err) {
      return {
        status: "infrastructure_error",
        failureCode: "storage_unreachable",
        failureMessage: "The storage boundary threw while resolving its configuration.",
        structuredFailures: redactFailures([{ code: "storage_unreachable", message: err instanceof Error ? err.message : String(err) }]),
      };
    }

    ctx.specPayload.entities.forEach((entity, entityIndex) => {
      entity.fields.forEach((field, fieldIndex) => {
        if (field.type !== "file" && field.type !== "image") return;
        const config = field as unknown as { maxSizeBytes?: unknown; allowedMimeTypes?: unknown };
        if (config.maxSizeBytes !== undefined && (typeof config.maxSizeBytes !== "number" || config.maxSizeBytes <= 0)) {
          failures.push({
            code: "invalid_file_size_policy",
            message: `Entity "${entity.name}" field "${field.name}": maxSizeBytes must be a positive number when set.`,
            path: ["entities", entityIndex, "fields", fieldIndex, "maxSizeBytes"],
          });
        }
        if (config.allowedMimeTypes !== undefined && !Array.isArray(config.allowedMimeTypes)) {
          failures.push({
            code: "invalid_mime_allowlist",
            message: `Entity "${entity.name}" field "${field.name}": allowedMimeTypes must be an array when set.`,
            path: ["entities", entityIndex, "fields", fieldIndex, "allowedMimeTypes"],
          });
        }
      });
    });

    if (process.env.NODE_ENV === "production") {
      const secret = process.env.APPBUILDER_FILE_TOKEN_SECRET ?? "";
      if (DEFAULT_TOKEN_SECRET_MARKERS.some((marker) => secret.toLowerCase().includes(marker))) {
        failures.push({ code: "insecure_download_token_secret", message: "APPBUILDER_FILE_TOKEN_SECRET is unset or looks like a default/placeholder value in production." });
      }
      if (!status.remote) {
        failures.push({ code: "storage_not_remote_in_production", message: "Storage resolved to the local-file fallback while NODE_ENV=production." });
      }
    }

    if (failures.length > 0) {
      return {
        status: "failed",
        failureCode: "file_storage_policy_violation",
        failureMessage: `${failures.length} file/storage policy violation(s) found.`,
        structuredFailures: redactFailures(failures),
      };
    }

    return { status: "passed", evidence: { storageConfigured: status.configured, storageRemote: status.remote } };
  },
};
