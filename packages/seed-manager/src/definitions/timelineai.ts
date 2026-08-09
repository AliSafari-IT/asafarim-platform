// TimelineAI demo seed definitions: a small set of published, public example
// timelines spanning every layout, so the app has something to show at
// /t/<publicId> without anyone creating content by hand.
//
// Extracted from packages/db/prisma/seed-timelineai.ts, which is now a thin
// CLI wrapper. Every timeline is pinned to a deterministic id derived from
// its publicId, which is what makes both reconciliation and safe removal
// possible.

export interface DemoEventInput {
  startAt?: string;
  endAt?: string;
  displayDate?: string;
  title: string;
  description?: string;
  label?: string;
  accentColor?: string;
  link?: string;
  imageUrl?: string;
  icon?: string;
}

export interface DemoTimelineInput {
  publicId: string;
  title: string;
  subtitle?: string;
  description?: string;
  timelineType: string;
  layout: string;
  events: DemoEventInput[];
}

export const TIMELINEAI_DEFINITION_VERSION = "1.1.0";

export const TIMELINEAI_DEMO_AUTHOR_EMAIL = "timelineai-demo@asafarim.com";
export const TIMELINEAI_DEMO_AUTHOR_ID = "seed-timelineai-demo-author";

/** The deterministic primary key for a demo timeline. */
export function timelineSeedId(publicId: string): string {
  return `seed-timeline-${publicId}`;
}

