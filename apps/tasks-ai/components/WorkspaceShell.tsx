"use client";

import { createContext, useContext, type ReactNode } from "react";
import { usePathname } from "next/navigation";
import { CommandPalette } from "./CommandPalette";
import { NotificationBell } from "./NotificationBell";

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

const NAV = [
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
      <div className="ta-ws" data-app="tasks-ai">
        <aside className="ta-ws__nav" aria-label="Workspace">
          {/* div, not p: the NotificationBell renders a <div>, and a div
              inside a <p> is invalid HTML — the browser closes the <p> early,
              which fails hydration on every workspace page. */}
          <div className="ta-ws__name">
            {workspaceName}
            <NotificationBell slug={slug} />
          </div>
          <nav>
            <ul>
              {NAV.map((n) => {
                const href = n.href(slug);
                const active = pathname === href || pathname.startsWith(`${href}/`);
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
    </Ctx.Provider>
  );
}
