export { REGISTRY_VERSION } from "./version";

export { sanitizeUrl, type UrlKind } from "./security/url";
export {
  resolveBranding,
  SAFE_ACCENT_CHOICES,
  SAFE_RADIUS_CHOICES,
  type ResolvedBranding,
  type SafeAccent,
  type SafeRadius,
} from "./security/branding";

export {
  listRegistryEntries,
  getRegistryEntryByTypeId,
  resolveComponentEntry,
} from "./registry/registry";
export { RENDER_LIMITS } from "./registry/limits";
export type {
  AnyRegistryEntry,
  CatalogEntryMeta,
  ComponentCategory,
  ComponentRenderProps,
  DataBindingShape,
  RegistryEntry,
} from "./registry/types";
export { CHROME_CATALOG } from "./registry/components/chrome";

export { resolveHomePage, resolvePageByPath, buildNavItems, type ResolvedNavItem } from "./render/resolvePage";
export { generateDemoRows, labelForFieldValue } from "./render/demoData";
export { renderPreview } from "./render/renderPreview";
export type {
  PreviewRenderInput,
  PreviewRenderResult,
  PreviewRenderSuccess,
  PreviewRenderFailure,
} from "./render/renderPreview";
export type { RenderError, RenderErrorResult } from "./render/types";

export { listTemplates, getTemplate } from "./templates/registry";
export type { AppTemplate } from "./templates/types";
