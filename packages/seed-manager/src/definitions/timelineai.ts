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

export const TIMELINEAI_DEFINITION_VERSION = "1.2.0";

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

  // ── Second wave: the remaining layouts, and fresh layout×type pairings ──

  {
    publicId: "demo-calendar-board-releases",
    title: "Software Release Calendar",
    subtitle: "A calendar-board view — good for release trains and recurring cadences",
    timelineType: "calendar",
    layout: "calendar-board",
    events: [
      { startAt: "2026-01-08T00:00:00.000Z", title: "v2.4.0 — Performance", description: "Faster cold starts across every app.", label: "Minor", accentColor: "#6d5ef8" },
      { startAt: "2026-02-05T00:00:00.000Z", title: "v2.5.0 — Dark mode polish", description: "Consistent theming across the whole platform.", label: "Minor" },
      { startAt: "2026-03-05T00:00:00.000Z", title: "v3.0.0 — New editor", description: "A rebuilt timeline editor with live collaboration.", label: "Major", accentColor: "#10b981" },
      { startAt: "2026-03-19T00:00:00.000Z", title: "v3.0.1 — Hotfix", description: "Fixed an export bug affecting Safari.", label: "Patch", accentColor: "#ef4444" },
      { startAt: "2026-04-09T00:00:00.000Z", title: "v3.1.0 — Public API", description: "Programmatic access for integrations.", label: "Minor" },
    ],
  },
  {
    publicId: "demo-branch-decision-paths",
    title: "Choosing Our Tech Stack",
    subtitle: "A branching layout for decisions that forked and reconverged",
    timelineType: "general",
    layout: "branch",
    events: [
      { displayDate: "Week 1", title: "Framework bake-off begins", description: "Three small teams each build the same prototype in a different framework." },
      { displayDate: "Week 2", title: "Path A: Next.js", description: "Fast to ship, strong ecosystem, familiar to most of the team.", label: "Frontend" },
      { displayDate: "Week 2", title: "Path B: Remix", description: "Excellent data loading model, smaller community at the time.", label: "Frontend" },
      { displayDate: "Week 3", title: "Paths reconverge", description: "Next.js wins on team familiarity and hiring pool — the deciding factor.", accentColor: "#10b981" },
      { displayDate: "Week 4", title: "Stack locked in", description: "Next.js, Prisma, and Turborepo become the platform's foundation." },
    ],
  },
  {
    publicId: "demo-vertical-onboarding",
    title: "New Hire's First 90 Days",
    subtitle: "A vertical layout applied to something every company has",
    timelineType: "general",
    layout: "vertical",
    events: [
      { displayDate: "Day 1", title: "Welcome & setup", description: "Laptop, accounts, and a warm welcome from the team.", label: "Week 1" },
      { displayDate: "Day 5", title: "First small pull request", description: "A tiny, well-scoped fix — merged and shipped.", label: "Week 1" },
      { displayDate: "Day 30", title: "First feature shipped solo", description: "End-to-end ownership of a real feature.", label: "Month 1", accentColor: "#6d5ef8" },
      { displayDate: "Day 60", title: "First on-call rotation", description: "Trusted to help keep the lights on.", label: "Month 2" },
      { displayDate: "Day 90", title: "30/60/90 review", description: "A conversation about growth, not just performance.", label: "Month 3", accentColor: "#10b981" },
    ],
  },
  {
    publicId: "demo-horizontal-space-race",
    title: "The Space Race",
    subtitle: "A horizontal layout for a classic slice of history",
    timelineType: "historical",
    layout: "horizontal",
    events: [
      { startAt: "1957-10-04T00:00:00.000Z", title: "Sputnik 1", description: "The first artificial satellite reaches orbit.", label: "USSR" },
      { startAt: "1961-04-12T00:00:00.000Z", title: "Yuri Gagarin orbits Earth", description: "The first human spaceflight.", label: "USSR" },
      { startAt: "1962-02-20T00:00:00.000Z", title: "John Glenn orbits Earth", description: "The first American to orbit the planet.", label: "USA" },
      { startAt: "1969-07-20T00:00:00.000Z", title: "Apollo 11 moon landing", description: "Neil Armstrong and Buzz Aldrin walk on the Moon.", label: "USA", accentColor: "#f6a84f" },
      { startAt: "1975-07-17T00:00:00.000Z", title: "Apollo–Soyuz handshake in orbit", description: "The two space programs dock together, symbolically ending the race.", label: "Joint" },
    ],
  },
  {
    publicId: "demo-zigzag-app-launch",
    title: "Building Our Mobile App",
    subtitle: "A narrative zigzag for a product build, not a company story",
    timelineType: "project",
    layout: "zigzag",
    events: [
      { displayDate: "Month 1", title: "The idea", description: "A recurring support ticket becomes a feature idea, then a spec." },
      { displayDate: "Month 2", title: "First prototype", description: "Clickable but held together with duct tape — exactly as it should be." },
      { displayDate: "Month 4", title: "Closed beta", description: "50 users, daily feedback calls, and a lot of rewritten screens." },
      { displayDate: "Month 6", title: "App Store submission", description: "Rejected once for a metadata issue, approved on the second try." },
      { displayDate: "Month 7", title: "Public launch", description: "10,000 downloads in the first week.", accentColor: "#10b981" },
    ],
  },
  {
    publicId: "demo-radial-daily-rhythm",
    title: "A Developer's Daily Rhythm",
    subtitle: "The radial layout applied to a repeating day instead of a repeating year",
    timelineType: "general",
    layout: "radial",
    events: [
      { displayDate: "9:00", title: "Standup", description: "Fifteen minutes, three questions, no rabbit holes.", accentColor: "#6d5ef8" },
      { displayDate: "10:00", title: "Deep work block", description: "Notifications off, headphones on." },
      { displayDate: "13:00", title: "Reviews & pairing", description: "Unblock teammates before starting anything new." },
      { displayDate: "15:00", title: "Focused build time", description: "The second deep work block of the day.", accentColor: "#f6a84f" },
      { displayDate: "17:00", title: "Wrap-up & tomorrow's plan", description: "Close loops, write the last commit message of the day." },
    ],
  },
  {
    publicId: "demo-roadmap-api-migration",
    title: "API v2 Migration Roadmap",
    subtitle: "A different roadmap story — a migration, not a feature list",
    timelineType: "project",
    layout: "roadmap",
    events: [
      { startAt: "2026-01-01T00:00:00.000Z", title: "v2 spec finalized", label: "Design", description: "Breaking changes documented and reviewed." },
      { startAt: "2026-02-01T00:00:00.000Z", title: "v1 and v2 run side by side", label: "Migration", description: "Both versions live behind the same gateway." },
      { startAt: "2026-03-01T00:00:00.000Z", title: "Top 10 integrations migrated", label: "Migration", description: "The highest-traffic consumers move first." },
      { startAt: "2026-05-01T00:00:00.000Z", title: "v1 deprecation notice", label: "Sunset", description: "Six-month countdown begins for everyone else.", accentColor: "#f6a84f" },
      { startAt: "2026-11-01T00:00:00.000Z", title: "v1 retired", label: "Sunset", description: "The old endpoints are finally switched off.", accentColor: "#ef4444" },
    ],
  },
  {
    publicId: "demo-interactive-wonders",
    title: "Explore the Seven Wonders of the Ancient World",
    subtitle: "General-knowledge content on the interactive layout, not a company story",
    timelineType: "general",
    layout: "interactive",
    events: [
      { displayDate: "c. 2560 BCE", title: "Great Pyramid of Giza", description: "The only wonder still standing today.", label: "Egypt" },
      { displayDate: "c. 600 BCE", title: "Hanging Gardens of Babylon", description: "Possibly legendary — no archaeological site has been confirmed.", label: "Mesopotamia" },
      { displayDate: "c. 435 BCE", title: "Statue of Zeus at Olympia", description: "Carved by Phidias, it stood roughly 12 metres tall.", label: "Greece" },
      { displayDate: "c. 550 BCE", title: "Temple of Artemis at Ephesus", description: "Rebuilt at least twice after fire and flood.", label: "Anatolia" },
      { displayDate: "c. 351 BCE", title: "Mausoleum at Halicarnassus", description: "The origin of the word 'mausoleum'.", label: "Anatolia" },
      { displayDate: "c. 292 BCE", title: "Colossus of Rhodes", description: "A giant bronze statue that stood for only about 56 years.", label: "Greece" },
      { displayDate: "c. 280 BCE", title: "Lighthouse of Alexandria", description: "One of the tallest structures on Earth for centuries.", label: "Egypt", link: "https://en.wikipedia.org/wiki/Lighthouse_of_Alexandria" },
    ],
  },
  {
    publicId: "demo-gantt-marketing-launch",
    title: "Marketing Campaign Launch Plan",
    subtitle: "A Gantt schedule outside of engineering, for once",
    timelineType: "project",
    layout: "gantt",
    events: [
      { startAt: "2026-02-02T00:00:00.000Z", endAt: "2026-02-13T00:00:00.000Z", title: "Messaging & positioning", label: "Strategy" },
      { startAt: "2026-02-09T00:00:00.000Z", endAt: "2026-02-27T00:00:00.000Z", title: "Creative production", label: "Creative" },
      { startAt: "2026-02-23T00:00:00.000Z", endAt: "2026-03-06T00:00:00.000Z", title: "Landing page build", label: "Web" },
      { startAt: "2026-03-02T00:00:00.000Z", endAt: "2026-03-13T00:00:00.000Z", title: "Paid media setup", label: "Media" },
      { startAt: "2026-03-16T00:00:00.000Z", endAt: "2026-03-16T00:00:00.000Z", title: "Launch day", label: "Launch", accentColor: "#10b981" },
      { startAt: "2026-03-17T00:00:00.000Z", endAt: "2026-03-31T00:00:00.000Z", title: "Post-launch optimization", label: "Media" },
    ],
  },
  {
    publicId: "demo-calendar-tech-history",
    title: "This Month in Tech History",
    subtitle: "The calendar layout applied to historical trivia instead of a schedule",
    timelineType: "historical",
    layout: "calendar",
    events: [
      { startAt: "2026-01-09T00:00:00.000Z", title: "The first iPhone is unveiled (2007)", label: "Hardware" },
      { startAt: "2026-01-24T00:00:00.000Z", title: "The original Macintosh ships (1984)", label: "Hardware" },
      { startAt: "2026-02-14T00:00:00.000Z", title: "Alexander Graham Bell files his telephone patent (1876)", label: "Telecom" },
      { startAt: "2026-03-12T00:00:00.000Z", title: "Tim Berners-Lee proposes the World Wide Web (1989)", label: "Internet", accentColor: "#6d5ef8" },
      { startAt: "2026-04-01T00:00:00.000Z", title: "Apple is founded (1976)", label: "Company" },
    ],
  },
];

export const TIMELINEAI_DEFINITIONS = {
  version: TIMELINEAI_DEFINITION_VERSION,
  authorId: TIMELINEAI_DEMO_AUTHOR_ID,
  authorEmail: TIMELINEAI_DEMO_AUTHOR_EMAIL,
  demos: TIMELINEAI_DEMOS,
};
