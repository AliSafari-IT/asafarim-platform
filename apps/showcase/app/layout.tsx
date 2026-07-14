import type { Metadata } from "next";
import type { ReactNode } from "react";
import { auth, signOut } from "@asafarim/auth";
import {
  AppShell,
  AppSwitcher,
  Button,
  ButtonLink,
  TopNav,
  UserMenu,
  getPlatformLinks,
} from "@asafarim/ui";
import "@asafarim/ui/styles.css";

export const metadata: Metadata = {
  title: {
    default: "ASafarIM Showcase",
    template: "%s | ASafarIM Showcase",
  },
  description:
    "Curated projects from the ASafarIM Digital lab — demos, case studies, and experiments.",
};

export default async function RootLayout({ children }: { children: ReactNode }) {
  const session = await auth();
  const links = getPlatformLinks();

  return (
    <html lang="en" suppressHydrationWarning>
      <body data-app="showcase">
        <AppShell
          product="Showcase"
          nav={
            <TopNav
              items={[
                { label: "Exhibition", href: "/" },
                { label: "Projects", href: "/projects" },
                { label: "Labs", href: "/labs" },
              ]}
            />
          }
          user={
            <>
              <AppSwitcher
                links={[
                  { label: "ASafarIM Digital", href: links.web, meta: "studio" },
                  { label: "Hub", href: links.hub, meta: session?.user ? "dashboard" : "sign in" },
                ]}
              />
              {session?.user ? (
                <UserMenu
                  name={session.user.name}
                  email={session.user.email}
                  image={session.user.image}
                  roles={session.user.roles}
                  profileHref={`${links.hub}/profile`}
                >
                  <form
                    action={async () => {
                      "use server";
                      await signOut({ redirectTo: "/" });
                    }}
                  >
                    <Button type="submit" variant="secondary" size="sm">
                      Sign out
                    </Button>
                  </form>
                </UserMenu>
              ) : (
                <ButtonLink href={`${links.hub}/sign-in`} size="sm">
                  Sign in
                </ButtonLink>
              )}
            </>
          }
        >
          {children}
        </AppShell>
      </body>
    </html>
  );
}
