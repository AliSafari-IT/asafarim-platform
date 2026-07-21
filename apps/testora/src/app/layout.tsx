import type { Metadata } from "next";
import { SidebarNav } from "@/components/sidebar-nav";
import { RunProvider } from "@/components/run-provider";
import { ScrollNav } from "@/components/scroll-nav";
import { AppBadge } from "@/components/app-badge";
import { getActiveProjectId } from "@/lib/active-project";
import "./globals.css";

export const metadata: Metadata = {
  title: "e2e-testora",
  description: "Define, organize and run E2E test suites backed by PostgreSQL and TestCafe.",
};

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  const activeProject = await getActiveProjectId();
  return (
    <html lang="en" className="dark">
      <body className="flex min-h-screen">
        <RunProvider initialProject={activeProject}>
          <SidebarNav />
          {/* pt accounts for the fixed mobile top bar (h-14); reset from md up. */}
          <main className="flex-1 overflow-y-auto p-8 pt-20 md:pt-8">{children}</main>
          <AppBadge />
          <ScrollNav />
        </RunProvider>
      </body>
    </html>
  );
}