// ── Simple → sophisticated, one per layout ────────────────────────────────
export const TIMELINEAI_DEMOS: DemoTimelineInput[] = [
  {
    publicId: "demo-vertical-history",
    title: "A Brief History of the Web",
    subtitle: "The simplest layout — a classic vertical timeline",
    timelineType: "historical",
    layout: "vertical",
    events: [
      { displayDate: "1989", title: "Tim Berners-Lee proposes the Web", description: "A way to share information over the internet using hypertext.", label: "Origins" },
      { displayDate: "1993", title: "The first web browser goes public", description: "Mosaic makes the Web accessible to non-technical people." },
      { displayDate: "1998", title: "Google is founded", description: "Search becomes the Web's front door.", label: "Growth" },
      { displayDate: "2007", title: "The iPhone launches", description: "Mobile browsing changes how the Web is designed." },
      { displayDate: "2020s", title: "The Web goes everywhere", description: "From watches to cars, browsers are just about everywhere now.", label: "Today" },
    ],
  },
  {
    publicId: "demo-horizontal-roadmap",
    title: "Product Launch Roadmap",
    subtitle: "A horizontal timeline for project milestones",
    timelineType: "project",
    layout: "horizontal",
    events: [
      { startAt: "2026-01-05T00:00:00.000Z", title: "Kickoff", description: "Align on scope and success metrics.", label: "Planning", accentColor: "#6d5ef8" },
      { startAt: "2026-02-01T00:00:00.000Z", title: "Design freeze", description: "UI and UX finalized.", label: "Design" },
      { startAt: "2026-03-10T00:00:00.000Z", title: "Beta release", description: "Ship to a small group of early users.", label: "Build", accentColor: "#f6a84f" },
      { startAt: "2026-04-15T00:00:00.000Z", title: "General availability", description: "Public launch.", label: "Launch", accentColor: "#10b981" },
    ],
  },
  {
    publicId: "demo-gantt-project",
    title: "Website Redesign Project Plan",
    subtitle: "A Gantt-style schedule with overlapping workstreams",
    timelineType: "gantt",
    layout: "gantt",
    events: [
      { startAt: "2026-01-05T00:00:00.000Z", endAt: "2026-01-16T00:00:00.000Z", title: "Discovery & research", label: "Research" },
      { startAt: "2026-01-12T00:00:00.000Z", endAt: "2026-02-06T00:00:00.000Z", title: "Wireframes & UX", label: "Design" },
      { startAt: "2026-02-02T00:00:00.000Z", endAt: "2026-02-27T00:00:00.000Z", title: "Visual design", label: "Design" },
      { startAt: "2026-02-16T00:00:00.000Z", endAt: "2026-03-27T00:00:00.000Z", title: "Front-end build", label: "Engineering" },
      { startAt: "2026-03-16T00:00:00.000Z", endAt: "2026-04-03T00:00:00.000Z", title: "QA & content migration", label: "Launch prep" },
      { startAt: "2026-04-06T00:00:00.000Z", endAt: "2026-04-10T00:00:00.000Z", title: "Go live", label: "Launch", accentColor: "#10b981" },
    ],
  },
  {
    publicId: "demo-calendar-events",
    title: "Company Events Calendar",
    subtitle: "Events grouped by month",
    timelineType: "calendar",
    layout: "calendar",
    events: [
      { startAt: "2026-01-15T00:00:00.000Z", title: "All-hands kickoff", label: "Company-wide" },
      { startAt: "2026-02-10T00:00:00.000Z", title: "Design review day", label: "Design" },
      { startAt: "2026-02-24T00:00:00.000Z", title: "Hackathon", label: "Engineering", accentColor: "#f6a84f" },
      { startAt: "2026-03-05T00:00:00.000Z", title: "Customer conference", label: "Marketing" },
      { startAt: "2026-03-20T00:00:00.000Z", title: "Q1 retro", label: "Company-wide" },
    ],
  },
  {
    publicId: "demo-zigzag-journey",
    title: "Our Startup Journey",
    subtitle: "A narrative, alternating-sides layout for storytelling",
    timelineType: "historical",
    layout: "zigzag",
    events: [
      { displayDate: "Year 1", title: "Two people, one laptop", description: "We started in a spare bedroom with a rough idea and a lot of coffee." },
      { displayDate: "Year 2", title: "First paying customer", description: "Someone we'd never met trusted us with their business." },
      { displayDate: "Year 3", title: "Team of ten", description: "We hired our first designer, then couldn't stop hiring." },
      { displayDate: "Year 5", title: "100,000 users", description: "The product finally felt like it belonged to more than just us." },
    ],
  },
  {
    publicId: "demo-radial-seasons",
    title: "A Year of Product Development",
    subtitle: "A circular layout — good for cyclical processes",
    timelineType: "roadmap",
    layout: "radial",
    events: [
      { displayDate: "Q1", title: "Plan", description: "Set priorities for the quarter.", accentColor: "#6d5ef8" },
      { displayDate: "Q2", title: "Build", description: "Ship the features that matter most.", accentColor: "#f6a84f" },
      { displayDate: "Q3", title: "Measure", description: "See what actually moved the needle.", accentColor: "#10b981" },
      { displayDate: "Q4", title: "Reflect", description: "Decide what to carry into next year.", accentColor: "#38bdf8" },
    ],
  },
  {
    publicId: "demo-roadmap-swimlanes",
    title: "Q1–Q4 Feature Roadmap",
    subtitle: "Grouped into swimlanes by team — a more sophisticated roadmap view",
    timelineType: "roadmap",
    layout: "roadmap",
    events: [
      { startAt: "2026-01-10T00:00:00.000Z", title: "Single sign-on", label: "Platform", description: "Log in once, use every app." },
      { startAt: "2026-04-10T00:00:00.000Z", title: "Audit logs", label: "Platform", description: "See who changed what, and when." },
      { startAt: "2026-02-01T00:00:00.000Z", title: "Dashboard redesign", label: "Product", description: "A cleaner home screen." },
      { startAt: "2026-05-01T00:00:00.000Z", title: "Mobile app", label: "Product", description: "TimelineAI, in your pocket." },
      { startAt: "2026-03-01T00:00:00.000Z", title: "Public API", label: "Developers", description: "Build on top of your timelines." },
    ],
  },
  {
    publicId: "demo-interactive-explore",
    title: "Explore Our Company Milestones",
    subtitle: "Click any event to expand it, or filter by category — the most sophisticated layout",
    timelineType: "interactive",
    layout: "interactive",
    events: [
      { startAt: "2021-03-01T00:00:00.000Z", title: "Founded", description: "Incorporated with two founders and a shared spreadsheet.", label: "Company" },
      { startAt: "2021-09-01T00:00:00.000Z", title: "Seed funding", description: "Raised enough to hire our first four engineers.", label: "Funding" },
      { startAt: "2022-06-01T00:00:00.000Z", title: "First enterprise customer", description: "A Fortune 500 company signed a multi-year contract.", label: "Sales" },
      { startAt: "2023-01-01T00:00:00.000Z", title: "Series A", description: "Doubled the team within six months.", label: "Funding" },
      { startAt: "2024-05-01T00:00:00.000Z", title: "1 million timelines created", description: "A number none of us expected to hit this fast.", label: "Product" },
      { startAt: "2025-11-01T00:00:00.000Z", title: "TimelineAI launches", description: "The tool you're using right now.", link: "https://tlai.asafarim.com", label: "Product" },
    ],
  },
];

export const TIMELINEAI_DEFINITIONS = {
  version: TIMELINEAI_DEFINITION_VERSION,
  authorId: TIMELINEAI_DEMO_AUTHOR_ID,
  authorEmail: TIMELINEAI_DEMO_AUTHOR_EMAIL,
  demos: TIMELINEAI_DEMOS,
};
