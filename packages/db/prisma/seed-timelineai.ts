// TimelineAI demo seed: a small set of published, public example timelines
// spanning every layout (simple vertical storytelling through sophisticated
// Gantt/interactive), so the app has something to show at /t/<publicId>
// and on the homepage without anyone having to create content by hand.
//
// Safe to run against a freshly migrated database and safe to re-run: every
// row is upserted on a fixed id (timelines) or a fixed (publicId doubles as
// the id prefix for its events), so running this twice converges instead of
// duplicating. Independent of packages/db/prisma/seed.ts (RBAC roles) and
// seed-edumatch.ts — run this after the base seed for a Hub user + roles to
// exist, though this script creates its own demo author regardless.
//
// Usage: pnpm --filter @asafarim/db db:seed:timelineai

import { existsSync } from "node:fs";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "@prisma/client";

function resolveDatabaseUrl(): string {
  const raw =
    process.env.DATABASE_URL ??
    "postgresql://asafarim:asafarim_dev@localhost:5432/asafarim";

  const insideContainer = existsSync("/.dockerenv");
  if (insideContainer) return raw;

  try {
    const url = new URL(raw);
    if (url.hostname === "postgres") {
      url.hostname = "localhost";
      console.log(
        "DATABASE_URL host 'postgres' is not resolvable outside Docker — using localhost instead."
      );
      return url.toString();
    }
  } catch {
    // Fall through with the raw value; Prisma will report a clearer error.
  }
  return raw;
}

const adapter = new PrismaPg({ connectionString: resolveDatabaseUrl() });
const prisma = new PrismaClient({ adapter });

const DEMO_AUTHOR_EMAIL = "timelineai-demo@asafarim.com";
const DEMO_AUTHOR_ID = "seed-timelineai-demo-author";

async function seedDemoAuthor(): Promise<string> {
  const user = await prisma.user.upsert({
    where: { email: DEMO_AUTHOR_EMAIL },
    update: {},
    create: {
      id: DEMO_AUTHOR_ID,
      email: DEMO_AUTHOR_EMAIL,
      name: "TimelineAI Examples",
      username: "timelineai-examples",
      isActive: true,
      // Not a real account — no password set, so credentials sign-in is
      // impossible for it; it exists purely as the content owner of record.
    },
  });
  return user.id;
}

interface DemoEventInput {
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

interface DemoTimelineInput {
  publicId: string;
  title: string;
  subtitle?: string;
  description?: string;
  timelineType: string;
  layout: string;
  events: DemoEventInput[];
}

// ── Simple → sophisticated, one per layout ────────────────────────────────
const DEMOS: DemoTimelineInput[] = [
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
      { startAt: "2025-11-01T00:00:00.000Z", title: "TimelineAI launches", description: "The tool you're using right now.", label: "Product", link: "https://tlai.asafarim.com" },
    ],
  },
];

async function seedTimeline(authorId: string, demo: DemoTimelineInput) {
  const timelineId = `seed-timeline-${demo.publicId}`;

  const timeline = await prisma.timeline.upsert({
    where: { id: timelineId },
    update: {
      title: demo.title,
      subtitle: demo.subtitle ?? null,
      description: demo.description ?? null,
      timelineType: demo.timelineType,
      layout: demo.layout,
    },
    create: {
      id: timelineId,
      publicId: demo.publicId,
      ownerUserId: authorId,
      title: demo.title,
      subtitle: demo.subtitle ?? null,
      description: demo.description ?? null,
      timelineType: demo.timelineType,
      layout: demo.layout,
      visibility: "public",
      moderationStatus: "not_required",
      editingState: "published",
      publishedAt: new Date(),
    },
  });

  // Full delete-then-recreate for events keeps this idempotent without
  // needing a stable per-event unique key — matches the app's own
  // updateTimelineContent behavior (lib/server/services/timelines.ts).
  await prisma.timelineEvent.deleteMany({ where: { timelineId: timeline.id } });
  await prisma.timelineEvent.createMany({
    data: demo.events.map((event, index) => ({
      timelineId: timeline.id,
      startAt: event.startAt ? new Date(event.startAt) : null,
      endAt: event.endAt ? new Date(event.endAt) : null,
      displayDate: event.displayDate ?? null,
      title: event.title,
      description: event.description ?? null,
      imageUrl: event.imageUrl ?? null,
      icon: event.icon ?? null,
      label: event.label ?? null,
      link: event.link ?? null,
      accentColor: event.accentColor ?? null,
      sortOrder: index,
    })),
  });

  console.log(`Seeded "${demo.title}" (/t/${demo.publicId}) — ${demo.layout} layout, ${demo.events.length} events.`);
}

async function main() {
  // `--only-if-empty` is what the deploy job passes. Re-running this seed is
  // safe in the sense that it converges (everything is upserted on a fixed
  // id), but it would also overwrite any edit made to a demo timeline in
  // production — including a moderator unpublishing one. So on deploy we
  // only plant the examples into a database that has no timelines at all,
  // and otherwise leave production content strictly alone.
  if (process.argv.includes("--only-if-empty")) {
    const existing = await prisma.timeline.count();
    if (existing > 0) {
      console.log(`Skipping TimelineAI demo seed — database already has ${existing} timeline(s).`);
      return;
    }
    console.log("No timelines found — planting the TimelineAI demo examples.");
  }

  const authorId = await seedDemoAuthor();
  for (const demo of DEMOS) {
    await seedTimeline(authorId, demo);
  }
  console.log(`\nSeeded ${DEMOS.length} public example timelines. Visit /t/<publicId>, e.g. /t/${DEMOS[0]!.publicId}`);
}

main()
  .catch((error) => {
    console.error(error);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
