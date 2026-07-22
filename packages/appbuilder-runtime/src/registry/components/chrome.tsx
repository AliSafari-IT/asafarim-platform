import type { ReactNode } from "react";
import { Badge, PageHeader as UiPageHeader } from "@asafarim/ui";
import type { ResolvedBranding } from "../../security/branding";
import type { CatalogEntryMeta } from "../types";

/** Registry metadata for the three structural chrome primitives — rendered exactly once per preview, driven by the whole specification rather than a single page component. */
export const CHROME_CATALOG: CatalogEntryMeta[] = [
  {
    typeId: "chrome.shell",
    displayName: "Application shell",
    category: "chrome",
    version: "0.1.0",
    responsiveNotes: "Sidebar collapses to a top menu below 768px; content column stays within a max readable width.",
    emptyStateDescription: "Not applicable — the shell always renders once branding/navigation are resolved.",
    loadingStateDescription: "Not applicable — the shell itself never fetches data.",
    errorStateDescription: "A malformed specification prevents the shell from resolving branding/navigation; the preview route renders its own diagnostic instead.",
    a11yNotes: "Landmarks: <header>, <nav aria-label='Primary'>, <main>. Skip-link target is <main>.",
  },
  {
    typeId: "chrome.navigation",
    displayName: "Sidebar / top navigation",
    category: "chrome",
    version: "0.1.0",
    responsiveNotes: "Renders as a top nav on desktop, collapsing into a disclosure menu on narrow viewports (native <details>, no client JS).",
    emptyStateDescription: "An app with no navigation items renders the shell with an empty nav landmark, not an error.",
    loadingStateDescription: "Not applicable — navigation items come from the already-loaded specification.",
    errorStateDescription: "A navigation item pointing at an unknown/archived page is dropped from the rendered list, not linked.",
    a11yNotes: "Current page marked with aria-current='page'; role-gated items are already filtered server-side, never hidden only visually.",
  },
  {
    typeId: "chrome.pageHeader",
    displayName: "Page header",
    category: "chrome",
    version: "0.1.0",
    responsiveNotes: "Title/description stack full-width on narrow viewports; unaffected by sidebar collapse.",
    emptyStateDescription: "Not applicable — every resolved page has a name.",
    loadingStateDescription: "Not applicable.",
    errorStateDescription: "Not applicable.",
    a11yNotes: "Renders a single <h1> per page — the only h1 in the generated app's document.",
  },
];

export interface ShellChromeProps {
  branding: ResolvedBranding;
  nav: ReactNode;
  children: ReactNode;
}

/** The generated-app shell — a scoped `data-ab-accent` wrapper, never an inline arbitrary style/class from the specification. */
export function ShellChrome({ branding, nav, children }: ShellChromeProps) {
  return (
    <div className="ab-shell" data-ab-accent={branding.accent} data-ab-radius={branding.radius}>
      <a href="#ab-main" className="ab-skip-link">
        Skip to content
      </a>
      <header className="ab-shell__header">
        <div className="ab-shell__brand">
          {branding.logoUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={branding.logoUrl} alt="" width={24} height={24} className="ab-shell__logo" />
          ) : null}
          <strong>{branding.productName}</strong>
          <Badge tone="neutral">Preview</Badge>
        </div>
        {nav}
      </header>
      <main id="ab-main" className="ab-shell__main">
        {children}
      </main>
    </div>
  );
}

export interface NavigationChromeItem {
  id: string;
  label: string;
  path: string;
  active: boolean;
}

export function NavigationChrome({ items }: { items: NavigationChromeItem[] }) {
  return (
    <nav aria-label="Primary" className="ab-nav">
      <ul>
        {items.map((item) => (
          <li key={item.id}>
            <a href={item.path} aria-current={item.active ? "page" : undefined}>
              {item.label}
            </a>
          </li>
        ))}
      </ul>
    </nav>
  );
}

export function PageHeaderChrome({ title, description }: { title: string; description?: string }) {
  return <UiPageHeader title={title} description={description} />;
}
