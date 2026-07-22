import type { ReactElement } from "react";
import {
  validateSpecification,
  type ApplicationSpecificationType,
  type ComponentConfigType,
} from "@asafarim/appbuilder-schema";
import { resolveBranding } from "../security/branding";
import { listRegistryEntries, resolveComponentEntry } from "../registry/registry";
import { ComponentEmptyState, ComponentErrorState } from "../registry/components/states";
import { NavigationChrome, PageHeaderChrome, ShellChrome } from "../registry/components/chrome";
import { RENDER_LIMITS } from "../registry/limits";
import { buildNavItems, resolveHomePage, resolvePageByPath } from "./resolvePage";
import type { RenderError } from "./types";

export interface PreviewRenderInput {
  specification: ApplicationSpecificationType;
  /** Path segments after `/apps/{appId}/preview` — e.g. `[]` for the homepage, `["projects"]` for `/apps/{appId}/preview/projects`. */
  path: string[];
  /** The already-authorized, opaque preview route prefix (e.g. `/apps/app_123/preview`) — used only to build internal nav hrefs, never trusted as page-identifying input. */
  basePath: string;
}

export interface PreviewRenderSuccess {
  ok: true;
  pageId: string;
  pageName: string;
  element: ReactElement;
  /** Non-fatal issues discovered while rendering — already surfaced inline in `element` as diagnostics, also returned structured for logging/tests. */
  warnings: RenderError[];
}

export interface PreviewRenderFailure {
  ok: false;
  errors: RenderError[];
}

export type PreviewRenderResult = PreviewRenderSuccess | PreviewRenderFailure;

/**
 * The single deterministic entry point: parsed specification in, either a
 * renderable React element or a structured list of render errors out. Never
 * throws, never mutates `input.specification`, never falls back to an
 * approximation of unregistered content — see registry/registry.ts and
 * docs/appbuilder-runtime.md for the full "reject, don't silently omit"
 * contract.
 */
export function renderPreview(input: PreviewRenderInput): PreviewRenderResult {
  const validation = validateSpecification(input.specification);
  if (!validation.ok) {
    return {
      ok: false,
      errors: validation.errors.map((issue) => ({
        code: "malformed_specification",
        message: issue.message,
        path: issue.path,
      })),
    };
  }

  const page = resolvePageByPath(input.specification, input.path);
  if (!page) {
    // A brand-new/blank app with zero pages is a legitimate, safe empty
    // state at its own homepage — not a 404. Requesting any *other* path on
    // an app that genuinely has no pages is still an unknown-page failure,
    // same as an unresolvable path on an app that does have pages.
    if (input.path.length === 0 && input.specification.pages.length === 0) {
      const branding = resolveBranding(input.specification.branding, input.specification.app.name);
      return {
        ok: true,
        pageId: "",
        pageName: "Home",
        warnings: [],
        element: (
          <ShellChrome branding={branding} nav={<NavigationChrome items={[]} />}>
            <PageHeaderChrome title="Home" />
            <ComponentEmptyState
              title="No pages configured yet"
              description="This app doesn't have any pages yet — add one to see it here."
            />
          </ShellChrome>
        ),
      };
    }
    return {
      ok: false,
      errors: [
        {
          code: "unknown_page",
          message: `No page found for path "/${input.path.join("/")}"`,
        },
      ],
    };
  }

  // The top-level `dashboard.widgets` collection (@asafarim/appbuilder-schema)
  // is not tied to any one page id — it renders on whichever page resolves
  // as the app's homepage, ahead of that page's own (usually empty)
  // component list.
  const isHomePage = page.id === resolveHomePage(input.specification)?.id;
  const dashboardWidgets: ComponentConfigType[] = isHomePage ? input.specification.dashboard.widgets : [];
  const renderables = [...dashboardWidgets, ...page.components];

  if (renderables.length > RENDER_LIMITS.MAX_COMPONENTS_PER_PAGE) {
    return {
      ok: false,
      errors: [
        {
          code: "render_count_exceeded",
          message: `Page "${page.id}" has more renderable items (${renderables.length}) than the renderer allows (${RENDER_LIMITS.MAX_COMPONENTS_PER_PAGE})`,
          path: ["pages", page.id, "components"],
        },
      ],
    };
  }

  const branding = resolveBranding(input.specification.branding, input.specification.app.name);
  const warnings: RenderError[] = [];
  const knownKinds = new Set(listRegistryEntries().map((entry) => entry.schemaKind));

  const componentElements = [...renderables]
    .sort((a, b) => a.order - b.order)
    .map((component) => {
      const path = ["pages", page.id, "components", component.id];
      const entry = resolveComponentEntry(component);

      if (!entry) {
        const variant = typeof component.config?.variant === "string" ? component.config.variant : "(default)";
        const error: RenderError = knownKinds.has(component.kind)
          ? {
              code: "unknown_variant",
              message: `Unknown variant "${variant}" for component kind "${component.kind}"`,
              path,
            }
          : {
              code: "unknown_component_kind",
              message: `Unknown component kind "${component.kind}"`,
              path,
            };
        warnings.push(error);
        return (
          <div
            key={component.id}
            className="ab-component-error"
            data-ab-page-id={page.id}
            data-ab-component-id={component.id}
            data-ab-component-kind={component.kind}
          >
            <ComponentErrorState title="Unsupported component" description={error.message} />
          </div>
        );
      }

      const parsedConfig = entry.configSchema.safeParse(component.config ?? {});
      if (!parsedConfig.success) {
        const message = parsedConfig.error.issues.map((issue) => issue.message).join("; ");
        warnings.push({ code: "invalid_config", message: `Invalid configuration for "${component.id}": ${message}`, path });
        return (
          <div key={component.id} className="ab-component-error">
            <ComponentErrorState title="Invalid component configuration" description={message} />
          </div>
        );
      }

      const entity = component.entityId
        ? input.specification.entities.find((candidate) => candidate.id === component.entityId && !candidate.archived)
        : undefined;
      if (component.entityId && !entity) {
        warnings.push({
          code: "invalid_binding",
          message: `Component "${component.id}" references unknown or archived entity "${component.entityId}"`,
          path,
        });
      }

      let element: ReactElement;
      try {
        element = entry.render({
          componentId: component.id,
          config: parsedConfig.data,
          entity,
          spec: input.specification,
          branding,
          reportWarning: (warning) => warnings.push({ ...warning, path }),
        });
      } catch (err) {
        const message = err instanceof Error ? err.message : "Unknown render error";
        warnings.push({ code: "invalid_config", message: `Component "${component.id}" failed to render: ${message}`, path });
        element = <ComponentErrorState title="Component failed to render" description={message} />;
      }

      return (
        <div
          key={component.id}
          className="ab-component"
          data-ab-page-id={page.id}
          data-ab-component-id={component.id}
          data-ab-component-kind={component.kind}
        >
          {element}
        </div>
      );
    });

  const navItems = buildNavItems(input.specification, input.basePath, page.id);

  const element = (
    <ShellChrome branding={branding} nav={<NavigationChrome items={navItems} />}>
      <PageHeaderChrome title={page.name} />
      <div className="ab-page-components" data-ab-page-id={page.id}>
        {componentElements}
      </div>
    </ShellChrome>
  );

  return { ok: true, pageId: page.id, pageName: page.name, element, warnings };
}
