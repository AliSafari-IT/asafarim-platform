import type { Metadata } from "next";
import type { ReactNode } from "react";
import { auth, signOut, hasRole, ROLES } from "@asafarim/auth";
import {
  AppShell,
  Button,
  ButtonLink,
  TopNav,
  UserMenu,
  getPlatformLinks,
} from "@asafarim/ui";
import "@asafarim/ui/styles.css";

export const metadata: Metadata = {
  title: {
    default: "ASafarIM Hub",
    template: "%s | ASafarIM Hub",
  },
  description:
    "Your workspace for apps, showcases, and experiments — mission control for the ASafarIM Platform.",
};

export default async function RootLayout({ children }: { children: ReactNode }) {
  const session = await auth();
  const links = getPlatformLinks();
  const isAdminUser = hasRole(session, [ROLES.ADMIN]);

  const navItems = [
    { label: "Home", href: "/" },
    ...(session?.user
      ? [
          { label: "Dashboard", href: "/dashboard" },
          { label: "Apps", href: "/apps" },
          { label: "Profile", href: "/profile" },
          { label: "Settings", href: "/settings" },
        ]
      : []),
    { label: "Website ↗", href: links.web },
    ...(isAdminUser ? [{ label: "Admin ↗", href: links.admin }] : []),
  ];

  return (
    <html lang="en">
      <body data-app="hub">
        <AppShell
          product="Hub"
          nav={<TopNav items={navItems} />}
          user={
            session?.user ? (
              <UserMenu
                name={session.user.name}
                email={session.user.email}
                roles={session.user.roles}
              >
                <form
                  action={async () => {
                    "use server";
                    await signOut({ redirectTo: "/" });
                  }}
                >
                  <Button type="submit" variant="ghost" size="sm">
                    Sign out
                  </Button>
                </form>
              </UserMenu>
            ) : (
              <ButtonLink href="/sign-in" size="sm">
                Sign in
              </ButtonLink>
            )
          }
        >
          {children}
        </AppShell>
      </body>
    </html>
  );
}
