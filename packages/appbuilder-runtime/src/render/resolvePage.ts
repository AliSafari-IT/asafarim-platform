import type { ApplicationSpecificationType, PageType } from "@asafarim/appbuilder-schema";

/**
 * The specification's homepage: the page targeted by the lowest-`order`
 * navigation item that still resolves to a real, non-archived page, falling
 * back to the first non-archived page in declaration order if navigation is
 * empty or entirely dangling. Never a caller-supplied default — the base
 * `/apps/{appId}/preview` route always resolves through this, never accepts
 * a page id from the browser as authoritative.
 */
export function resolveHomePage(spec: ApplicationSpecificationType): PageType | undefined {
  const sortedNav = [...spec.navigation].sort((a, b) => a.order - b.order);
  for (const item of sortedNav) {
    const page = spec.pages.find((candidate) => candidate.id === item.targetPageId && !candidate.archived);
    if (page) return page;
  }
  return spec.pages.find((candidate) => !candidate.archived);
}

/**
 * Resolves a page by its full `path` (segments joined with "/"), matching
 * the opaque path the preview route's catch-all segment received. Returns
 * `undefined` for an unknown or archived page — the caller renders the
 * generated-app "not found" state, never a builder-internal error.
 */
export function resolvePageByPath(spec: ApplicationSpecificationType, pathSegments: string[]): PageType | undefined {
  if (pathSegments.length === 0) return resolveHomePage(spec);
  const joined = pathSegments.join("/");
  return spec.pages.find((candidate) => !candidate.archived && candidate.path === joined);
}

export interface ResolvedNavItem {
  id: string;
  label: string;
  path: string;
  active: boolean;
}

/**
 * Navigation items are not yet gated by the generated app's own RBAC
 * (`requiredRoleIds`) here — M09 has no concept of a signed-in *generated
 * app* user/role yet, only the AppBuilder owner/collaborator viewing a
 * preview, so every non-archived, resolvable item is shown. Enforcing
 * `requiredRoleIds` belongs to the generated-app auth model M09 introduces.
 */
export function buildNavItems(spec: ApplicationSpecificationType, basePath: string, activePageId: string): ResolvedNavItem[] {
  return [...spec.navigation]
    .sort((a, b) => a.order - b.order)
    .flatMap((item) => {
      const page = spec.pages.find((candidate) => candidate.id === item.targetPageId && !candidate.archived);
      if (!page) return [];
      return [
        {
          id: item.id,
          label: item.label,
          path: page.path.length > 0 ? `${basePath}/${page.path}` : basePath,
          active: page.id === activePageId,
        },
      ];
    });
}
