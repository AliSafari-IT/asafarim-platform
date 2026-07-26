import { validateSpecification } from "@asafarim/appbuilder-schema";
import type { GateContext, GateDefinition, GateResult } from "../types";
import { redactFailures } from "../redaction";

const CONTENT_SAFETY_CODES = new Set(["unsafe_content", "unsafe_config_key"]);

/**
 * Allowlisted external-domain policy for URL-shaped config values (branding
 * logo, link/button targets). Deliberately conservative: only `https://` (or
 * relative/`data:image/*`) references to the platform's own domains are
 * permitted — a generated app can never be used to point at an arbitrary
 * external site, matching the issue's explicit "do not allow user prompts
 * or generated specifications to select arbitrary URLs ... or external
 * domains."
 */
const ALLOWED_HOST_SUFFIXES = [".asafarim.com", "asafarim.com"];

function isAllowedUrl(value: string): boolean {
  if (value.startsWith("/") || value.startsWith("data:image/")) return true;
  try {
    const url = new URL(value);
    if (url.protocol !== "https:") return false;
    return ALLOWED_HOST_SUFFIXES.some((suffix) => url.hostname === suffix.replace(/^\./, "") || url.hostname.endsWith(suffix));
  } catch {
    return false;
  }
}

function collectUrlLikeStrings(value: unknown, path: (string | number)[], out: { value: string; path: (string | number)[] }[]): void {
  if (typeof value === "string") {
    if (/^(https?:|data:|javascript:|\/)/i.test(value.trim())) out.push({ value, path });
    return;
  }
  if (Array.isArray(value)) {
    value.forEach((item, index) => collectUrlLikeStrings(item, [...path, index], out));
    return;
  }
  if (value && typeof value === "object") {
    for (const [key, val] of Object.entries(value as Record<string, unknown>)) {
      collectUrlLikeStrings(val, [...path, key], out);
    }
  }
}

/**
 * Unsafe content/URL policy — reuses `@asafarim/appbuilder-schema`'s own
 * content-safety sweep (script tags, inline event handlers, dangerous config
 * keys — already enforced by M04's `validateSpecification`) as the first
 * layer, then adds an M10-specific allowlisted-domain check over every
 * URL-shaped string in the specification's branding/component config.
 */
export const unsafeContentPolicyGate: GateDefinition = {
  key: "unsafe_content_policy",
  version: "1.0.0",
  mandatory: true,
  title: "Unsafe content / URL policy",
  description: "No script/event-handler injection, dangerous config keys, or non-allowlisted external URLs anywhere in the specification.",
  async execute(ctx: GateContext): Promise<GateResult> {
    const validation = validateSpecification(ctx.specPayload);
    const contentSafety = validation.errors.filter((e) => CONTENT_SAFETY_CODES.has(e.code));
    const failures: { code: string; message: string; path?: (string | number)[] }[] = contentSafety.map((v) => ({
      code: v.code,
      message: v.message,
      path: v.path,
    }));

    const urlLike: { value: string; path: (string | number)[] }[] = [];
    collectUrlLikeStrings(ctx.specPayload.branding, ["branding"], urlLike);
    ctx.specPayload.pages.forEach((page, pageIndex) => {
      page.components.forEach((component, componentIndex) => {
        collectUrlLikeStrings(component.config, ["pages", pageIndex, "components", componentIndex, "config"], urlLike);
      });
    });

    for (const candidate of urlLike) {
      if (!isAllowedUrl(candidate.value)) {
        failures.push({
          code: "disallowed_url",
          message: `URL "${candidate.value}" is not an allowlisted relative path, data:image, or https://*.asafarim.com domain.`,
          path: candidate.path,
        });
      }
    }

    if (failures.length > 0) {
      return {
        status: "failed",
        failureCode: "unsafe_content",
        failureMessage: `${failures.length} unsafe-content/URL-policy violation(s) found.`,
        structuredFailures: redactFailures(failures),
      };
    }

    return { status: "passed", evidence: { urlsChecked: urlLike.length } };
  },
};
