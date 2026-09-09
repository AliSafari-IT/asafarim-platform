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
 * The TasksAI milestone journey. M00–M15 shipped as a stacked PR series
 * (tracking issue #226); the forward column is the "creative & useful
 * copilot" epic #244 and its workstreams.
 */
export const roadmapItems: RoadmapItem[] = [
  {
    id: "M00",
    title: "Product charter, ADRs & taxonomy",
    status: "shipped",
    timeframe: "Sep 2026",
    summary:
      "ICP, jobs-to-be-done, KPI dictionary, event taxonomy, five architecture decision records, and the compliance / license gate.",
    tags: ["docs"],
    links: [PR(210)],
  },
  {
    id: "M01",
    title: "Platform foundation",
    status: "shipped",
    timeframe: "Sep 2026",
    summary:
      "Next.js 16 shell, shared SSO via Hub, an isolated PostgreSQL database and Prisma client, a BullMQ worker skeleton, CI and test harnesses.",
    tags: ["infra"],
    links: [PR(211)],
  },
  {
    id: "M02",
    title: "Multi-tenant work graph + /api/v1",
    status: "shipped",
    timeframe: "Sep 2026",
    summary:
      "Workspace / project / task / dependency model with row-level tenant scoping, RBAC, a versioned REST API with OpenAPI, idempotency and optimistic concurrency.",
    highlights: [
      "Every mutation writes an ActivityEvent + OutboxEvent in one transaction",
      "IDOR / privilege-escalation / cross-tenant isolation tests",
    ],
    links: [PR(212)],
  },
  {
    id: "M03",
    title: "Fast task experience",
    status: "shipped",
    timeframe: "Sep 2026",
    summary:
      "Subtasks, dependencies, estimates, dates, labels, custom fields, recurrence and templates across Inbox, List, Board, Calendar and Timeline — no AI required.",
    tags: ["ux"],
    links: [PR(213)],
  },
  {
    id: "M04",
    title: "Collaboration & realtime",
    status: "shipped",
    timeframe: "Sep 2026",
    summary:
      "Invitations and membership lifecycle, comments, @mentions, reactions, attachments, an in-app notification inbox and SSE-based presence.",
    links: [PR(214)],
  },
  {
    id: "M05",
    title: "Capture, search & portability",
    status: "shipped",
    timeframe: "Sep 2026",
    summary:
      "Global Postgres full-text search scoped by authorization, per-workspace inbound email capture, deterministic CSV/JSON import-export with dry-run and a deletion manifest.",
    links: [PR(215)],
  },
  {
    id: "M06",
    title: "AI safety & provider boundary",
    status: "shipped",
    timeframe: "Sep 2026",
    summary:
      "Provider-neutral lib/ai with a deterministic fixture provider for CI, redaction, prompt-injection fencing, an operation allowlist, per-workspace quotas, a kill switch and an offline eval suite.",
    highlights: [
      "AI never mutates domain data — it only drafts a Proposal",
      "Disabling AI leaves core task management fully functional",
    ],
    tags: ["ai"],
    links: [PR(216)],
  },
  {
    id: "M07",
    title: "AI copilot — intent to approved plan",
    status: "shipped",
    timeframe: "Sep 2026",
    summary:
      "Pasted notes / briefs / threads become an editable proposal diff grouped by create / update / link, with citations, partial accept, regenerate, undo and typed feedback.",
    tags: ["ai"],
    links: [PR(217)],
  },
  {
    id: "M08",
    title: "Focus, risk & workload intelligence",
    status: "shipped",
    timeframe: "Sep 2026",
    summary:
      "Explainable, deterministic focus ranking and risk signals with per-factor evidence, plus an anti-surveillance guard enforced in code on every payload.",
    links: [PR(218)],
  },
  {
    id: "M09",
    title: "Automations & integration platform",
    status: "shipped",
    timeframe: "Sep 2026",
    summary:
      "A trigger-condition-action rules engine with dry run and execution log, scoped API tokens, signed webhooks, and the first (read-only) GitHub issue integration.",
    links: [PR(219)],
  },
  {
    id: "M10",
    title: "Goals, cycles, time & analytics",
    status: "shipped",
    timeframe: "Sep 2026",
    summary:
      "OKRs, cycles, capacity, time entries, portfolio dashboards and versioned forecasting with stated assumptions and drill-down to the underlying tasks.",
    links: [PR(220)],
  },
  {
    id: "M11",
    title: "PWA, accessibility, i18n & performance",
    status: "shipped",
    timeframe: "Sep 2026",
    summary:
      "WCAG 2.2 AA on critical journeys, an installable PWA with an offline mutation queue, en / nl / fr foundations and route-level performance budgets.",
    links: [PR(221)],
  },
  {
    id: "M12",
    title: "Security, privacy, admin & reliability",
    status: "shipped",
    timeframe: "Sep 2026",
    summary:
      "Threat model, CSP and security headers, workspace admin with audit export and break-glass, data-subject request workflows, and backup / restore rehearsals.",
    links: [PR(222)],
  },
  {
    id: "M13",
    title: "Design-partner beta tooling",
    status: "shipped",
    timeframe: "Sep 2026",
    summary:
      "Beta onboarding under explicit consent, a segmented metrics dashboard, a feedback triage board and the decision-report scaffold.",
    highlights: ["Field work — recruiting design-partner teams — is still open"],
    links: [PR(223)],
  },
  {
    id: "M14",
    title: "Billing & packaging",
    status: "shipped",
    timeframe: "Sep 2026",
    summary:
      "Free / Pro / Business / Enterprise plans, subscriptions, entitlements that fail safe, metered AI allowances and Stripe test-mode — inert until the commercial license is signed.",
    links: [PR(224)],
  },
  {
    id: "M15",
    title: "Enterprise readiness",
    status: "shipped",
    timeframe: "Sep 2026",
    summary:
      "SCIM provisioning, domain claiming, configurable retention, legal hold and audit streaming, plus a scale-validation and integration-catalog plan.",
    links: [PR(225)],
  },

  // ── Forward: the "creative & useful copilot" epic (#244) ──────────
  {
    id: "#232",
    title: "Grounded context retrieval (RAG) for the copilot",
    status: "planned",
    timeframe: "Next",
    summary:
      "Replace the 30-title context stub with authorization-scoped retrieval over real tasks, comments and briefs — Postgres FTS first, pgvector behind a flag. The biggest lever on proposal quality.",
    tags: ["ai", "epic #244"],
    links: [ISSUE(232)],
  },
  {
    id: "#233",
    title: "Richer AI kinds",
    status: "planned",
    timeframe: "Next",
    summary:
      "Risks & open questions, project brief, and a plain-English “what changed” digest — summary-first, staying inside the M06 operation boundary.",
    tags: ["ai", "epic #244"],
    links: [ISSUE(233), ISSUE(243)],
  },
  {
    id: "#235",
    title: "Wider — but still bounded — proposal ops",
    status: "planned",
    summary:
      "Let the copilot propose labels, a status suggestion, a dependency edge and a due-date suggestion. Still confirm + undo + audit; still never assigns people or writes committed dates.",
    tags: ["ai", "epic #244"],
    links: [ISSUE(235), ISSUE(234)],
  },
  {
    id: "#236",
    title: "Streaming proposals + dependency-graph review",
    status: "planned",
    summary:
      "Stream generation over SSE so operations appear as they parse, and render the proposal as a navigable DAG with an effort and complexity roll-up.",
    tags: ["ai", "ux", "epic #244"],
    links: [ISSUE(236), ISSUE(237)],
  },
  {
    id: "#238",
    title: "GitHub delivery loop",
    status: "exploring",
    summary:
      "Self-healing CI: ingest failed workflow runs into a diagnostic proposal on the linked task. Zero-touch lifecycle: drive task status from pull_request events through the rules engine.",
    tags: ["integrations", "epic #244"],
    links: [ISSUE(238), ISSUE(239)],
  },
  {
    id: "#240",
    title: "Auto-changelog on completion",
    status: "exploring",
    summary:
      "Turn a closed cycle's completed tasks into grounded, editable release notes before publishing — the same page you are reading, generated.",
    tags: ["ai", "epic #244"],
    links: [ISSUE(240)],
  },
  {
    id: "#241",
    title: "A command palette that acts",
    status: "exploring",
    summary:
      "Wire natural-language queries into real saved views, and add a read-only “ask” mode answered from retrieval with citations.",
    tags: ["ai", "ux", "epic #244"],
    links: [ISSUE(241), ISSUE(242)],
  },
];
