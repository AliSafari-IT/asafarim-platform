import type { RoadmapItem } from "@asafarim/ui";

const PR = (n: number) => ({
  label: `PR #${n}`,
  href: `https://github.com/AliSafari-IT/asafarim-platform/pull/${n}`,
});

/**
 * The Labs journey, newest last within each status group. Add an item when
 * an experiment is added, promoted, paused, or archived, and move items from
 * "planned"/"exploring" to "shipped" as they land. This list is not generated
 * from git or from lib/experiments/registry.ts.
 */
export const roadmapItems: RoadmapItem[] = [
  {
    id: "L01",
    title: "Workbench scaffold",
    status: "shipped",
    timeframe: "12 Aug 2026",
    summary:
      "Labs launched as a public, sign-in-free workbench with three prototypes, an ideas pipeline, and a status API.",
    highlights: ["Timeline Layout Lab", "ASafarIM UI Playground", "AI Evaluation Explorer"],
    tags: ["foundation"],
    links: [PR(176)],
  },
  {
    id: "L02",
    title: "Platform integration",
    status: "shipped",
    timeframe: "12 Aug 2026",
    summary:
      "Labs joined the platform app switcher and the production deploy, and adopted the shared navbar and theme.",
    tags: ["platform"],
    links: [PR(177)],
  },
  {
    id: "L03",
    title: "Workbench landing redesign",
    status: "shipped",
    timeframe: "27 Sep 2026",
    summary: "A new landing page that frames Labs as an atelier for ideas in progress.",
    tags: ["ux"],
    links: [PR(688)],
  },
  {
    id: "L04",
    title: "Catalogue redesign and five new experiments",
    status: "shipped",
    timeframe: "27 Sep 2026",
    summary:
      "The experiments catalogue was rebuilt around interactive studies, and five experiments joined the original three.",
    highlights: [
      "Prompt Composer Lab (active)",
      "Context Budget Garden (active)",
      "Retrieval Threshold Studio (beta)",
      "Voice Shape Lab (beta)",
      "Agent Route Sandbox (prototype)",
    ],
    tags: ["experiments", "ux"],
    links: [PR(690)],
  },
  {
    id: "L05",
    title: "Light theme artwork",
    status: "shipped",
    timeframe: "27 Sep 2026",
    summary: "Artwork that works in the light theme as well as the dark one.",
    tags: ["ux"],
    links: [PR(693)],
  },
  {
    id: "L06",
    title: "Finish the launch prototypes",
    status: "planned",
    timeframe: "Next",
    summary:
      "Close the known gaps in the three original experiments so they can move from prototype to beta.",
    highlights: [
      "Timeline Layout Lab: PNG export and end-to-end keyboard navigation",
      "UI Playground: contrast checks beyond manually selected pairs",
      "AI Evaluation Explorer: scaled radar chart and a historical trend view",
    ],
    tags: ["experiments"],
  },
  {
    id: "L07",
    title: "Interactive ideas graph",
    status: "planned",
    timeframe: "Next",
    summary:
      "Replace the static ideas snapshot with a live view of how raw ideas become prototypes and graduate to Showcase.",
    tags: ["ux"],
  },
  {
    id: "L08",
    title: "New experiments from the ideas backlog",
    status: "exploring",
    timeframe: "Later",
    summary: "Candidates for the next round of experiments, taken from the ideas pipeline.",
    highlights: [
      "Brainstorming canvas (ASCII + JSON schema)",
      "ADR visualizer",
      "Latency & cost heatmaps",
    ],
    tags: ["experiments"],
  },
];
