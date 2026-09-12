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

export const TIMELINEAI_DEFINITION_VERSION = "1.3.0";

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
    description:
      "Every shipped version of a fictional product, laid out month by month. Toggle between the agenda list and the calendar grid to see the same releases two different ways — useful for a release-train cadence where the date matters as much as the content.",
    timelineType: "calendar",
    layout: "calendar-board",
    events: [
      { startAt: "2026-01-08T00:00:00.000Z", title: "v2.4.0 — Performance", description: "Cut cold-start time in half across every app by lazily loading the dashboard's heaviest charts.", label: "release", icon: "🚀", accentColor: "#6d5ef8" },
      { startAt: "2026-02-05T00:00:00.000Z", title: "v2.5.0 — Dark mode polish", description: "Fixed a dozen contrast issues reported by users on the new dark theme, and added a system-preference toggle.", label: "release", icon: "🚀" },
      { startAt: "2026-02-19T00:00:00.000Z", title: "Design review: v3 editor", description: "Walked the whole team through Figma prototypes of the rebuilt editor before a single line of code was written.", label: "design", icon: "✏️" },
      { startAt: "2026-03-05T00:00:00.000Z", title: "v3.0.0 — New editor", description: "A ground-up rebuild of the timeline editor with live multi-cursor collaboration, replacing four-year-old code.", label: "release", icon: "🚀", accentColor: "#10b981" },
      { startAt: "2026-03-19T00:00:00.000Z", title: "v3.0.1 — Hotfix", description: "Patched an export bug that produced blank PDFs in Safari 17 — reported within an hour of launch, fixed within four.", label: "release", icon: "🚀", accentColor: "#ef4444" },
      { startAt: "2026-04-09T00:00:00.000Z", title: "v3.1.0 — Public API", description: "Programmatic create/read/update access for integrations, with an API key management screen and rate limiting.", label: "release", icon: "🚀" },
      { startAt: "2026-04-23T00:00:00.000Z", title: "Quarterly engineering retro", description: "Looked back at what shipped, what slipped, and what the team wants to change about the release process next quarter.", label: "retro", icon: "📊" },
    ],
  },
  {
    publicId: "demo-branch-decision-paths",
    title: "Choosing Our Tech Stack",
    subtitle: "A branching layout for decisions that forked and reconverged",
    description:
      "A real engineering decision rarely runs in a straight line — teams explore competing options in parallel before converging on one. This timeline follows a framework bake-off from kickoff to the moment the paths merge back into a single decision.",
    timelineType: "general",
    layout: "branch",
    events: [
      { displayDate: "Week 1", title: "Framework bake-off begins", description: "Three small teams each build the same prototype — a form-heavy internal tool — in a different framework, on a two-week clock.", icon: "🏁" },
      { displayDate: "Week 2", title: "Path A: Next.js", description: "Fast to ship, the strongest ecosystem, and familiar to most of the team already — but the App Router's caching model takes some getting used to.", label: "Frontend" },
      { displayDate: "Week 2", title: "Path B: Remix", description: "An excellent data-loading model and refreshingly simple mental model, but a much smaller hiring pool and community at the time.", label: "Frontend" },
      { displayDate: "Week 2", title: "Path C: SvelteKit", description: "The smallest bundle size by far and the team's favorite developer experience — but two engineers had never touched Svelte before.", label: "Frontend" },
      { displayDate: "Week 3", title: "Paths reconverge", description: "Next.js wins on team familiarity, hiring pool, and library support — the three factors the team had agreed mattered most going in.", accentColor: "#10b981", icon: "🔀" },
      { displayDate: "Week 4", title: "Stack locked in", description: "Next.js, Prisma, and Turborepo become the platform's foundation — documented in an ADR so the next person doesn't have to re-litigate it.", icon: "🔒" },
    ],
  },
  {
    publicId: "demo-vertical-onboarding",
    title: "New Hire's First 90 Days",
    subtitle: "A vertical layout applied to something every company has",
    description:
      "What a solid engineering onboarding actually looks like, week by week — not just a checklist of accounts to create, but the moments that build real confidence: a first small win, a first solo feature, a first time being trusted on call.",
    timelineType: "general",
    layout: "vertical",
    events: [
      { displayDate: "Day 1", title: "Welcome & setup", description: "Laptop, accounts, and a warm welcome from the team — plus a buddy assigned for the first two weeks.", label: "Week 1" },
      { displayDate: "Day 5", title: "First small pull request", description: "A tiny, well-scoped fix — a typo, a missing test, a small bug — merged and shipped by end of week.", label: "Week 1", accentColor: "#6d5ef8" },
      { displayDate: "Day 14", title: "First code review given", description: "Reviewing someone else's PR for the first time — a real milestone in feeling like part of the team, not just a new hire.", label: "Week 2" },
      { displayDate: "Day 30", title: "First feature shipped solo", description: "End-to-end ownership of a real, if small, feature — from spec to production, with a manager checking in, not steering.", label: "Month 1", accentColor: "#6d5ef8" },
      { displayDate: "Day 60", title: "First on-call rotation", description: "Trusted to help keep the lights on, with a senior engineer as backup for the whole week just in case.", label: "Month 2" },
      { displayDate: "Day 90", title: "30/60/90 review", description: "A two-way conversation about growth and fit, not just a performance checkbox — and a chance to give feedback on the onboarding itself.", label: "Month 3", accentColor: "#10b981" },
    ],
  },
  {
    publicId: "demo-horizontal-space-race",
    title: "The Space Race",
    subtitle: "A horizontal layout for a classic slice of history",
    description:
      "Eighteen years, two superpowers, and a competition that put humans on the Moon. A horizontal timeline suits this story well — the pace of milestones visibly accelerates as the 1960s go on.",
    timelineType: "historical",
    layout: "horizontal",
    events: [
      { startAt: "1957-10-04T00:00:00.000Z", title: "Sputnik 1", description: "The first artificial satellite reaches orbit, catching the US intelligence community completely by surprise.", label: "USSR" },
      { startAt: "1958-01-31T00:00:00.000Z", title: "Explorer 1", description: "The United States answers with its own first satellite, launched just four months after Sputnik.", label: "USA" },
      { startAt: "1961-04-12T00:00:00.000Z", title: "Yuri Gagarin orbits Earth", description: "Vostok 1 completes a single orbit in 108 minutes — the first human spaceflight in history.", label: "USSR" },
      { startAt: "1962-02-20T00:00:00.000Z", title: "John Glenn orbits Earth", description: "Friendship 7 makes John Glenn the first American to orbit the planet, three orbits in under five hours.", label: "USA" },
      { startAt: "1965-03-18T00:00:00.000Z", title: "First spacewalk", description: "Alexei Leonov exits Voskhod 2 for just over 12 minutes — and nearly can't get back in when his suit expands.", label: "USSR" },
      { startAt: "1969-07-20T00:00:00.000Z", title: "Apollo 11 moon landing", description: "Neil Armstrong and Buzz Aldrin walk on the Moon while Michael Collins orbits above — the race's defining moment.", label: "USA", accentColor: "#f6a84f" },
      { startAt: "1975-07-17T00:00:00.000Z", title: "Apollo–Soyuz handshake in orbit", description: "American and Soviet spacecraft dock together for the first time, symbolically ending the race with cooperation.", label: "Joint" },
    ],
  },
  {
    publicId: "demo-zigzag-app-launch",
    title: "Building Our Mobile App",
    subtitle: "A narrative zigzag for a product build, not a company story",
    description:
      "From a recurring support complaint to ten thousand downloads in a week — the messy, honest version of a product build, including the App Store rejection nobody puts in the highlight reel.",
    timelineType: "project",
    layout: "zigzag",
    events: [
      { displayDate: "Month 1", title: "The idea", description: "A recurring support ticket — 'I wish I could check this from my phone' — becomes a feature idea, then a one-page spec." },
      { displayDate: "Month 2", title: "First prototype", description: "Clickable but held together with duct tape and hardcoded data — exactly as a first prototype should be." },
      { displayDate: "Month 3", title: "Internal dogfooding", description: "The whole company starts using it for real work, which surfaces a dozen usability problems no demo ever would." },
      { displayDate: "Month 4", title: "Closed beta", description: "Fifty external users, daily feedback calls, and a lot of rewritten screens based on what people actually did, not what they said." },
      { displayDate: "Month 6", title: "App Store submission", description: "Rejected once for a metadata guideline nobody had read closely enough — approved on the second try, three days later." },
      { displayDate: "Month 7", title: "Public launch", description: "Ten thousand downloads in the first week, and a crash-reporting dashboard nobody looked away from for 48 hours.", accentColor: "#10b981" },
    ],
  },
  {
    publicId: "demo-radial-daily-rhythm",
    title: "A Developer's Daily Rhythm",
    subtitle: "The radial layout applied to a repeating day instead of a repeating year",
    description:
      "Most radial timelines show a cycle that repeats yearly — seasons, quarters. This one applies the same idea to a single working day, showing how deep work, meetings, and wind-down actually fit together.",
    timelineType: "general",
    layout: "radial",
    events: [
      { displayDate: "8:30", title: "Inbox triage", description: "Ten minutes of email and Slack before the day's meetings start, so nothing urgent gets missed later.", accentColor: "#6d5ef8" },
      { displayDate: "9:00", title: "Standup", description: "Fifteen minutes, three questions each, no rabbit holes — anything longer moves to a separate thread." },
      { displayDate: "10:00", title: "Deep work block", description: "Notifications off, headphones on — the first and most protected two hours of the day." },
      { displayDate: "13:00", title: "Reviews & pairing", description: "Unblock teammates before starting anything new of your own — reviews are the highest-leverage hour of the afternoon." },
      { displayDate: "15:00", title: "Focused build time", description: "The second deep work block, usually for the harder, less interrupt-friendly half of the day's task.", accentColor: "#f6a84f" },
      { displayDate: "17:00", title: "Wrap-up & tomorrow's plan", description: "Close loops, write the last commit message of the day, and leave a note for tomorrow-you about where things stand." },
    ],
  },
  {
    publicId: "demo-roadmap-api-migration",
    title: "API v2 Migration Roadmap",
    subtitle: "A different roadmap story — a migration, not a feature list",
    description:
      "Not every roadmap is about new features — sometimes it's about safely retiring old ones. This one tracks a breaking API migration from spec to sunset, the kind of work that's invisible when it goes well.",
    timelineType: "project",
    layout: "roadmap",
    events: [
      { startAt: "2026-01-01T00:00:00.000Z", title: "v2 spec finalized", label: "Design", description: "Every breaking change documented, reviewed by the top five integration partners, and signed off." },
      { startAt: "2026-02-01T00:00:00.000Z", title: "v1 and v2 run side by side", label: "Migration", description: "Both versions live behind the same gateway, so consumers can move at their own pace." },
      { startAt: "2026-03-01T00:00:00.000Z", title: "Top 10 integrations migrated", label: "Migration", description: "The highest-traffic consumers move first, in direct partnership with their engineering teams." },
      { startAt: "2026-04-01T00:00:00.000Z", title: "Migration guide & tooling published", label: "Migration", description: "A codemod and a step-by-step guide for everyone who isn't a top-10 partner." },
      { startAt: "2026-05-01T00:00:00.000Z", title: "v1 deprecation notice", label: "Sunset", description: "A six-month countdown begins for anyone still on v1, with automated warnings on every v1 response.", accentColor: "#f6a84f" },
      { startAt: "2026-11-01T00:00:00.000Z", title: "v1 retired", label: "Sunset", description: "The old endpoints are finally switched off — quietly, because almost nobody was still using them.", accentColor: "#ef4444" },
    ],
  },
  {
    publicId: "demo-interactive-wonders",
    title: "Explore the Seven Wonders of the Ancient World",
    subtitle: "General-knowledge content on the interactive layout, not a company story",
    description:
      "Filter by region, click any wonder to expand it, and see just how much of this ancient list survives today — spoiler: only one of the seven does. A showcase of the interactive layout applied to trivia rather than a company's own history.",
    timelineType: "general",
    layout: "interactive",
    events: [
      { displayDate: "c. 2560 BCE", title: "Great Pyramid of Giza", description: "The oldest of the seven wonders and the only one still standing today, built as a tomb for the pharaoh Khufu.", label: "Egypt" },
      { displayDate: "c. 600 BCE", title: "Hanging Gardens of Babylon", description: "Possibly legendary — no archaeological site has ever been confirmed, and some historians place it in Nineveh instead.", label: "Mesopotamia" },
      { displayDate: "c. 435 BCE", title: "Statue of Zeus at Olympia", description: "Carved by the sculptor Phidias from ivory and gold, it stood roughly 12 metres tall inside its own temple.", label: "Greece" },
      { displayDate: "c. 550 BCE", title: "Temple of Artemis at Ephesus", description: "Rebuilt at least twice after fire and flood before being destroyed for good by a mob in 401 CE.", label: "Anatolia" },
      { displayDate: "c. 351 BCE", title: "Mausoleum at Halicarnassus", description: "Built for a Persian satrap, it was so famous that 'mausoleum' became the generic word for a grand tomb.", label: "Anatolia" },
      { displayDate: "c. 292 BCE", title: "Colossus of Rhodes", description: "A giant bronze statue of the sun god Helios that stood for only about 56 years before an earthquake toppled it.", label: "Greece" },
      { displayDate: "c. 280 BCE", title: "Lighthouse of Alexandria", description: "One of the tallest human-made structures on Earth for centuries, guiding ships into Egypt's busiest harbor.", label: "Egypt", link: "https://en.wikipedia.org/wiki/Lighthouse_of_Alexandria" },
    ],
  },
  {
    publicId: "demo-gantt-marketing-launch",
    title: "Marketing Campaign Launch Plan",
    subtitle: "A Gantt schedule outside of engineering, for once",
    description:
      "The same overlapping-workstreams structure as an engineering Gantt chart, applied to a product launch campaign — strategy, creative, and media all need to land in the same week without blocking each other.",
    timelineType: "project",
    layout: "gantt",
    events: [
      { startAt: "2026-02-02T00:00:00.000Z", endAt: "2026-02-13T00:00:00.000Z", title: "Messaging & positioning", description: "Nail down the one-sentence pitch and the three supporting proof points everything else will build on.", label: "Strategy" },
      { startAt: "2026-02-09T00:00:00.000Z", endAt: "2026-02-27T00:00:00.000Z", title: "Creative production", description: "Video, static ads, and email templates, all built against the approved messaging brief.", label: "Creative" },
      { startAt: "2026-02-23T00:00:00.000Z", endAt: "2026-03-06T00:00:00.000Z", title: "Landing page build", description: "A dedicated launch page with its own analytics events, built to be swapped out the moment the campaign ends.", label: "Web" },
      { startAt: "2026-03-02T00:00:00.000Z", endAt: "2026-03-13T00:00:00.000Z", title: "Paid media setup", description: "Audiences, budgets, and creative variants configured across every channel, ready to go live on launch day.", label: "Media" },
      { startAt: "2026-03-16T00:00:00.000Z", endAt: "2026-03-16T00:00:00.000Z", title: "Launch day", description: "Every channel goes live within the same hour — email, paid social, and the landing page switch on together.", label: "Launch", icon: "🚀", accentColor: "#10b981" },
      { startAt: "2026-03-17T00:00:00.000Z", endAt: "2026-03-31T00:00:00.000Z", title: "Post-launch optimization", description: "Daily budget reallocation toward whatever channel and creative variant is actually converting.", label: "Media" },
      { startAt: "2026-04-01T00:00:00.000Z", endAt: "2026-04-03T00:00:00.000Z", title: "Campaign retro", description: "What worked, what didn't, and which of this quarter's assumptions to keep or drop next time.", label: "Strategy", icon: "📊" },
    ],
  },
  {
    publicId: "demo-calendar-tech-history",
    title: "This Month in Tech History",
    subtitle: "The calendar layout applied to historical trivia instead of a schedule",
    description:
      "The calendar layout is usually a schedule of things still to happen. Here it's used the other way around — a browsable almanac of tech milestones, mapped onto the calendar date they actually happened on.",
    timelineType: "historical",
    layout: "calendar",
    events: [
      { startAt: "2026-01-09T00:00:00.000Z", title: "The first iPhone is unveiled (2007)", description: "Steve Jobs introduces a phone, an iPod, and an internet communicator — and reveals they're all one device.", label: "Hardware" },
      { startAt: "2026-01-24T00:00:00.000Z", title: "The original Macintosh ships (1984)", description: "The first mass-market computer with a graphical interface and a mouse, launched with the famous '1984' ad.", label: "Hardware" },
      { startAt: "2026-02-14T00:00:00.000Z", title: "Alexander Graham Bell files his telephone patent (1876)", description: "Filed just hours before a rival inventor — one of the most consequential patent races in history.", label: "Telecom" },
      { startAt: "2026-03-12T00:00:00.000Z", title: "Tim Berners-Lee proposes the World Wide Web (1989)", description: "A memo titled 'Information Management: A Proposal', initially met with a manager's note: 'Vague, but exciting.'", label: "Internet", accentColor: "#6d5ef8" },
      { startAt: "2026-04-01T00:00:00.000Z", title: "Apple is founded (1976)", description: "Steve Jobs and Steve Wozniak start the company in a garage in Los Altos, California.", label: "Company" },
      { startAt: "2026-04-04T00:00:00.000Z", title: "Microsoft is founded (1975)", description: "Bill Gates and Paul Allen found the company after licensing a BASIC interpreter to Altair's manufacturer.", label: "Company" },
    ],
  },
];

export const TIMELINEAI_DEFINITIONS = {
  version: TIMELINEAI_DEFINITION_VERSION,
  authorId: TIMELINEAI_DEMO_AUTHOR_ID,
  authorEmail: TIMELINEAI_DEMO_AUTHOR_EMAIL,
  demos: TIMELINEAI_DEMOS,
};
