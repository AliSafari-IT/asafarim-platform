import type { RoadmapItem } from "@asafarim/ui";

const ISSUE = (n: number) => ({
  label: `#${n}`,
  href: `https://github.com/AliSafari-IT/asafarim-platform/issues/${n}`,
});
const DOC = (label: string, file: string) => ({
  label,
  href: `https://github.com/AliSafari-IT/asafarim-platform/blob/main/apps/jobmatch/docs/${file}`,
});

/**
 * The JobMatch milestone journey (docs/business-plan.md §8). Outcome-led:
 * a milestone is "shipped" only when its exit evidence is demonstrated, not
 * when code merges. M0, M5 and M7 are mid-stream — their non-engineering
 * gates (legal advice, a real candidate cohort) are still open.
 */
export const roadmapItems: RoadmapItem[] = [
  {
    id: "M0",
    title: "Commercial, rights & product decisions",
    status: "in-progress",
    timeframe: "Gate 0",
    summary:
      "The blockers engineering cannot solve. JM-001 (non-commercial showcase) and JM-004 (synthetic demo source) are decided; JM-005 — privacy and EU AI Act classification advice — is still outstanding and gates M5's live matching.",
    tags: ["legal", "decision"],
    links: [DOC("licensing decision", "jm-001-licensing-decision.md")],
  },
  {
    id: "M1",
    title: "Platform & delivery foundation",
    status: "shipped",
    summary:
      "A deployable Next.js app on the platform: Hub SSO, its own pgvector-ready PostgreSQL with an opaque platform user id, a validated env contract, redaction-by-construction logging, an append-only audit table, and CI.",
    tags: ["infra"],
  },
  {
    id: "M2",
    title: "Candidate profile & CV pipeline",
    status: "shipped",
    summary:
      "Private document storage with byte-level type sniffing and a 10 MB cap, malware scanning as a hard gate, local PDF/Word/text extraction, an immutable lineage-linked profile with no field for any protected attribute, and one-click GDPR access + erasure of derived data.",
    highlights: [
      "Production ClamAV scanning is wired via issue #203; uploads fail closed without it",
    ],
  },
  {
    id: "M3",
    title: "Authorized job ingestion",
    status: "shipped",
    summary:
      "A source model that will not sync without a recorded, unexpired agreement; raw snapshots stored before parsing; cross-source dedup chosen by rights not arrival order; four-date freshness; and SSRF-resistant fetching. No live source is connected — that is gated on signed agreements.",
    tags: ["data"],
  },
  {
    id: "M4",
    title: "Search & deterministic eligibility",
    status: "shipped",
    summary:
      "Eligibility across seven axes (sponsorship, language, certification, remote/location, salary floor, contract, employer opt-out), every hard exclusion shown with its reason, controlled-vocabulary normalisation that never overwrites source text, and a per-workspace search rate limit.",
  },
  {
    id: "M5",
    title: "Explainable matching beta",
    status: "in-progress",
    timeframe: "Gate 2",
    summary:
      "The MatchResult contract (JM-039) and the privacy-preserving embedding input (JM-040) are built and schema-validated. Embedding generation, ranking, structured LLM evaluation, injection tests, the offline eval set, bias evaluation, budget controls and the evidence UI are planned — fixture-first, with no live model call until JM-005 clears.",
    tags: ["ai"],
    links: [ISSUE(256)],
  },
  {
    id: "M6",
    title: "Candidate workflow & My-Job export",
    status: "shipped",
    summary:
      "Idempotent save / reject / mark-applied transitions on any result, a tracked-job record scoped to the caller's session, and a deterministic My-Job CSV with fixed column order, ISO 8601 UTC dates and formula-injection escaping on every field.",
  },
  {
    id: "M7",
    title: "Concierge beta & relevance validation",
    status: "in-progress",
    timeframe: "Gate 2",
    summary:
      "The engineering slice (JM-059) shipped: a candidate can report why any result is wrong with a typed reason code that routes to profile, source, or rule. The rest — recruiting a real candidate cohort, live onboarding, a human relevance study, a published beta decision report — needs real people and real usage data.",
  },
  {
    id: "M8",
    title: "Belgian source & language expansion",
    status: "planned",
    timeframe: "Gate 3",
    summary:
      "One approved source each for Flanders, Brussels and Wallonia (or a documented alternative), with a multilingual quality report across Dutch, French and English.",
    tags: ["data"],
  },
  {
    id: "M9",
    title: "Production readiness & privacy operations",
    status: "planned",
    timeframe: "Gate 3",
    summary:
      "A DPIA decision, operational deletion / access workflows, an incident runbook, and load + recovery evidence — the bar for operating at pilot scale.",
    tags: ["privacy", "ops"],
  },
  {
    id: "M10",
    title: "B2C monetization",
    status: "exploring",
    timeframe: "Gate 4",
    summary:
      "A Pro subscription, one-time career products and premium My-Job capabilities — only after paid candidate value and unit economics are validated. Requires a fresh commercial-licensing review.",
  },
  {
    id: "M11",
    title: "Institutional & partner pilots",
    status: "exploring",
    timeframe: "Gate 4",
    summary:
      "Controlled agreements with organisations: a consent model, tenant isolation, and a partner outcome report.",
  },
  {
    id: "M12",
    title: "Recruiter product readiness",
    status: "exploring",
    timeframe: "Gate 5",
    summary:
      "A compliant, human-supervised B2B product — gated on a full AI Act / employment-law review, recruiter human-oversight procedures, candidate consent and visibility controls, audit trails, and a bias + performance audit before any go/no-go.",
    tags: ["legal"],
  },

  // ── M5 workstream (epic #256) — the near-term engineering queue ────
  {
    id: "#246",
    title: "Async matching worker + gated AI env",
    status: "planned",
    timeframe: "M5 · next",
    summary:
      "A BullMQ worker for JobMatch (it has none today) and an env contract where a non-fixture model provider cannot be enabled on a deployed environment until the JM-005 classification gate is signed off.",
    tags: ["ai", "epic #256"],
    links: [ISSUE(246), ISSUE(255)],
  },
  {
    id: "#247",
    title: "Embeddings + ranking",
    status: "planned",
    timeframe: "M5 · next",
    summary:
      "Content-hash-cached profile and posting embeddings on a pgvector column (wiped on erasure), then a pure ranking function that shortlists after — never instead of — M4's hard filters, with similarity never surfaced as hiring probability.",
    tags: ["ai", "epic #256"],
    links: [ISSUE(247), ISSUE(248)],
  },
  {
    id: "#249",
    title: "Structured evaluation + injection isolation",
    status: "planned",
    timeframe: "M5 · next",
    summary:
      "The evaluation pipeline that turns a shortlisted pair into a schema-valid MatchResult — quota, redaction, fenced posting text, retry, honest degraded mode — plus an adversarial corpus proving a job description cannot move the score or exfiltrate candidate data.",
    tags: ["ai", "security", "epic #256"],
    links: [ISSUE(249), ISSUE(250)],
  },
  {
    id: "#251",
    title: "Offline eval, bias eval & budget controls",
    status: "exploring",
    timeframe: "M5 · exit gate",
    summary:
      "A versioned offline evaluation set seeded from the showcase fixture, perturbation-pair bias testing for the AI Act file, and per-workspace model / prompt / budget controls with a spend dashboard.",
    tags: ["ai", "epic #256"],
    links: [ISSUE(251), ISSUE(252), ISSUE(253)],
  },
  {
    id: "#254",
    title: "Evidence-linked explanation UI",
    status: "exploring",
    timeframe: "M5 · exit gate",
    summary:
      "The candidate-facing panel: score with confidence, matching / missing / uncertain requirements as distinct lists, every explanation row traceable to a confirmed-profile fact and a posting requirement, and a “report incorrect evidence” action feeding the M7 feedback pipeline.",
    tags: ["ai", "ux", "epic #256"],
    links: [ISSUE(254)],
  },
];
