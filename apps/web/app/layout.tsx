import type { Metadata } from "next";
import type { ReactNode } from "react";
import { AppShell, TopNav, getPlatformLinks } from "@asafarim/ui";

export const metadata: Metadata = {
  title: {
    default: "ASafarIM Digital",
    template: "%s | ASafarIM Digital",
  },
  description: "ASafarIM Digital — software, web platforms, and consultancy",
};

export default function RootLayout({ children }: { children: ReactNode }) {
  const links = getPlatformLinks();

  return (
    <html lang="en">
      <body style={{ margin: 0 }}>
        <AppShell
          appName="Web"
          nav={
            <TopNav
              items={[
                { label: "Home", href: "/" },
                { label: "About", href: "/about" },
                { label: "Services", href: "/services" },
                { label: "Projects", href: "/projects" },
                { label: "Contact", href: "/contact" },
                { label: "Showcase ↗", href: links.showcase },
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
