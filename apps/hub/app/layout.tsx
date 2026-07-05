import type { Metadata } from "next";
import type { ReactNode } from "react";
import { auth, signOut, hasRole, ROLES } from "@asafarim/auth";
import { AppShell, Button, TopNav, UserMenu, getPlatformLinks } from "@asafarim/ui";

export const metadata: Metadata = {
  title: {
    default: "ASafarIM Hub",
    template: "%s | ASafarIM Hub",
  },
  description: "Central logged-in dashboard of the ASafarIM Platform",
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
      <body style={{ margin: 0 }}>
        <AppShell
          appName="Hub"
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
                  <Button
                    type="submit"
                    style={{ padding: "0.35rem 0.9rem", fontSize: "0.85rem" }}
                  >
                    Sign out
                  </Button>
                </form>
              </UserMenu>
            ) : (
              <a href="/sign-in">
                <Button style={{ padding: "0.35rem 0.9rem", fontSize: "0.85rem" }}>
                  Sign in
                </Button>
              </a>
            )
          }
        >
          {children}
        </AppShell>
      </body>
    </html>
  );
}
