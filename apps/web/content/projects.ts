/**
 * Projects content for the public ASafarIM Digital website.
 */
import { getPlatformLinks } from "@asafarim/ui";

const links = getPlatformLinks();

export type Project = {
  name: string;
  status: "live" | "beta" | "planned" | "archived";
  description: string;
  tech: string[];
  href?: string;
};

export type ProjectGroup = {
  title: string;
  kicker: string;
  intro: string;
  projects: Project[];
};

export const projectGroups: ProjectGroup[] = [
  {
    title: "Platform",
    kicker: "Foundation",
    intro:
      "The shared layer every app runs on: identity, data, UI primitives, and deployment patterns built once and reused across the ecosystem.",
    projects: [
      {
        name: "ASafarIM Platform",
        status: "live",
        description:
          "The monorepo backbone: auth, database schema, design system, and deployment plumbing shared by 13 apps, deployed as one Docker Compose stack behind Caddy.",
        tech: ["Next.js", "TypeScript", "Turborepo", "Prisma", "PostgreSQL", "Docker"],
        href: "https://github.com/AliSafari-IT/asafarim-platform",
      },
      {
        name: "@asafarim/ui",
        status: "live",
        description:
          "Shared React component library and CSS design tokens used across every property in the platform.",
        tech: ["React", "TypeScript", "CSS variables"],
      },
      {
        name: "@asafarim/auth",
        status: "live",
        description:
          "Authentication and role primitives wrapped around Auth.js — email/password, email OTP, and Google OAuth — reused by every app via a central sign-in gateway.",
        tech: ["Auth.js", "Next.js", "Prisma"],
      },
      {
        name: "@asafarim/db",
        status: "live",
        description:
          "Single Prisma schema and generated client shared across the monorepo for consistent data access, RBAC, and audit logging.",
        tech: ["Prisma", "PostgreSQL"],
      },
      {
        name: "@asafarim/storage",
        status: "live",
        description:
          "S3-compatible object storage wrapper (AWS SDK v3) used for uploads and generated media across the product apps.",
        tech: ["AWS SDK", "TypeScript"],
      },
    ],
  },
  {
    title: "Products",
    kicker: "Shipped",
    intro:
      "Customer-facing applications built to solve real workflow problems — from AI video generation to job search, timeline building, and AI-native task execution.",
    projects: [
      {
        name: "Vionto",
        status: "beta",
        description:
          "AI-powered photo-to-story studio: projects own source images, albums are non-destructive subsets, and a render pipeline turns them into narrated MP4 videos.",
        tech: ["Next.js", "OpenAI", "FFmpeg", "BullMQ", "Prisma"],
        href: links.vionto,
      },
      {
        name: "TimelineAI",
        status: "live",
        description:
          "Visual timeline builder: describe your events once, then render them as a vertical, zigzag, circular, roadmap, Gantt, or calendar-board layout — with live preview, PNG/JPG/PDF export, and a public gallery.",
        tech: ["Next.js", "TypeScript", "Prisma", "Playwright"],
        href: links.timelineai,
      },
      {
        name: "EduMatch",
        status: "live",
        description:
          "A personal learning assistant that understands where a student is struggling, helps immediately where it can, and — when human support is worth it — prepares, matches, books, and tracks the tutoring.",
        tech: ["Next.js", "TypeScript", "Prisma", "PostgreSQL"],
        href: links.edumatch,
      },
      {
        name: "TasksAI",
        status: "beta",
        description:
          "AI-native work execution, from scattered intent into work your team can trust: capture, triage, plan, and an AI copilot that proposes structure you review before anything changes.",
        tech: ["Next.js", "TypeScript", "Prisma", "OpenAI"],
        href: links.tasksai,
      },
      {
        name: "JobMatch",
        status: "beta",
        description:
          "An explainable, source-transparent job-search assistant: fewer vacancies, each with the reason it fits — built on its own isolated Postgres + pgvector database.",
        tech: ["Next.js", "TypeScript", "Prisma", "pgvector"],
        href: links.jobmatch,
      },
      {
        name: "AppBuilder",
        status: "beta",
        description:
          "Metadata-driven AI application factory: describe an internal business application, get a versioned spec, refine it conversationally, validate it, and publish an immutable release.",
        tech: ["Next.js", "TypeScript", "Drizzle", "OpenAI"],
        href: links.appbuilder,
      },
    ],
  },
  {
    title: "Showcase & experiments",
    kicker: "Demos",
    intro:
      "Live, interactive demos, benchmarking tools, and the experimental workbench for what's being explored next.",
    projects: [
      {
        name: "ASafarIM Showcase",
        status: "live",
        description:
          "Public gallery of working software demos and case studies hosted on the platform.",
        tech: ["Next.js", "Turbopack", "TailwindCSS"],
        href: links.showcase,
      },
      {
        name: "Testora",
        status: "live",
        description:
          "E2E test automation platform: define functional requirements, suites, fixtures, and cases, run them with TestCafe, and store results in PostgreSQL.",
        tech: ["Next.js", "TestCafe", "Drizzle", "PostgreSQL"],
        href: links.testora,
      },
      {
        name: "ASafarIM Labs",
        status: "beta",
        description:
          "Experimental workbench — Showcase explains what's been built; Labs lets visitors interact with what's being explored next.",
        tech: ["Next.js", "TypeScript"],
        href: links.labs,
      },
      {
        name: "AI Eval Benchmark",
        status: "live",
        description:
          "Reusable benchmark harness for comparing model outputs across tasks and metrics.",
        tech: ["TypeScript", "OpenAI", "evals"],
      },
    ],
  },
  {
    title: "Open source",
    kicker: "Packages",
    intro:
      "Reusable libraries published to npm and GitHub as the platform's foundations mature.",
    projects: [
      {
        name: "@asafarim/config",
        status: "live",
        description:
          "Shared tooling configuration for ESLint, Prettier, TypeScript, and Tailwind.",
        tech: ["TypeScript", "ESLint", "Prettier"],
      },
      {
        name: "@asafarim/shared-i18n",
        status: "live",
        description:
          "Internationalization utilities and locale dictionaries (English, Dutch, French, German, Luxembourgish) shared across apps.",
        tech: ["TypeScript", "i18next"],
      },
      {
        name: "@asafarim/country-language-selector",
        status: "live",
        description:
          "React component for picking countries, regions, and languages with built-in data and region detection.",
        tech: ["React", "TypeScript"],
      },
      {
        name: "@asafarim/theme-toggle",
        status: "live",
        description:
          "Shared light/dark mode toggle used across every app in the platform.",
        tech: ["React", "TypeScript"],
      },
    ],
  },
];
