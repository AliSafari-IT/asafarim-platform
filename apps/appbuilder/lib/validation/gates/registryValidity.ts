import { REGISTRY_VERSION, resolveComponentEntry } from "@asafarim/appbuilder-runtime";
import type { ComponentConfigType } from "@asafarim/appbuilder-schema";
import type { GateContext, GateDefinition, GateResult } from "../types";
import { redactFailures } from "../redaction";

/**
 * Every component/widget the specification references resolves to a real,
 * approved registry entry — the same lookup `renderPreview` itself uses
 * (`resolveComponentEntry`), checked here structurally against every
 * page/dashboard in the spec up front rather than discovered one page at a
 * time by whichever page a builder happens to open next.
 */
export const registryValidityGate: GateDefinition = {
  key: "registry_validity",
  version: "1.0.0",
  mandatory: true,
  title: "Component/template registry validity",
  description: "Every component and dashboard widget referenced by the specification resolves to an approved, currently-registered renderer.",
  async execute(ctx: GateContext): Promise<GateResult> {
    const failures: { code: string; message: string; path?: (string | number)[] }[] = [];

    ctx.specPayload.pages.forEach((page, pageIndex) => {
      if (page.archived) return;
      page.components.forEach((component: ComponentConfigType, componentIndex) => {
        const entry = resolveComponentEntry(component);
        if (!entry) {
          failures.push({
            code: "unresolved_component",
            message: `Page "${page.name}" component "${component.id}" (kind: ${component.kind}, variant: ${String(component.config?.variant ?? "default")}) does not resolve to a registered renderer.`,
            path: ["pages", pageIndex, "components", componentIndex],
          });
        }
      });
    });

    ctx.specPayload.dashboard?.widgets.forEach((widget, widgetIndex) => {
      const entry = resolveComponentEntry({ id: widget.id, kind: widget.kind, entityId: widget.entityId, config: widget.config, order: widget.order });
      if (!entry) {
        failures.push({
          code: "unresolved_widget",
          message: `Dashboard widget "${widget.id}" (kind: ${widget.kind}) does not resolve to a registered renderer.`,
          path: ["dashboard", "widgets", widgetIndex],
        });
      }
    });

    if (failures.length > 0) {
      return {
        status: "failed",
        failureCode: "unresolved_component",
        failureMessage: `${failures.length} component(s)/widget(s) do not resolve against the approved registry.`,
        structuredFailures: redactFailures(failures),
      };
    }

    return { status: "passed", evidence: { registryVersion: ctx.registryVersion, expectedRegistryVersion: REGISTRY_VERSION } };
  },
};
