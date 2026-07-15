/**
 * Evidence model (GitHub issue #8): every capability claim on the homepage
 * is backed by a structured record, not a bare assertion. Fields:
 * claim, proofType, result (measurable), link (public proof, optional),
 * date, status, technologies, confidentiality.
 *
 * confidentiality:
 *  - "public"    → link points to a public repo/package/live app
 *  - "described" → real work, described from experience; no public link
 *                  exists (employer/customer material is never published)
 */

export type ProofType =
  | "production system"
  | "open-source package"
  | "research"
  | "professional experience";

export type Confidentiality = "public" | "described";

export interface EvidenceItem {
  id: string;
  claim: string;
  proofType: ProofType;
  result: string;
  link?: string;
  linkLabel?: string;
  date: string;
  status: "live" | "beta" | "archived" | "experience";
  technologies: string[];
  confidentiality: Confidentiality;
}

/** Compact rail shown directly under the hero — the strongest, most concrete proofs. */
export const evidenceRail: EvidenceItem[] = [
  {
    id: "platform",
    claim: "Built the shared identity layer for 10+ production apps",
    proofType: "production system",
    result: "One login, one role system, one database — across every app",
    link: "https://github.com/AliSafari-IT/asafarim-platform",
    linkLabel: "Source",
    date: "2020–2026",
    status: "live",
    technologies: ["Next.js", "Auth.js", "PostgreSQL", "Prisma"],
    confidentiality: "public",
  },
  {
    id: "testora",
    claim: "Cut manual E2E test time by ~80% with a generated-test platform",
    proofType: "production system",
    result: "80% less manual testing time; real-time run reporting over SignalR",
    date: "2022–2023",
    status: "beta",
    technologies: [".NET 8", "React", "TestCafe", "SignalR"],
    confidentiality: "described",
  },
  {
    id: "smartops",
    claim: "Shipped a real-time ops dashboard serving 100+ concurrent connections",
    proofType: "production system",
    result: "100+ concurrent live connections, sub-second device status updates",
    date: "2021–2022",
    status: "beta",
    technologies: ["React", ".NET 8", "SignalR", "PostgreSQL"],
    confidentiality: "described",
  },
  {
    id: "packages",
    claim: "Published 8 open-source packages extracted from real projects",
    proofType: "open-source package",
    result: "8 packages under @asafarim on npm, in active use across the studio's apps",
    link: "https://www.npmjs.com/~asafarim",
    linkLabel: "npm profile",
    date: "2023–2026",
    status: "live",
    technologies: ["React", "TypeScript", "npm"],
    confidentiality: "public",
  },
  {
    id: "hydrology",
    claim: "Research-grade modeling discipline applied to software engineering",
    proofType: "research",
    result: "A data-first, measurement-before-building culture inherited from engineering hydrology research",
    date: "VUB, Brussels",
    status: "experience",
    technologies: ["Numerical modeling", "R", "FORTRAN"],
    confidentiality: "described",
  },
];

export interface ProblemSolved {
  problem: string;
  solution: string;
  result: string;
  link?: string;
  linkLabel?: string;
  technologies: string[];
  confidentiality: Confidentiality;
}

/** Selected work, grouped by the problem it solved — not by tech stack. */
export const workByProblem: ProblemSolved[] = [
  {
    problem: "Every new app meant rebuilding login, roles, and user data from scratch.",
    solution:
      "Designed a shared identity package (Auth.js + PostgreSQL + RBAC) once, then reused it across every app on the ASafarIM Platform — this site, the Hub, the Admin console, and beyond.",
    result: "One account and one role system now cover 10+ apps.",
    link: "https://github.com/AliSafari-IT/asafarim-platform",
    linkLabel: "View the platform",
    technologies: ["Next.js", "Auth.js", "PostgreSQL", "Prisma"],
    confidentiality: "public",
  },
  {
    problem: "Manual end-to-end testing was slow, inconsistent, and delayed releases.",
    solution:
      "Built a platform that generates TestCafe suites from the UI, wires them into GitHub Actions, and streams results back live over SignalR.",
    result: "~80% reduction in manual testing time, with faster and more confident releases.",
    technologies: [".NET 8", "React", "TestCafe", "SignalR"],
    confidentiality: "described",
  },
  {
    problem: "An operations team had no real-time visibility into IoT device state.",
    solution:
      "Delivered a live dashboard with SignalR push updates, role-based access control, and device management built for concurrent, always-on use.",
    result: "100+ concurrent users, instant status updates, less time spent guessing system state.",
    technologies: ["React", ".NET 8", "SignalR", "PostgreSQL"],
    confidentiality: "described",
  },
  {
    problem: "Students and tutors had no structured way to find and book each other.",
    solution:
      "Built an AI-assisted matching platform handling inquiries, quotes, bookings, wallets, and tutor verification end to end.",
    result: "A working two-sided marketplace running in production.",
    technologies: ["Next.js", "PostgreSQL", "AI"],
    confidentiality: "public",
  },
  {
    problem: "Environmental data needed to become decision-ready models, not spreadsheets.",
    solution:
      "Research-grade numerical modeling applied to river-flow simulation — the same data-first discipline now applied to software: measure first, then build.",
    result: "A research background that still shapes how systems here are designed and verified.",
    technologies: ["Numerical modeling", "R", "Data analysis"],
    confidentiality: "described",
  },
];
