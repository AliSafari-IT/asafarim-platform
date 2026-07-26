import { renderPreview } from "@asafarim/appbuilder-runtime";
import type { GateContext, GateDefinition, GateResult } from "../types";
import { redactFailures } from "../redaction";
import { routes } from "../../routes";

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
  version: "1.0.0",
  mandatory: true,
  title: "Preview renderability",
  description: "The pinned preview build succeeded, and every non-archived page renders without a registry-level failure.",
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
      }
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
