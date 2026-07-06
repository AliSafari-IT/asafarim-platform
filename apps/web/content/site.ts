/**
 * Site-wide content for the public ASafarIM Digital website.
 * Sources: asafarim-digital portal (production copy) and the
 * asafarim-dot-be public site (bio, experience, education) — rewritten
 * for the studio voice. Keep copy changes here, not in page files.
 */

export const site = {
  name: "ASafarIM Digital",
  title: "Ali Safari — Full-Stack & AI Application Engineer",
  description:
    "Ali Safari is a systems-minded full-stack and AI application engineer: from engineering hydrology research to production web platforms and AI-assisted products, built and operated end to end.",

  person: {
    name: "Ali Safari",
    jobTitle: "Full-Stack & AI Application Engineer",
  },

  hero: {
    kicker: "Ali Safari · Systems engineer",
    title: "Ali Safari builds full-stack and AI application systems that ship and stay up.",
    lede: "From engineering hydrology research to production web platforms: I design, build, and operate systems end to end — identity and data layers, real-time dashboards, and AI-assisted tools, not slide decks.",
  },

  /** "Now" line under the hero — the ONE place Probex is named. */
  now: {
    label: "Now",
    text: "AI Application Developer at Probex, Genk — building AI-assisted engineering tools by day; the ASafarIM Platform is independent, self-directed work.",
  },

  principles: [
    {
      title: "Measure, then build",
      body: "A research background means claims get checked against data before they ship as features.",
    },
    {
      title: "One system, not a demo",
      body: "Production means monitored, documented, and still running next quarter — not a local screen recording.",
    },
    {
      title: "Own the whole stack",
      body: "Database schema, API, interface, and deployment are one continuous responsibility, not four hand-offs.",
    },
    {
      title: "Reuse before rebuilding",
      body: "Identity, design tokens, and deployment patterns are built once and shared — ten-plus apps run on the same foundation.",
    },
  ],

  timeline: [
    {
      time: "Education",
      title: "B.Sc. & M.Sc., Natural Resources Engineering — Tehran University",
    },
    {
      time: "Education",
      title: "PhD, Engineering Hydrology — VUB, Brussels",
      meta: "Numerical modeling of river systems",
    },
    {
      time: "2018–2019",
      title: "Research internship — Flanders Environment Agency (VMM)",
      meta: "Hydrologic modeling (FORTRAN, WetSpa) for river-flow simulation",
    },
    {
      time: "2020",
      title: "Internship — IRC Engineering",
      meta: "Energy consumption visualization (C#, R.Net)",
    },
    {
      time: "2020",
      title: "Applied Information Technology — Programming, Thomas More",
      meta: "Transition into full-stack software engineering",
    },
    {
      time: "2020–2023",
      title: "Full-stack scientific application developer — XiTechniX",
      meta: ".NET + React applications for scientific and business domains",
    },
    {
      time: "2023–2026",
      title: "Building the ASafarIM product ecosystem",
      meta: "10+ apps in production, 8 open-source packages",
    },
  ],

  platformMap: {
    heading: "How the pieces connect",
    body: "One identity layer, four doors. Everything below shares the same auth, database, and design system.",
    center: { name: "Identity & Data", meta: "Auth.js · PostgreSQL · RBAC" },
    nodes: [
      { name: "Web", meta: "public · you are here" },
      { name: "Hub", meta: "signed-in workspace" },
      { name: "Showcase", meta: "public gallery" },
      { name: "Admin", meta: "role-gated console" },
      { name: "Production apps", meta: "Vionto · EduMatch · Ops Hub · Content Gen" },
    ],
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
