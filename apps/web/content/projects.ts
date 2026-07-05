/**
 * Curated public project overview. Static summaries only — full apps and
 * case studies are migrated to the Showcase in a later PR.
 * Sources: asafarim-digital (products in production) and asafarim-dot-be
 * (showcase verticals, open-source packages).
 */

import type { Status } from "@asafarim/ui";

export interface ProjectEntry {
  name: string;
  description: string;
  status: Status;
  tech: string[];
  /** Optional link (external product or platform app). */
  href?: string;
}

export interface ProjectGroup {
  kicker: string;
  title: string;
  intro: string;
  projects: ProjectEntry[];
}

export const projectGroups: ProjectGroup[] = [
  {
    kicker: "The platform",
    title: "ASafarIM Platform",
    intro: "The ecosystem this site runs on — one monorepo, one identity, many apps.",
    projects: [
      {
        name: "ASafarIM Platform",
        description:
          "Monorepo powering the studio site, Hub, Showcase, and Admin console: shared PostgreSQL database, Auth.js SSO with roles, a token-based design system, and one-command VPS deployment.",
        status: "live",
        tech: ["Next.js", "TypeScript", "Prisma", "PostgreSQL", "Docker"],
        href: "https://github.com/AliSafari-IT/asafarim-platform",
      },
      {
        name: "ASafarIM Hub",
        description:
          "The signed-in workspace: app launcher, profile, and settings behind a single account shared across every platform app.",
        status: "beta",
        tech: ["Next.js", "Auth.js", "RBAC"],
      },
      {
        name: "ASafarIM Showcase",
        description:
          "The public gallery of working software — demos, case studies, and experiments from the lab.",
        status: "beta",
        tech: ["Next.js", "Design system"],
      },
    ],
  },
  {
    kicker: "Products",
    title: "From the product lab",
    intro: "Self-built products running in production on the current asafarim.com platform.",
    projects: [
      {
        name: "Vionto",
        description:
          "AI video script generation with a render pipeline: projects, assets, audio tracks, background workers, and cloud storage.",
        status: "live",
        tech: ["Next.js", "Redis", "AI", "Object storage"],
      },
      {
        name: "EduMatch",
        description:
          "AI-assisted tutoring platform matching students and tutors, with inquiries, quotes, bookings, wallets, and verification flows.",
        status: "live",
        tech: ["Next.js", "PostgreSQL", "AI"],
      },
      {
        name: "Content Generator",
        description:
          "An AI writing workspace with project folders, chat sessions, saved prompts, and custom content-type definitions.",
        status: "live",
        tech: ["Next.js", "OpenAI", "Anthropic"],
      },
      {
        name: "Ops Hub",
        description:
          "SaaS operations console: tenants, billing, feature flags, lifecycle events, and automations behind role-gated access.",
        status: "live",
        tech: ["Next.js", "Prisma", "RBAC"],
      },
    ],
  },
  {
    kicker: "Showcase apps",
    title: "Working demos",
    intro: "End-to-end verticals built to prove patterns — moving into the Showcase as case studies.",
    projects: [
      {
        name: "Testora",
        description:
          "E2E test automation platform: generated TestCafe suites, GitHub Actions integration, and real-time run reporting over SignalR. Cut manual testing time by ~80%.",
        status: "beta",
        tech: [".NET 8", "React", "TestCafe", "SignalR"],
      },
      {
        name: "SmartOps Dashboard",
        description:
          "Real-time IoT operations dashboard with live device status for 100+ concurrent connections and role-based access.",
        status: "beta",
        tech: ["React", ".NET 8", "SignalR", "PostgreSQL"],
      },
      {
        name: "Task Management",
        description:
          "Personal and team task management with SSO, permissions, filters, and dashboards.",
        status: "beta",
        tech: ["React", "TypeScript", "PostgreSQL"],
      },
      {
        name: "Java Study Notes",
        description:
          "Academic note-taking with citations, bibliography management, tagging, search, and export.",
        status: "archived",
        tech: ["Spring Boot", "Java 21", "React"],
      },
    ],
  },
  {
    kicker: "Open source",
    title: "Published packages",
    intro: "Utilities extracted from real projects, published under @asafarim on npm.",
    projects: [
      {
        name: "@asafarim/navigation",
        description: "Navigation components shared across the studio's React apps.",
        status: "live",
        tech: ["React", "npm"],
        href: "https://www.npmjs.com/package/@asafarim/navigation",
      },
      {
        name: "@asafarim/toast",
        description:
          "Lightweight, theme-aware toast notifications for React with a simple programmatic API and zero dependencies.",
        status: "live",
        tech: ["React", "npm"],
        href: "https://www.npmjs.com/~asafarim",
      },
      {
        name: "@asafarim/react-themes",
        description:
          "Preset light/dark/high-contrast theme bundles with runtime switching utilities.",
        status: "live",
        tech: ["React", "npm"],
        href: "https://www.npmjs.com/~asafarim",
      },
      {
        name: "@asafarim/shared-i18n",
        description:
          "A small translation module for React + TypeScript apps built on i18next, with English and Dutch defaults.",
        status: "live",
        tech: ["i18next", "npm"],
        href: "https://www.npmjs.com/~asafarim",
      },
    ],
  },
];

/** Featured on the homepage — a slice of the wall. */
export const featuredProjects: ProjectEntry[] = [
  projectGroups[0].projects[0],
  projectGroups[2].projects[0],
  projectGroups[1].projects[0],
];
