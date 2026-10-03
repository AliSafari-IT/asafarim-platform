import type { Metadata } from "next";
import Link from "next/link";
import { TopNav } from "@asafarim/ui";
import { Logo } from "@/components/logo";
import { PlatformHeader } from "@/components/platform-header";
import { PUBLIC_SITE_URL, appUrl } from "@/lib/public-site";

/** Canonical and OpenGraph URLs of the public pages resolve against testora.cloud (#762). */
export const metadata: Metadata = { metadataBase: new URL(PUBLIC_SITE_URL) };

const navItems = [
  { label: "Home", href: "/" },
  { label: "About & Guide", href: "/about-this-project" },
  { label: "Roadmap", href: "/roadmap" },
  // The app lives on its own origin; on testora.cloud only the public pages are served.
  { label: "Open the app", href: appUrl("/dashboard") },
];

export default function MarketingLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex min-h-screen flex-col">
      <PlatformHeader nav={<TopNav items={navItems} />} />

      <div className="flex-1">{children}</div>

      <footer className="border-t border-border">
        <div className="mx-auto flex w-full max-w-6xl flex-col items-center justify-between gap-3 px-6 py-8 text-sm text-muted-foreground sm:flex-row">
          <div className="flex items-center gap-2">
            <Logo className="h-5 w-5" />
            <span>Testora — E2E test automation</span>
          </div>
          <div className="flex items-center gap-4">
            <Link href="/about-this-project" className="transition-colors hover:text-foreground">
              About &amp; Guide
            </Link>
            <Link href="/roadmap" className="transition-colors hover:text-foreground">
              Roadmap
            </Link>
            <a href={appUrl("/dashboard")} className="transition-colors hover:text-foreground">
              Open the app
            </a>
            <a
              href="https://asafarim.com"
              className="transition-colors hover:text-foreground"
            >
              ASafariM
            </a>
          </div>
        </div>
      </footer>
    </div>
  );
}
