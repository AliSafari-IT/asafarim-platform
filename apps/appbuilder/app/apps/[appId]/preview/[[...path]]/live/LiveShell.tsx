"use client";

import type { ApplicationSpecificationType, PageType } from "@asafarim/appbuilder-schema";
import type { ResolvedBranding } from "@asafarim/appbuilder-runtime";
import { Badge, PageHeader } from "@asafarim/ui";
import type { ResolvedNavItem } from "@asafarim/appbuilder-runtime";
import { LivePageComponents } from "./LivePageComponents";

export interface LiveShellProps {
  appId: string;
  spec: ApplicationSpecificationType;
  roleIds: string[];
  simulated: boolean;
  simulateRoleId?: string;
  isEndUser: boolean;
  branding: ResolvedBranding;
  navItems: ResolvedNavItem[];
  page: PageType;
  isHomePage: boolean;
}

/**
 * The live, interactive counterpart to `@asafarim/appbuilder-runtime`'s
 * `ShellChrome`/`NavigationChrome` (M06) — reuses the same `.ab-*` CSS
 * classes for visual parity but is a Client Component so its children can
 * actually fetch/mutate real data. Intentionally NOT exported from or added
 * to the shared `@asafarim/appbuilder-runtime` package: this is
 * apps/appbuilder-only, so M06's demo preview (used by every other app
 * without a live data engine reason to exist) is completely unaffected.
 */
export function LiveShell({ appId, spec, roleIds, simulated, simulateRoleId, isEndUser, branding, navItems, page, isHomePage }: LiveShellProps) {
  const simulatedRoleName = simulated && simulateRoleId ? spec.roles.find((r) => r.id === simulateRoleId)?.name ?? simulateRoleId : undefined;

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
          {simulated ? <Badge tone="warning">Viewing as: {simulatedRoleName} (simulated)</Badge> : isEndUser ? <Badge tone="success">Live</Badge> : <Badge tone="info">Live preview</Badge>}
        </div>
        <nav aria-label="Primary" className="ab-nav">
          <ul>
            {navItems.map((item) => (
              <li key={item.id}>
                <a href={item.path} aria-current={item.active ? "page" : undefined}>
                  {item.label}
                </a>
              </li>
            ))}
          </ul>
        </nav>
      </header>
      <main id="ab-main" className="ab-shell__main">
        <PageHeader title={page.name} />
        <LivePageComponents appId={appId} page={page} spec={spec} roleIds={roleIds} simulateRoleId={simulated ? simulateRoleId : undefined} dashboardWidgets={isHomePage ? spec.dashboard.widgets : []} />
      </main>
    </div>
  );
}
