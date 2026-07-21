"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  LayoutDashboard,
  ListChecks,
  Boxes,
  FlaskConical,
  PlayCircle,
  FileBarChart,
  BookOpen,
  AppWindow,
  Bug,
  Loader2,
  Menu,
  X,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { useRun } from "@/components/run-provider";
import { Logo } from "@/components/logo";
import { TourTrigger } from "@/components/run/run-tour";

const navItems = [
  { href: "/", label: "Dashboard", icon: LayoutDashboard },
  { href: "/apps", label: "Apps", icon: AppWindow },
  { href: "/requirements", label: "Requirements", icon: ListChecks },
  { href: "/suites", label: "Suites", icon: Boxes },
  { href: "/fixtures", label: "Fixtures", icon: FlaskConical },
  { href: "/cases", label: "Test Cases", icon: FlaskConical },
  { href: "/run", label: "Run Tests", icon: PlayCircle },
  { href: "/results", label: "Results", icon: FileBarChart },
  { href: "/about", label: "About & Guide", icon: BookOpen },
];

export function SidebarNav() {
  const pathname = usePathname();
  const { running, projectId } = useRun();
  const [open, setOpen] = useState(false);

  // Issues are scoped to the active app, so this link is dynamic. `match` lets it
  // stay highlighted across /apps/<id>/issues and the per-issue detail pages.
  const items = [
    ...navItems,
    {
      href: `/apps/${projectId}/issues`,
      match: `/apps/${projectId}/issues`,
      label: "Issues",
      icon: Bug,
    },
  ];

  // Close the mobile drawer whenever the route changes (i.e. after a nav click).
  useEffect(() => {
    setOpen(false);
  }, [pathname]);

  return (
    <>
      {/* Mobile top bar with the menu toggle — hidden from md up. */}
      <header className="fixed inset-x-0 top-0 z-40 flex h-14 items-center gap-3 border-b border-border bg-card/90 px-4 backdrop-blur md:hidden">
        <button
          type="button"
          onClick={() => setOpen(true)}
          aria-label="Open navigation"
          className="rounded-md p-2 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
        >
          <Menu className="h-5 w-5" />
        </button>
        <div className="flex items-center gap-2">
          <Logo className="h-7 w-7" />
          <span className="text-base font-semibold">e2e-testora</span>
        </div>
        {running && (
          <span className="ml-auto flex items-center gap-1 text-xs text-accent">
            <Loader2 className="h-3 w-3 animate-spin" />
            running
          </span>
        )}
      </header>

      {/* Backdrop behind the drawer on mobile. */}
      {open && (
        <div
          className="fixed inset-0 z-40 bg-black/60 md:hidden"
          aria-hidden="true"
          onClick={() => setOpen(false)}
        />
      )}

      {/* Sidebar: off-canvas drawer on mobile, static column from md up. */}
      <aside
        className={cn(
          "fixed inset-y-0 left-0 z-50 flex h-screen w-64 shrink-0 flex-col border-r border-border bg-card p-4 transition-transform duration-200 ease-out",
          "md:static md:z-auto md:translate-x-0 md:bg-card md:transition-none",
          open ? "translate-x-0" : "-translate-x-full",
        )}
      >
        <div className="mb-6 flex items-center justify-between px-2">
          <div className="flex items-center gap-2">
            <Logo className="h-7 w-7" />
            <span className="text-lg font-semibold">e2e-testora</span>
          </div>
          {/* Close button — drawer only. */}
          <button
            type="button"
            onClick={() => setOpen(false)}
            aria-label="Close navigation"
            className="rounded-md p-1.5 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground md:hidden"
          >
            <X className="h-5 w-5" />
          </button>
        </div>
        <nav className="flex flex-1 flex-col gap-1">
          {items.map((item) => {
            const Icon = item.icon;
            const match = "match" in item ? item.match : undefined;
            const active = match ? pathname.startsWith(match) : pathname === item.href;
            const showRunning = running && item.href === "/run";
            return (
              <Link
                key={item.href}
                href={item.href}
                className={cn(
                  "flex items-center gap-3 rounded-md px-3 py-2 text-sm font-medium text-muted-foreground transition-colors hover:bg-muted hover:text-foreground",
                  active && "bg-muted text-foreground",
                )}
              >
                <Icon className="h-4 w-4" />
                {item.label}
                {showRunning && (
                  <span className="ml-auto flex items-center gap-1 text-xs text-accent">
                    <Loader2 className="h-3 w-3 animate-spin" />
                    running
                  </span>
                )}
              </Link>
            );
          })}
        </nav>
        <div className="px-2 pb-4">
          <TourTrigger className="flex w-full items-center gap-3 rounded-md border-0 px-3 py-2 text-sm font-medium text-muted-foreground transition-colors hover:bg-muted hover:text-primary" />
        </div>
        <div className="px-2 text-xs text-muted-foreground">
          e2e-testing-db &middot; PostgreSQL
        </div>
      </aside>
    </>
  );
}
