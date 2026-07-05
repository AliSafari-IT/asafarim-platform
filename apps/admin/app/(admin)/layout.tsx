import type { ReactNode } from "react";
import { requireRole, signOut, ROLES } from "@asafarim/auth";
import {
  AppShell,
  Button,
  SideNav,
  TopNav,
  UserMenu,
  getPlatformLinks,
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

  return (
    <AppShell
      product="Admin"
      nav={
        <TopNav
          items={[
            { label: "Hub ↗", href: links.hub },
            { label: "Website ↗", href: links.web },
            { label: "Showcase ↗", href: links.showcase },
          ]}
        />
      }
      user={
        <UserMenu
          name={session.user.name}
          email={session.user.email}
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
            { label: "Settings", href: "/settings" },
          ]}
        />
      }
    >
      {children}
    </AppShell>
  );
}
