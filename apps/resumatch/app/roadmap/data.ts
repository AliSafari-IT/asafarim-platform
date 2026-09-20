import type { RoadmapItem } from "@asafarim/ui";

/**
 * The ResuMatch milestone journey.
 *
 * ResuMatch pivoted from an earlier job-board-aggregation product
 * (JobMatch, M0–M7 in the prior roadmap): rather than ingesting postings
 * from external sources and matching a candidate against them — which
 * turned out to require licensing agreements with job boards this project
 * does not want to pursue — it takes the one posting a candidate supplies
 * and uses AI to tailor their existing CV to it. Outcome-led, same as
 * before: a milestone is "shipped" only when its exit evidence is
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
      "Private document storage with byte-level type sniffing and a 10 MB cap, malware scanning as a hard gate (a ClamAV sidecar in production), deterministic PDF/Word/text extraction with an optional AI pass that degrades back to it, full section CRUD with inline editing and manual entry, an AI tone-rewrite for the Summary field, an immutable lineage-linked profile with no field for any protected attribute, and one-click GDPR access + erasure.",
  },
  {
    id: "M3",
    title: "Job details, five ways in",
    status: "shipped",
    summary:
      "The pivot replaced authorized-source ingestion (which needed a licensing agreement per job board) with candidate-supplied postings: paste a URL — fetched under an SSRF-resistant posture, or browsed by the model when a real provider is configured — paste the posting text, paste a job-invitation email, upload the posting as PDF/DOCX, or fill in a manual entry form. Every path lands on the same extracted confirmation before anything else happens.",
    tags: ["pivot"],
  },
  {
    id: "M4",
    title: "AI CV tailoring",
    status: "shipped",
    summary:
      "A tailoring pipeline built around one hard guarantee: AI rewords and reprioritizes a candidate's summary, headline, and experience bullets — it never invents an employer, a date, a degree, or a skill the candidate did not already list. Enforced structurally: provider output is merged with the source profile in code, not trusted verbatim. Proposal-review, not one-shot — generate-preview returns a draft to edit and approve before generate-confirm persists it — with freeform per-run instructions as a third fenced input, a deterministic keyword-coverage report, and a quality checklist on every preview.",
    tags: ["ai"],
  },
  {
    id: "M5",
    title: "Export, history & diff",
    status: "shipped",
    summary:
      "A clean print-optimized layout (Download PDF via the browser's print dialog) plus real DOCX downloads for resume and letter, both generated from the same content source so the two exports can never diverge. The history view lists every tailored run and compares any two side by side. `templateKey` already exists as a field so more layouts stay additive.",
    tags: ["ux"],
  },
  {
    id: "M6",
    title: "AI cover letters",
    status: "shipped",
    summary:
      "A second fenced provider call drafts a cover letter from the same confirmed inputs under the same no-fabrication contract and merge discipline — with tone and length controls, the same preview/confirm review before anything is saved, its own deterministic quality checks, and the same print + DOCX export paths as the resume.",
    tags: ["ai"],
  },
  {
    id: "M7",
    title: "Application tracking",
    status: "shipped",
    summary:
      "A per-application list tracking each job through saved → applied → interviewing → offer/rejected, with a multi-step status indicator, optional notes, a follow-up date field, and a link back to the tailored resume used — the pivot's lightweight replacement for the removed tracked-jobs workflow, with zero licensing exposure since every row is candidate-supplied or candidate-approved.",
    tags: ["ux"],
  },
  {
    id: "M8",
    title: "Real model providers",
    status: "shipped",
    summary:
      "OpenAI and Anthropic adapters for the tailoring and cover-letter calls, plus OpenAI for extraction, Summary rewrite, and job-URL browsing — never selectable in a deployed environment until the JM-005 classification sign-off is recorded and a key is present. The fixture provider stays the only one CI ever exercises. Known gap: the Anthropic extraction/rewrite/job-fetch adapters are still stubs, tracked in docs/megaplan.md (F2).",
    tags: ["ai"],
  },
  {
    id: "M9",
    title: "More layouts & market fit",
    status: "planned",
    timeframe: "Next",
    summary:
      "A second and third visual template to choose between — the review step already lets a candidate hand-adjust content before saving — plus the trust-and-safety backlog that real users need: per-item deletion, rate limiting, follow-up reminders, and NL/FR coverage for the Belgian audience. The full audit and prioritized list live in docs/megaplan.md.",
    tags: ["ux"],
  },
  {
    id: "M10",
    title: "Production readiness & privacy operations",
    status: "exploring",
    timeframe: "Later",
    summary:
      "A DPIA decision for the AI-tailoring flow specifically (a job page's text and a candidate's rewritten resume both pass through a model call), a deployed async worker moving scan/extract/tailor off the request path, an incident runbook, and load + recovery evidence — the bar for operating at pilot scale.",
    tags: ["privacy", "ops"],
  },
];
