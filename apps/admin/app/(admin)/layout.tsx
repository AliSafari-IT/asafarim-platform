import type { ReactNode } from "react";
import {
  NAV_MODULES,
  ROLES,
  getAppSwitcherApps,
  getModuleOverrides,
  hasPermission,
  isModuleVisible,
  requireRole,
  signOut,
} from "@asafarim/auth";
import { CountryLanguageSelector } from "@asafarim/country-language-selector";
import { ThemeToggle } from "@asafarim/theme-toggle";
import {
  AppShell,
  AppSwitcher,
  Button,
  SideNav,
  UserMenu,
  getPlatformLinks,
  toAppSwitcherLinks,
} from "@asafarim/ui";

/**
 * Protected console layout: every route in the (admin) group requires the
 * admin (or superadmin) role. Unauthenticated users are redirected to
 * /sign-in by requireUser inside requireRole; authenticated non-admins go
 * to /denied.
 */
export default async function AdminLayout({ children }: { children: ReactNode }) {
  const session = await requireRole([ROLES.ADMIN]);
  const links = getPlatformLinks();
  // Hiding the entry is a courtesy, not a control — /seed-data re-checks
  // this permission server-side and redirects to /denied without it.
  const canViewSeeds = await hasPermission(session, "seeds.view");

  const roles = session.user.roles ?? [];
  const overrides = await getModuleOverrides();

  // The console menu is derived from the module registry and filtered by the
  // visibility matrix, so a new section appears here by being registered —
  // not by being remembered. Every listed route still re-checks its own
  // permission server-side; this only decides what is advertised.
  const navItems = NAV_MODULES.filter(
    (module) =>
      module.group === "console" &&
      module.href !== undefined &&
      isModuleVisible(module.id, { roles, overrides }) &&
      (module.id !== "console.seeds" || canViewSeeds)
  ).map((module) => ({ label: module.label, href: module.href! }));

  return (
    <AppShell
      product="Admin"
      user={
        <>
          <ThemeToggle />
          <CountryLanguageSelector lockCountry="BE" />
          <AppSwitcher
            links={toAppSwitcherLinks(
              // Access is decided by the registry; the matrix only removes
              // entries an operator chose not to advertise to this role.
              getAppSwitcherApps("admin", { roles, authenticated: true }).filter(
                (app) => isModuleVisible(`app.${app.key}`, { roles, overrides })
              ),
              links
            )}
          />
          <UserMenu
            name={session.user.name}
            email={session.user.email}
            image={session.user.image}
            roles={session.user.roles}
          >
            <form
              action={async () => {
                "use server";
                await signOut({ redirectTo: "/sign-in" });
              }}
            >
              <Button type="submit" variant="console" size="sm">
                sign out
              </Button>
            </form>
          </UserMenu>
        </>
      }
      sideNav={<SideNav title="Console" items={navItems} />}
    >
      {children}
    </AppShell>
  );
}
