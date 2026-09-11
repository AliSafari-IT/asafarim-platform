import Link from "next/link";
import { TopNav } from "@asafarim/ui";
import { Logo } from "@/components/logo";
import { PlatformHeader } from "@/components/platform-header";

const navItems = [
  { label: "Home", href: "/" },
  { label: "About & Guide", href: "/about-this-project" },
  { label: "Roadmap", href: "/roadmap" },
  { label: "Open the app", href: "/dashboard" },
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
            <Link href="/about" className="transition-colors hover:text-foreground">
              About &amp; Guide
            </Link>
            <Link href="/roadmap" className="transition-colors hover:text-foreground">
              Roadmap
            </Link>
            <Link href="/dashboard" className="transition-colors hover:text-foreground">
              Open the app
            </Link>
            <a
              href="https://asafarim.com"
              className="transition-colors hover:text-foreground"
            >
              ASafarIM
            </a>
          </div>
        </div>
      </footer>
    </div>
  );
}
