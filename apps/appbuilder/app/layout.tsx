import type { Metadata } from "next";
import type { ReactNode } from "react";
import {
  AppShell,
  AppSwitcher,
  ButtonLink,
  TopNav,
  getPlatformLinks,
} from "@asafarim/ui";
import "@asafarim/ui/styles.css";

export const metadata: Metadata = {
  title: {
    default: "AppBuilder",
    template: "%s | AppBuilder",
  },
  description:
    "Describe an internal business app in plain language and get a controlled, versioned, previewable application back.",
  icons: { icon: "/favicon.svg" },
};

export default function RootLayout({ children }: { children: ReactNode }) {
  const links = getPlatformLinks();

  return (
    <html lang="en" suppressHydrationWarning>
      <body data-app="appbuilder">
        <AppShell
          product="AppBuilder"
          nav={
            <TopNav
              items={[
                { label: "Overview", href: "/" },
                { label: "Apps", href: "/apps" },
                { label: "New app", href: "/apps/new" },
              ]}
            />
          }
          user={
            <>
              <AppSwitcher
                links={[
                  { label: "ASafarIM Digital", href: links.web, meta: "public" },
                  { label: "Hub", href: links.hub, meta: "workbench" },
                  { label: "Vionto", href: links.vionto, meta: "photo-to-story" },
                  { label: "Testora", href: links.testora, meta: "benchmark" },
                ]}
              />
              {/*
                Platform SSO lands in M03 (issue #32). Until then this links
                to the Hub's own sign-in rather than wiring a session here.
              */}
              <ButtonLink href={`${links.hub}/sign-in`} size="sm">
                Sign in
              </ButtonLink>
            </>
          }
        >
          {children}
        </AppShell>
      </body>
    </html>
  );
}
