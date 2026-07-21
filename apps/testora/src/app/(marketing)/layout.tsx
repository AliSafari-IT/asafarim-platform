import Link from "next/link";
import { Logo } from "@/components/logo";
import { Button } from "@/components/ui/button";

export default function MarketingLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex min-h-screen flex-col">
      <header className="sticky top-0 z-40 border-b border-border bg-background/80 backdrop-blur">
        <div className="mx-auto flex h-16 w-full max-w-6xl items-center justify-between px-6">
          <Link href="/" className="flex items-center gap-2.5">
            <Logo className="h-8 w-8" />
            <span className="text-lg font-semibold tracking-tight">Testora</span>
          </Link>
          <nav className="flex items-center gap-2 sm:gap-4">
            <Link
              href="#features"
              className="hidden rounded-md px-3 py-2 text-sm text-muted-foreground transition-colors hover:text-foreground sm:block"
            >
              Features
            </Link>
            <Link
              href="#how"
              className="hidden rounded-md px-3 py-2 text-sm text-muted-foreground transition-colors hover:text-foreground sm:block"
            >
              How it works
            </Link>
            <Button asChild size="sm">
              <Link href="/dashboard">Open the app</Link>
            </Button>
          </nav>
        </div>
      </header>

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
