/**
 * Services offered by the studio. Rewritten from the asafarim-dot-be
 * freelance services section and the asafarim-digital positioning.
 */

export interface Service {
  title: string;
  body: string;
  note: string;
}

export const services: Service[] = [
  {
    title: "Full-stack web applications",
    body: "End-to-end platforms with Next.js/React on the front and .NET or Node.js behind — the same stack this platform runs on, taken from data model to deployment.",
    note: "next.js · react · .net · node",
  },
  {
    title: "APIs & platform architecture",
    body: "REST APIs, authentication and role systems, multi-app platforms with single sign-on, and PostgreSQL data models that hold up as products grow.",
    note: "rest · sso · postgresql · prisma",
  },
  {
    title: "Dashboards & internal tools",
    body: "Real-time operational dashboards, admin consoles, and business tools — including live data over SignalR/websockets and role-based access.",
    note: "real-time · rbac · data viz",
  },
  {
    title: "Deployment & operations",
    body: "Dockerized deployments, reverse proxies, CI/CD pipelines, systemd services, and VPS operations that stay boring in the best way.",
    note: "docker · caddy · ci/cd · linux",
  },
  {
    title: "Test automation",
    body: "E2E suites with TestCafe or Playwright, generated tests, GitHub Actions integration, and live reporting — proven to cut manual testing time by ~80%.",
    note: "e2e · testcafe · github actions",
  },
  {
    title: "AI-assisted product tools",
    body: "Content generation workspaces, AI-supported matching and drafting tools — LLM features integrated where they remove real work.",
    note: "openai · anthropic · workflows",
  },
  {
    title: "Scientific & data software",
    body: "Python and R tooling for modeling, analysis, and visualization, grounded in a research background in engineering hydrology.",
    note: "python · r · modeling",
  },
  {
    title: "Code rescue & refactoring",
    body: "Technical-debt reduction, performance work, and codebase modernization for projects that grew faster than their foundations.",
    note: "audits · performance · cleanup",
  },
];

export const engagement = {
  heading: "How the studio works",
  points: [
    {
      title: "End to end, not staff augmentation",
      body: "Projects are taken as a whole: design, build, deploy, document. You get working software, not billable hours.",
    },
    {
      title: "Small, honest scope",
      body: "A working first version beats a perfect plan. Scope is cut to what ships, then improved in the open.",
    },
    {
      title: "Production is the finish line",
      body: "Every engagement ends with the software running on real infrastructure with deployment docs — not a zip file.",
    },
  ],
};
