import type { Metadata } from "next";
import type { ReactNode } from "react";
import { AppShell, TopNav, getPlatformLinks } from "@asafarim/ui";

export const metadata: Metadata = {
  title: {
    default: "ASafarIM Showcase",
    template: "%s | ASafarIM Showcase",
  },
  description: "Public showcase of ASafarIM demos, apps, and case studies",
};

export default function RootLayout({ children }: { children: ReactNode }) {
  const links = getPlatformLinks();

  return (
    <html lang="en">
      <body style={{ margin: 0 }}>
        <AppShell
          appName="Showcase"
          nav={
            <TopNav
              items={[
                { label: "Home", href: "/" },
                { label: "Projects", href: "/projects" },
                { label: "Labs", href: "/labs" },
                { label: "Website ↗", href: links.web },
                { label: "Hub ↗", href: links.hub },
              ]}
            />
          }
        >
          {children}
        </AppShell>
      </body>
    </html>
  );
}
