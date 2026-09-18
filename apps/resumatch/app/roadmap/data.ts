import type { RoadmapItem } from "@asafarim/ui";

/**
 * The ResuMatch milestone journey.
 *
 * ResuMatch pivoted from an earlier job-board-aggregation product
 * (JobMatch, M0–M7 in the prior roadmap): rather than ingesting postings
 * from external sources and matching a candidate against them — which
 * turned out to require licensing agreements with job boards this project
 * does not want to pursue — it fetches the single job URL a candidate
 * pastes and uses AI to tailor their existing CV to it. Outcome-led, same
 * as before: a milestone is "shipped" only when its exit evidence is
 * demonstrated, not when code merges.
 */
export const roadmapItems: RoadmapItem[] = [
  {
    id: "M1",
    title: "Platform & delivery foundation",
    status: "shipped",
    summary:
      "A deployable Next.js app on the platform: Hub SSO, its own PostgreSQL with an opaque platform user id, a validated env contract, redaction-by-construction logging, an append-only audit table, and CI. Carried over unchanged from the pre-pivot product.",
    tags: ["infra"],
  },
  {
    id: "M2",
    title: "Candidate profile & CV pipeline",
    status: "shipped",
    summary:
      "Private document storage with byte-level type sniffing and a 10 MB cap, malware scanning as a hard gate, local PDF/Word/text extraction, an immutable lineage-linked profile with no field for any protected attribute, and one-click GDPR access + erasure. Carried over unchanged — this is exactly what a CV-tailoring tool still needs.",
  },
  {
    id: "M3",
    title: "Pivot: single-URL job fetch",
    status: "shipped",
    summary:
      "Replaced the authorized-source ingestion pipeline (which needed a licensing agreement per job board) with a single-URL fetch: a candidate pastes one job posting URL, ResuMatch fetches exactly that page under the same SSRF-resistant posture (public HTTPS only, no-redirect, size-capped, timeout-bounded), extracts readable text, and shows the candidate what it found before anything else happens.",
    tags: ["pivot"],
  },
  {
    id: "M4",
    title: "AI CV tailoring",
    status: "shipped",
    summary:
      "A tailoring pipeline built around one hard guarantee: AI rewords and reprioritizes a candidate's summary, headline, and experience bullets — it never invents an employer, a date, a degree, or a skill the candidate did not already list. Enforced structurally: provider output is merged with the source profile in code, not trusted verbatim. Fixture-first, with a deterministic $0 provider as the only one CI exercises; real model adapters wait on the JM-005 sign-off gate.",
    tags: ["ai"],
  },
  {
    id: "M5",
    title: "Print-ready preview & one layout",
    status: "shipped",
    summary:
      "One clean, print-optimized layout rendered from the tailored content, with a Download PDF button that uses the browser's own print dialog — no new server-side rendering dependency for v1. `templateKey` already exists as a field so a second layout is additive later, not a schema change.",
  },
  {
    id: "M6",
    title: "More layouts & richer editing",
    status: "planned",
    timeframe: "Next",
    summary:
      "A second and third visual template to choose between, and an editable review step before the final preview — today's flow shows the AI-tailored content read-only; letting a candidate hand-adjust a bullet before printing is the natural next step.",
    tags: ["ux"],
  },
  {
    id: "M7",
    title: "Real model providers",
    status: "planned",
    timeframe: "Next",
    summary:
      "OpenAI and Anthropic tailoring adapters, gated the same way the pre-pivot product gated real-model evaluation: never selectable in a deployed environment until the JM-005 classification sign-off is recorded and a key is present. The fixture provider stays the only one CI ever exercises.",
    tags: ["ai"],
  },
  {
    id: "M8",
    title: "Production readiness & privacy operations",
    status: "exploring",
    timeframe: "Later",
    summary:
      "A DPIA decision for the AI-tailoring flow specifically (a job page's text and a candidate's rewritten resume both pass through a model call), operational deletion/access workflows, an incident runbook, and load + recovery evidence — the bar for operating at pilot scale.",
    tags: ["privacy", "ops"],
  },
];
