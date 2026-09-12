import type { RoadmapItem } from "@asafarim/ui";

const PR = (n: number) => ({
  label: `PR #${n}`,
  href: `https://github.com/AliSafari-IT/asafarim-platform/pull/${n}`,
});

const ISSUE = (n: number) => ({
  label: `#${n}`,
  href: `https://github.com/AliSafari-IT/asafarim-platform/issues/${n}`,
});

/**
 * TimelineAI's public product journey: the Aug 2026 MVP evidence followed by
 * the governed AI-storytelling backlog tracked by epic #298. “Planned” means
 * scoped and sequenced, not date-committed; exploratory bets stay explicit.
 */
export const roadmapItems: RoadmapItem[] = [
  {
    id: "M00",
    title: "Platform contract, schema, auth & CRUD",
    status: "shipped",
    timeframe: "8 Aug 2026",
    summary:
      "TimelineAI started as a first-class platform app with shared Prisma persistence, Hub SSO, server-derived ownership, authorization rules, and timeline/event APIs.",
    tags: ["foundation"],
    links: [PR(108)],
  },
  {
    id: "M01",
    title: "Accessible editor & live preview",
    status: "shipped",
    timeframe: "8 Aug 2026",
    summary:
      "A drag-and-drop and keyboard-operable editor paired content entry with an immediate visual preview and client/server schema validation.",
    tags: ["editor", "accessibility"],
    links: [PR(109)],
  },
  {
    id: "M02",
    title: "Eight purpose-built layouts",
    status: "shipped",
    timeframe: "8–9 Aug 2026",
    summary:
      "Vertical, horizontal, zigzag, radial, roadmap, Gantt, calendar, and interactive renderers made one event model useful for histories, plans, schedules, and exploration.",
    links: [PR(110), PR(125), PR(126)],
  },
  {
    id: "M03",
    title: "Dashboard, ownership & self-publishing",
    status: "shipped",
    timeframe: "8 Aug 2026",
    summary:
      "Signed-in creators gained a dashboard, edit flow, private drafts, and direct publishing under the platform's shared identity.",
    tags: ["ownership"],
    links: [PR(111)],
  },
  {
    id: "M04",
    title: "Safe guest creation & moderation",
    status: "shipped",
    timeframe: "8–9 Aug 2026",
    summary:
      "Guests can create without an account using privacy-preserving hashed identity and rate limits; public visibility remains gated by an admin moderation trail.",
    tags: ["privacy", "trust"],
    links: [PR(112), PR(114)],
  },
  {
    id: "M05",
    title: "Native PNG, JPG & PDF export",
    status: "shipped",
    timeframe: "Shipped Aug · hardened 12 Sep 2026",
    summary:
      "Headless Chromium reuses the live renderer for faithful exports. A short-lived, server-signed render grant now authorizes the internal render request, so an owner-authorized pending/private export can no longer return a 404 artifact.",
    tags: ["export", "reliability"],
    links: [PR(116), ISSUE(285), PR(321)],
  },
  {
    id: "M06",
    title: "Platform navigation & production launch",
    status: "shipped",
    timeframe: "9 Aug 2026",
    summary:
      "TimelineAI joined the shared app shell and platform switcher, shipped behind Caddy on tlai.asafarim.com, and gained polished public metadata.",
    tags: ["platform", "infra"],
    links: [PR(115), PR(117), PR(120)],
  },
  {
    id: "M07",
    title: "Examples, gallery & discovery",
    status: "shipped",
    timeframe: "9 Aug 2026",
    summary:
      "Eight seeded examples, a public gallery, curated layout/theme choices, and platform project listings made the product understandable before a visitor creates anything.",
    tags: ["discovery"],
    links: [PR(119), PR(124), PR(127), PR(130)],
  },
  {
    id: "M08",
    title: "MVP accessibility & end-to-end evidence",
    status: "shipped",
    timeframe: "9 Aug 2026",
    summary:
      "Automated accessibility checks and real guest, authenticated, and admin journeys completed the twelve-phase MVP with documented architectural decisions.",
    tags: ["quality"],
    links: [PR(121)],
  },
  {
    id: "M09",
    title: "TimelineAI becomes a Testora target",
    status: "shipped",
    timeframe: "12 Aug 2026",
    summary:
      "The platform's own test-orchestration app gained local and production TimelineAI targets, turning cross-product regression coverage into part of the operating model.",
    tags: ["testing", "platform"],
    links: [ISSUE(178), PR(179)],
  },

  // Forward work is tracked by the cited AI storytelling studio epic (#298).
  {
    id: "TLAI-002",
    title: "Governed AI foundation",
    status: "shipped",
    timeframe: "Shipped 12 Sep 2026",
    summary:
      "A provider-neutral, fixture-first AI boundary with typed proposals, citations, quotas, audit, accept/reject, undo, a kill switch, and golden/adversarial eval gates.",
    highlights: ["Manual TimelineAI remains fully useful when AI is disabled"],
    tags: ["ai", "safety", "epic #298"],
    links: [ISSUE(286), PR(322)],
  },
  {
    id: "TLAI-013",
    title: "Version history & collaborative review",
    status: "planned",
    timeframe: "Next · foundation",
    summary:
      "Immutable versions, structured diffs, anchored comments, reviewer capabilities, and reversible restore give both human and AI-authored changes a safe publishing workflow.",
    tags: ["collaboration", "trust", "epic #298"],
    links: [ISSUE(297)],
  },
  {
    id: "TLAI-003",
    title: "Cited source-to-timeline import",
    status: "shipped",
    timeframe: "Shipped 12 Sep 2026",
    summary:
      "Turn notes, Markdown, CSV/JSON, pasted text, and approved web pages into reviewable event proposals with stable source citations, confidence, and unresolved questions.",
    tags: ["ai", "provenance", "epic #298"],
    links: [ISSUE(287), PR(323)],
  },
  {
    id: "TLAI-004",
    title: "Temporal reasoning without false precision",
    status: "shipped",
    timeframe: "Shipped 12 Sep 2026",
    summary:
      "Extract exact dates, ranges, approximate periods, durations, and ordering constraints; surface contradictions and let creators leave uncertainty unresolved.",
    tags: ["ai", "reasoning", "epic #298"],
    links: [ISSUE(288), PR(324)],
  },
  {
    id: "TLAI-005",
    title: "Narrative copilot",
    status: "shipped",
    timeframe: "Shipped 12 Sep 2026",
    summary:
      "Propose audience-aware hooks, chapters, transitions, pacing, tone, and closing takeaways while separating factual changes from style and respecting locked content.",
    tags: ["ai", "storytelling", "epic #298"],
    links: [ISSUE(289), PR(325)],
  },
  {
    id: "TLAI-006",
    title: "Adaptive visual director",
    status: "shipped",
    timeframe: "Shipped 12 Sep 2026",
    summary:
      "Recommend and compare safe layout, density, card, color, and emphasis directions from the content—with explanations and accessibility/export checks before applying.",
    tags: ["ai", "design", "accessibility", "epic #298"],
    links: [ISSUE(290), PR(326)],
  },
  {
    id: "TLAI-007",
    title: "Provenance-aware media enrichment",
    status: "exploring",
    timeframe: "Provider/legal gate",
    summary:
      "Suggest relevant allow-listed media with creator, license, attribution, and editable grounded alt text—never an untraceable image scrape.",
    tags: ["ai", "media", "provenance", "epic #298"],
    links: [ISSUE(291)],
  },
  {
    id: "TLAI-008",
    title: "Reviewed multilingual timelines",
    status: "planned",
    timeframe: "Inclusive storytelling",
    summary:
      "Create locale variants through glossary-aware translation proposals that preserve names, dates, citations, and links, with RTL and long-text layout verification.",
    tags: ["ai", "i18n", "epic #298"],
    links: [ISSUE(292)],
  },
  {
    id: "TLAI-009",
    title: "Narrated story mode & Vionto handoff",
    status: "exploring",
    timeframe: "Creative expansion",
    summary:
      "Turn a reviewed timeline into an editable narration, accessible playback, captions, transcript, and a versioned scene handoff to Vionto.",
    tags: ["ai", "audio", "video", "epic #298"],
    links: [ISSUE(293)],
  },
  {
    id: "TLAI-010",
    title: "Branching scenarios & what-if comparison",
    status: "exploring",
    timeframe: "Creative expansion",
    summary:
      "Fork a factual baseline into named alternatives, compare outcomes, and propose risks or decision points while making assumptions visually impossible to confuse with history.",
    tags: ["ai", "interactive", "epic #298"],
    links: [ISSUE(294)],
  },
  {
    id: "TLAI-011",
    title: "Living roadmaps from GitHub & TasksAI",
    status: "planned",
    timeframe: "Connected platform",
    summary:
      "Read selected issues, PRs, milestones, and TasksAI work into idempotent proposed updates with drift/conflict review and a cited “what changed” digest.",
    tags: ["integrations", "platform", "epic #298"],
    links: [ISSUE(295)],
  },
  {
    id: "TLAI-012",
    title: "Ask & explore with cited answers",
    status: "exploring",
    timeframe: "Connected platform",
    summary:
      "Let visitors ask what changed, where the gaps are, and which events support a conclusion; prefer deterministic calculations and cite every factual answer.",
    tags: ["ai", "exploration", "epic #298"],
    links: [ISSUE(296)],
  },
];
