import { renderPreview } from "@asafarim/appbuilder-runtime";
import type { GateContext, GateDefinition, GateResult } from "../types";
import { redactFailures } from "../redaction";
import { routes } from "../../routes";

/**
 * Render warning codes (see @asafarim/appbuilder-runtime's renderPreview.tsx)
 * that mean a component visibly renders as a broken diagnostic box for every
 * viewer — as opposed to `invalid_binding`, which degrades a single
 * component to a labelled empty/warning state without breaking the page.
 * `renderPreview` deliberately keeps `ok: true` for these (a degraded page
 * is still better than a blank one), so this gate — not the renderer — is
 * what's responsible for treating them as launch-blocking failures.
 */
const FATAL_RENDER_WARNING_CODES = new Set(["invalid_config", "unknown_variant", "unknown_component_kind"]);

/**
 * The pinned preview build actually succeeded, AND every non-archived page
 * in the specification independently renders through the same
 * metadata-driven renderer `requestPreviewBuild` used (M06) — not just the
 * home page `requestPreviewBuild` synchronously checks at build time. A
 * page that only fails when navigated to directly (e.g. a component
 * misconfiguration that only manifests on a non-home route) is exactly what
 * this gate exists to catch before it reaches a real user.
 */
export const previewRenderabilityGate: GateDefinition = {
  key: "preview_renderability",
  version: "1.1.0",
  mandatory: true,
  title: "Preview renderability",
  description: "The pinned preview build succeeded, and every non-archived page renders without a registry-level failure or a broken component configuration.",
  async execute(ctx: GateContext): Promise<GateResult> {
    if (!ctx.previewBuild || ctx.previewBuild.status !== "succeeded") {
      return {
        status: "failed",
        failureCode: "preview_build_missing",
        failureMessage: "No succeeded preview build is pinned for this specification version.",
        structuredFailures: redactFailures([{ code: "preview_build_missing", message: "Preview build missing or not succeeded." }]),
      };
    }

    const failures: { code: string; message: string; path?: (string | number)[] }[] = [];
    const activePages = ctx.specPayload.pages.filter((p) => !p.archived);

    for (const page of activePages) {
      const rendered = renderPreview({ specification: ctx.specPayload, path: page.path.split("/").filter(Boolean), basePath: routes.appPreview(ctx.appId) });
      if (!rendered.ok) {
        failures.push(...rendered.errors.map((e) => ({ code: e.code, message: `Page "${page.name}": ${e.message}`, path: e.path })));
        continue;
      }
      // `ok: true` only means the page shell rendered — it says nothing
      // about individual components inside it. A fatal warning here (e.g.
      // an AI-generated config with an unrecognized key or invalid enum
      // value) is exactly the "Invalid component configuration" box a real
      // user would hit on this page; catch it here instead of at deploy.
      const fatalWarnings = rendered.warnings.filter((w) => FATAL_RENDER_WARNING_CODES.has(w.code));
      failures.push(...fatalWarnings.map((w) => ({ code: w.code, message: `Page "${page.name}": ${w.message}`, path: w.path })));
    }

    if (failures.length > 0) {
      return {
        status: "failed",
        failureCode: "render_failed",
        failureMessage: `${failures.length} page(s) failed to render.`,
        structuredFailures: redactFailures(failures),
      };
    }

    return { status: "passed", evidence: { pagesRendered: activePages.length, previewBuildId: ctx.previewBuild.id } };
  },
};
