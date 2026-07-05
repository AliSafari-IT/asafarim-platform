/**
 * Site-wide content for the public ASafarIM Digital website.
 * Sources: asafarim-digital portal (production copy) and the
 * asafarim-dot-be public site (bio, experience, education) — rewritten
 * for the studio voice. Keep copy changes here, not in page files.
 */

export const site = {
  name: "ASafarIM Digital",
  title: "ASafarIM Digital — Practical Digital Products and Tools",
  description:
    "ASafarIM Digital is the personal digital studio of Ali Safari: full-stack web platforms, developer tools, and AI-assisted products — designed and built end to end.",

  hero: {
    kicker: "A digital studio",
    title: "Practical digital products, designed and built end to end.",
    lede: "ASafarIM Digital is the one-person product lab of Ali Safari — full-stack developer in Hasselt, Belgium. Web platforms, developer tools, and AI-assisted products, taken from first sketch to running software.",
  },

  intro: {
    heading: "A studio, not an agency",
    body: "Every project here is built by the same pair of hands that designed it: database schema, API, interface, and deployment. Ten-plus apps run on this stack today — sharing one identity system, one design language, and one deploy pipeline.",
  },

  stats: [
    { label: "Years building software", value: "5+" },
    { label: "Apps in production", value: "10+" },
    { label: "Open-source packages", value: "8" },
  ],

  platform: {
    heading: "One platform, many doors",
    body: "Everything the studio ships lives on the ASafarIM Platform: this website is the front door, the Showcase is the gallery of working software, and the Hub is the signed-in workspace where apps and tools launch from one account.",
    items: [
      {
        title: "ASafarIM Digital",
        text: "The public studio — services, projects, and contact.",
      },
      {
        title: "ASafarIM Showcase",
        text: "Live demos and case studies you can open and try.",
      },
      {
        title: "ASafarIM Hub",
        text: "One sign-in for every app: launcher, profile, and settings.",
      },
    ],
  },

  contact: {
    email: "contact@asafarim.com",
    location: "Hasselt, Belgium",
    availability: "Available for freelance projects — remote friendly",
    responseTime: "Replies within 24–48 hours",
    github: "https://github.com/AliSafari-IT",
    projectTypes: [
      "Full-stack web applications",
      "APIs and platform architecture",
      "Dashboards and internal tools",
      "Deployment and VPS operations",
      "Scientific / data-driven software",
    ],
  },

  about: {
    lede: "ASafarIM Digital is a personal technology brand run like a workshop: one craftsman, full stack, no hand-offs.",
    story: [
      {
        title: "From river models to web platforms",
        body: "Ali's path into software ran through science: a PhD in Engineering Hydrology (VUB, Brussels) spent modeling river systems, followed by Applied IT — Programming at Thomas More. That background still shapes how the studio works — data first, measured results, no hand-waving.",
      },
      {
        title: "Production experience",
        body: "Years as a full-stack scientific application developer at XiTechniX delivering .NET + React applications, earlier internships building energy visualizations (IRC Engineering) and enhancing hydrologic models at the Flanders Environment Agency — and since then, a steadily growing ecosystem of self-built products.",
      },
      {
        title: "Built in the open",
        body: "The platform this site runs on is itself a public project: a monorepo where the identity system, design tokens, and deployment pipeline are on display. Eight open-source npm packages under @asafarim have come out of it.",
      },
    ],
    craft: [
      "TypeScript and React on the front, .NET and Node.js on the back",
      "PostgreSQL as the source of truth, Prisma or EF Core on top",
      "One shared authentication and role system across every app",
      "Docker, Caddy/nginx, and calm VPS operations",
      "AI where it genuinely removes work, not where it demos well",
    ],
  },
} as const;
