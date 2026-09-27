import type { Translate } from "./tools/labels";

export interface NavItem {
  label: string;
  href: string;
}

/**
 * Primary navigation for the public site. The AI Workbench entry appears
 * only once the catalogue lists at least one public tool.
 */
export function primaryNavItems(t: Translate, { showTools }: { showTools: boolean }): NavItem[] {
  return [
    { label: t("portal.nav.studio"), href: "/" },
    { label: t("portal.nav.about"), href: "/about" },
    { label: t("portal.nav.services"), href: "/services" },
    { label: t("portal.nav.projects"), href: "/projects" },
    ...(showTools ? [{ label: t("web.nav.tools"), href: "/tools" }] : []),
    { label: t("portal.nav.contact"), href: "/contact" },
  ];
}
