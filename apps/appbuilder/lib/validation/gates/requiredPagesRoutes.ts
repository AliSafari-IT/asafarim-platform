import { resolveHomePage, resolvePageByPath } from "@asafarim/appbuilder-runtime";
import type { GateContext, GateDefinition, GateResult } from "../types";
import { redactFailures } from "../redaction";

/**
 * Every declared page has a resolvable route, a home page exists, and every
 * navigation item points at a real, non-archived page — the structural
 * "does this app even have the pages it claims to" check, distinct from
 * `preview_renderability` (which actually renders each page's content).
 */
export const requiredPagesRoutesGate: GateDefinition = {
  key: "required_pages_routes",
  version: "1.0.0",
  mandatory: true,
  title: "Required pages / routes",
  description: "A home page exists, every page's route resolves uniquely, and every navigation item targets a real, non-archived page.",
  async execute(ctx: GateContext): Promise<GateResult> {
    const spec = ctx.specPayload;
    const failures: { code: string; message: string; path?: (string | number)[] }[] = [];

    const activePages = spec.pages.filter((p) => !p.archived);
    if (activePages.length === 0) {
      failures.push({ code: "no_active_pages", message: "The specification has zero non-archived pages." });
    }

    const home = resolveHomePage(spec);
    if (!home) {
      failures.push({ code: "no_home_page", message: "No home page could be resolved." });
    }

    for (const page of activePages) {
      const resolved = resolvePageByPath(spec, page.path.split("/").filter(Boolean));
      if (!resolved || resolved.id !== page.id) {
        failures.push({ code: "unresolvable_route", message: `Page "${page.name}" (path "${page.path}") does not resolve back to itself.` });
      }
    }

    const navItems = spec.navigation.filter((n) => activePages.some((p) => p.id === n.targetPageId));
    spec.navigation.forEach((item, index) => {
      const target = spec.pages.find((p) => p.id === item.targetPageId);
      if (!target || target.archived) {
        failures.push({ code: "dangling_navigation_target", message: `Navigation item "${item.label}" targets a missing or archived page.`, path: ["navigation", index] });
      }
    });

    if (failures.length > 0) {
      return {
        status: "failed",
        failureCode: "required_pages_routes_invalid",
        failureMessage: `${failures.length} page/route issue(s) found.`,
        structuredFailures: redactFailures(failures),
      };
    }

    return { status: "passed", evidence: { activePageCount: activePages.length, navItemCount: navItems.length, homePageId: home?.id } };
  },
};
