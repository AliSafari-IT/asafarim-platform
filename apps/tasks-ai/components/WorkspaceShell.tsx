"use client";

import { createContext, useContext, type ReactNode } from "react";
import { usePathname } from "next/navigation";
import { CommandPalette } from "./CommandPalette";
import { NotificationBell } from "./NotificationBell";
import { CaptureButton, CaptureProvider } from "./capture/CaptureDialog";

interface WorkspaceCtx {
  slug: string;
  workspaceName: string;
  role: string;
  membershipId: string;
}

const Ctx = createContext<WorkspaceCtx | null>(null);

export function useWorkspace(): WorkspaceCtx {
  const v = useContext(Ctx);
  if (!v) throw new Error("useWorkspace outside WorkspaceShell");
  return v;
}

const NAV: { label: string; href: (s: string) => string; exact?: boolean }[] = [
  // Home is the workspace entry point (issue #365) — matched exactly, since
  // every other workspace route is a prefix of it.
  { label: "Home", href: (s: string) => `/w/${s}`, exact: true },
  // Inbox is the triage queue for captured work (issue #366) — not a second
  // copy of the open-task list.
  { label: "Inbox", href: (s: string) => `/w/${s}/inbox` },
  { label: "My Work", href: (s: string) => `/w/${s}/my-work` },
  { label: "Focus", href: (s: string) => `/w/${s}/focus` },
  { label: "Projects", href: (s: string) => `/w/${s}/projects` },
  { label: "Search", href: (s: string) => `/w/${s}/search` },
  { label: "Automations", href: (s: string) => `/w/${s}/automations` },
  { label: "Copilot", href: (s: string) => `/w/${s}/copilot` },
  { label: "Analytics", href: (s: string) => `/w/${s}/analytics` },
  { label: "Settings", href: (s: string) => `/w/${s}/settings` },
];

export function WorkspaceShell({
  slug,
  workspaceName,
  role,
  membershipId,
  children,
}: WorkspaceCtx & { children: ReactNode }) {
  const pathname = usePathname();
  return (
    <Ctx.Provider value={{ slug, workspaceName, role, membershipId }}>
      <CaptureProvider slug={slug} role={role} membershipId={membershipId}>
        <div className="ta-ws" data-app="tasks-ai">
          <aside className="ta-ws__nav" aria-label="Workspace">
            {/* div, not p: the NotificationBell renders a <div>, and a div
                inside a <p> is invalid HTML — the browser closes the <p> early,
                which fails hydration on every workspace page. */}
            <div className="ta-ws__name">
              {workspaceName}
              <NotificationBell slug={slug} />
            </div>
            {/* The primary action on every workspace page (issue #366). ⌘K
                stays for power users, but it is no longer the only convenient
                way to get work out of your head and into the system. */}
            <CaptureButton />
            <nav>
              <ul>
                {NAV.map((n) => {
                  const href = n.href(slug);
                  const active = n.exact
                    ? pathname === href
                    : pathname === href || pathname.startsWith(`${href}/`);
                  return (
                    <li key={n.label}>
                      <a href={href} aria-current={active ? "page" : undefined}>
                        {n.label}
                      </a>
                    </li>
                  );
                })}
              </ul>
            </nav>
            <p className="ta-ws__hint">
              <kbd>⌘</kbd> <kbd>K</kbd> for commands
            </p>
          </aside>
          <div className="ta-ws__main">{children}</div>
        </div>
        <CommandPalette slug={slug} />
      </CaptureProvider>
    </Ctx.Provider>
  );
}
