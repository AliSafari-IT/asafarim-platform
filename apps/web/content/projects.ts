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
          "The monorepo backbone: auth, database schema, design system, and deployment plumbing shared by 10+ apps.",
        tech: ["Next.js", "TypeScript", "Turborepo", "Prisma", "PostgreSQL"],
        href: "https://github.com/AliSafari-IT/asafarim-platform",
      },
      {
        name: "@asafarim/ui",
        status: "live",
        description:
          "Shared React component library and design tokens used across every property in the platform.",
        tech: ["React", "TypeScript", "CSS variables"],
      },
      {
        name: "@asafarim/auth",
        status: "live",
        description:
          "Authentication and role primitives wrapped around Auth.js and reused by web, hub, admin, and product apps.",
        tech: ["Auth.js", "Next.js", "Prisma"],
      },
      {
        name: "@asafarim/db",
        status: "live",
        description:
          "Single Prisma schema and generated client shared across the monorepo for consistent data access.",
        tech: ["Prisma", "PostgreSQL"],
      },
    ],
  },
  {
    title: "Products",
    kicker: "Shipped",
    intro:
      "Customer-facing applications built to solve real workflow problems — from content generation to matching and operations.",
    projects: [
      {
        name: "Vionto",
        status: "beta",
        description:
          "AI-powered photo-to-story studio that turns image collections into narrated MP4 videos.",
        tech: ["Next.js", "OpenAI", "Prisma", "TailwindCSS"],
        href: links.vionto,
      },
      {
        name: "EduMatch",
        status: "live",
        description:
          "Matching platform connecting learners, educators, and learning opportunities.",
        tech: ["React", "Node.js", "PostgreSQL"],
      },
      {
        name: "SmartOps / Ops Hub",
        status: "planned",
        description:
          "Internal operations dashboard for monitoring jobs, alerts, and team activity.",
        tech: ["Next.js", "TypeScript", "Tremor", "Docker"],
      },
      {
        name: "Content Gen",
        status: "planned",
        description:
          "Structured content generation pipeline for product descriptions, variants, and SEO metadata.",
        tech: ["Next.js", "LangChain", "Zod"],
      },
    ],
  },
  {
    title: "Showcase",
    kicker: "Demos",
    intro:
          "Live, interactive demos and open-source experiments that demonstrate platform capabilities.",
    projects: [
      {
        name: "ASafarIM Showcase",
        status: "live",
        description:
          "Public gallery of working software demos and case studies hosted on the platform.",
        tech: ["Next.js", "Turbopack", "TailwindCSS"],
      },
      {
        name: "Testora",
        status: "live",
        description:
          "Benchmarking and evaluation playground for AI models and prompts.",
        tech: ["Next.js", "TypeScript", "AI SDK"],
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
          "Internationalization utilities and locale dictionaries shared across apps.",
        tech: ["TypeScript", "i18next"],
      },
      {
        name: "@asafarim/country-language-selector",
        status: "live",
        description:
          "React component for picking countries, regions, and languages with built-in data.",
        tech: ["React", "TypeScript"],
      },
    ],
  },
];
