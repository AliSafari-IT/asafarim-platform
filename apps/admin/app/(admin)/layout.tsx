import type { ReactNode } from "react";
import { hasPermission, requireRole, signOut, ROLES, getAppSwitcherApps } from "@asafarim/auth";
import { CountryLanguageSelector } from "@asafarim/country-language-selector";
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

  return (
    <AppShell
      product="Admin"
      user={
        <>
          <CountryLanguageSelector lockCountry="BE" />
          <AppSwitcher
            links={toAppSwitcherLinks(
              getAppSwitcherApps("admin", {
                roles: session.user.roles ?? [],
                authenticated: true,
              }),
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
      sideNav={
        <SideNav
          title="Console"
          items={[
            { label: "Overview", href: "/" },
            { label: "Users", href: "/users" },
            { label: "Roles", href: "/roles" },
            { label: "Permissions", href: "/permissions" },
            { label: "Audit Logs", href: "/audit-logs" },
            ...(canViewSeeds ? [{ label: "Seed Data", href: "/seed-data" }] : []),
            { label: "Subscriptions", href: "/subscriptions" },
            { label: "Devices", href: "/devices" },
            { label: "Settings", href: "/settings" },
          ]}
        />
      }
    >
      {children}
    </AppShell>
  );
}
