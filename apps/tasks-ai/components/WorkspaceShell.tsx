"use client";

import { createContext, useContext, type ReactNode } from "react";
import { usePathname } from "next/navigation";
import { CommandPalette } from "./CommandPalette";
import { NotificationBell } from "./NotificationBell";
import { WorkspaceSwitcher, type SwitcherWorkspace } from "./WorkspaceSwitcher";
import { CaptureButton, CaptureProvider } from "./capture/CaptureDialog";

interface WorkspaceCtx {
  slug: string;
  workspaceName: string;
  role: string;
  membershipId: string;
  /**
   * Whether the AI layer is switched on (issue #368). Carried on the shell
   * context so every surface that offers a contextual Copilot entry point —
   * Inbox, projects, a task's detail drawer — asks the same question once
   * instead of each fetching settings, and so an AI-disabled workspace shows
   * no AI affordances at all rather than links into a dead end.
   */
  aiEnabled: boolean;
}

const Ctx = createContext<WorkspaceCtx | null>(null);

export function useWorkspace(): WorkspaceCtx {
  const v = useContext(Ctx);
  if (!v) throw new Error("useWorkspace outside WorkspaceShell");
  return v;
}

interface NavItem {
  label: string;
  href: (s: string) => string;
  exact?: boolean;
  /** Short, product-language explanation shown as a non-hover-only tooltip
   * (issue #369) — read via aria-describedby, not baked into the link's
   * accessible name, so `getByRole("link", { name: "Home" })` keeps working. */
  desc: string;
}

interface NavGroup {
  label: string;
  items: NavItem[];
}

/**
 * Grouped by the job it serves (issue #369) rather than one flat list of
 * nine equally-weighted labels: WORK is the daily loop (capture → plan →
 * execute), PLANNING/AI/INSIGHTS are secondary capabilities a new user
 * doesn't need on day one, WORKSPACE is administration.
 */
const NAV_GROUPS: NavGroup[] = [
  {
    label: "Work",
    items: [
      { label: "Home", href: (s) => `/w/${s}`, exact: true, desc: "Your workspace entry point." },
      {
        label: "Inbox",
        href: (s) => `/w/${s}/inbox`,
        desc: "Newly captured work waiting for review.",
      },
      {
        label: "My Work",
        href: (s) => `/w/${s}/my-work`,
        desc: "Open work assigned to you across projects.",
      },
      {
        label: "Focus",
        href: (s) => `/w/${s}/focus`,
        desc: "An explainable view of what may need attention first.",
      },
    ],
  },
  {
    label: "Planning",
    items: [
      {
        label: "Projects",
        href: (s) => `/w/${s}/projects`,
        desc: "Plan and organize team work.",
      },
      { label: "Search", href: (s) => `/w/${s}/search`, desc: "Find any task across the workspace." },
    ],
  },
  {
    label: "AI & automation",
    items: [
      {
        label: "Copilot",
        href: (s) => `/w/${s}/copilot`,
        desc: "Turn notes and briefs into proposals you review before anything changes.",
      },
      {
        label: "Automations",
        href: (s) => `/w/${s}/automations`,
        desc: "Create rules for repetitive workflow actions.",
      },
    ],
  },
  {
    label: "Insights",
    items: [
      {
        label: "Analytics",
        href: (s) => `/w/${s}/analytics`,
        desc: "See how work is moving across the workspace.",
      },
    ],
  },
  {
    label: "Workspace",
    items: [
      {
        label: "Settings",
        href: (s) => `/w/${s}/settings`,
        desc: "Manage members, roles and workspace configuration.",
      },
    ],
  },
];

export function WorkspaceShell({
  slug,
  workspaceName,
  role,
  membershipId,
  aiEnabled,
  workspaces,
  children,
}: WorkspaceCtx & { workspaces: SwitcherWorkspace[]; children: ReactNode }) {
  const pathname = usePathname();
  return (
    <Ctx.Provider value={{ slug, workspaceName, role, membershipId, aiEnabled }}>
      <CaptureProvider slug={slug} role={role} membershipId={membershipId}>
        <div className="ta-ws" data-app="tasks-ai">
          <aside className="ta-ws__nav" aria-label="Workspace">
            {/* div, not p: the NotificationBell renders a <div>, and a div
                inside a <p> is invalid HTML — the browser closes the <p> early,
                which fails hydration on every workspace page. */}
            <div className="ta-ws__name">
              <WorkspaceSwitcher slug={slug} workspaceName={workspaceName} workspaces={workspaces} />
              <NotificationBell slug={slug} />
            </div>
            {/* The primary action on every workspace page (issue #366). ⌘K
                stays for power users, but it is no longer the only convenient
                way to get work out of your head and into the system. */}
            <CaptureButton />
            <nav aria-label="Workspace">
              {NAV_GROUPS.map((group) => (
                <div className="ta-ws__group" key={group.label}>
                  <p className="ta-ws__grouplabel" id={`ws-group-${group.label}`}>
                    {group.label}
                  </p>
                  <ul aria-labelledby={`ws-group-${group.label}`}>
                    {group.items.map((n) => {
                      const href = n.href(slug);
                      const active = n.exact
                        ? pathname === href
                        : pathname === href || pathname.startsWith(`${href}/`);
                      const descId = `ws-desc-${n.label.replace(/\s+/g, "-").toLowerCase()}`;
                      return (
                        <li key={n.label}>
                          <a
                            href={href}
                            aria-current={active ? "page" : undefined}
                            aria-describedby={descId}
                            title={n.desc}
                          >
                            {n.label}
                          </a>
                          {/* Not hover-only (issue #369): a screen reader
                              always announces this via aria-describedby, and
                              the visible title tooltip is a bonus for mouse
                              users. */}
                          <span id={descId} className="ta-sr-only">
                            {n.desc}
                          </span>
                        </li>
                      );
                    })}
                  </ul>
                </div>
              ))}
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
