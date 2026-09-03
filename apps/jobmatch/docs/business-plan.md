# JobMatch — Investor-Ready Business Plan

**Plan date:** 2 September 2026  
**Stage:** Pre-MVP concept and business plan  
**Initial geography:** Belgium — Flanders, Brussels, and Wallonia  
**Initial customer:** Individual job seekers in technology and specialized professions

## Executive context and assumptions

This plan is based on the current ASafarIM Platform structure and the current state of the JobMatch app directory.

- The repository is a pnpm/Turborepo monorepo containing multiple Next.js apps and shared packages.
- Existing reusable foundations include Auth.js SSO, PostgreSQL/Prisma, S3-compatible storage, a shared UI system, Redis/BullMQ workers, Docker Compose, and Caddy deployment conventions.
- The current JobMatch artifact is only a starter `package.json`; no JobMatch application, routes, data model, ingestion connector, AI pipeline, tests, or deployment configuration has been implemented yet.
- No `My-Job` file or integration is present in the repository. This plan treats `My-Job` as a user-owned tracking artifact whose exact extension, schema, and storage location must be decided before implementation.
- The repository root license currently limits use to personal, non-commercial evaluation. A written commercial license or a suitable relicensing decision is required before operating this as a commercial service.

Relevant platform references:

- [Platform overview](../../README.md)
- [Workspace configuration](../../pnpm-workspace.yaml)
- [Platform app registry](../../packages/auth/src/apps.ts)
- [Cross-app URL registry](../../packages/ui/src/links.ts)
- [Repository license](../../LICENSE)
- [Current JobMatch manifest](../package.json)

---

# 1. Executive Summary

## The problem

Job seekers face three related problems:

1. **Too much irrelevant inventory.** Job boards expose thousands of listings, while keyword searches often return jobs that mention a skill but are unsuitable in terms of seniority, language, location, salary, contract type, or actual responsibilities.
2. **A fragmented Belgian market.** Candidates search across Dutch-, French-, and English-language sources, regional employment agencies, recruitment firms, consultancy boards, and employer career pages.
3. **Poor decision support.** Most platforms tell candidates that a job exists, but not why it fits, which requirements they meet, which gaps matter, or whether the opportunity is worth their time.

The business hypothesis is that candidates will pay for fewer, better, explainable opportunities rather than more search results.

## The solution

JobMatch is a candidate-first AI job-intelligence platform that acts as a personal recruiter without pretending to make the hiring decision.

The product will:

1. Aggregate jobs from authorized public, official, licensed, or partner sources.
2. Parse a user's CV into a structured and editable candidate profile.
3. Normalize skills, experience, seniority, language, location, contract preferences, and salary expectations.
4. Apply deterministic eligibility filters to remove clearly unsuitable jobs.
5. Use vector similarity to identify semantically relevant opportunities.
6. Use an LLM only on the strongest candidates to produce:
   - a suitability score from 0–100;
   - matching evidence;
   - missing or uncertain skills;
   - an explanation of the score; and
   - recommended next steps.
7. Let the user save, reject, apply to, and track jobs.
8. Export saved or applied jobs into the user's `My-Job` tracking file.

The initial product should not submit applications automatically. The candidate remains in control and is redirected to the original source to apply.

## Positioning

> **JobMatch is not another job board. It is a personal, explainable job-search assistant that reduces hundreds of vacancies to the opportunities worth acting on.**

The product should be:

- candidate-controlled;
- advisory rather than autonomous;
- evidence-based;
- multilingual;
- source-transparent;
- privacy-first; and
- free from pay-to-rank manipulation.

## Why Belgium first

Statbel reported 140,462 job vacancies in Belgium in Q1 2026, with an overall vacancy rate of 3.42%. ICT had the highest sector vacancy rate at 6.21%. Flanders represented 65.73% of vacancies, Wallonia 21.39%, and Brussels 12.88%. These figures describe the total labor market, not JobMatch's serviceable market, but they confirm meaningful initial demand.

VDAB's 2026 shortage-occupation research identifies 227 shortage occupations and distinguishes quantitative shortages, qualitative skills mismatches, and unsuitable working conditions. This supports JobMatch's focus on explaining the difference between a lack of candidates and a lack of fit.

## Initial business model

The recommended sequence is:

1. Launch a free candidate product to establish usage and relevance.
2. Introduce a paid candidate subscription for higher usage and advanced career tools.
3. Sell one-time career products such as job-specific CV tailoring and interview preparation.
4. Add recruiter and consultancy tools only after compliance, source rights, and matching quality are proven.

JobMatch should not sell candidate CV data or allow employers to pay for better candidate rankings.

---

# 2. Target Market & Go-to-Market Strategy

## Initial ideal customer profile

The primary customer is a Dutch-, French-, or English-speaking professional in Belgium who:

- is actively searching or considering a job change;
- works in technology or a specialized profession;
- has a CV but lacks time to evaluate every vacancy;
- applies across multiple job boards and consultancy sites;
- is comfortable uploading a CV for personalized recommendations; and
- needs help translating experience into relevant opportunities.

## Initial role categories

The first niche should be broader than one title such as “AI integration developer,” while remaining specialized enough to avoid a cold-start problem.

Recommended categories:

- AI integration and automation developers;
- software and full-stack developers;
- data, cloud, DevOps, and platform engineers;
- business and systems analysts;
- cybersecurity and GRC specialists;
- technical project and product managers;
- industrial automation and process engineers;
- life-science technology specialists; and
- ERP, SAP, and enterprise-integration professionals.

These roles are attractive because requirements are relatively structured, skills are transferable, and candidates often face large variations in terminology.

## Regional strategy

### Flanders

- Primary language: Dutch
- Secondary language: English
- Source hypothesis: VDAB and private technical employers
- Distribution: universities, coding schools, professional associations, technology communities, and consultancy firms

VDAB's official Vacancy API supports vacancy retrieval, detail retrieval, bulk synchronization, and filtering. Official access requires an approved partnership and cooperation agreement. The current VDAB partner page also states that new API applications may temporarily be unavailable, so JobMatch must not depend on VDAB as its only launch source.

### Brussels

- Languages: French, Dutch, and English
- Target users: international professionals, consultants, technology workers, and EU-related specialists
- Distribution: international communities, universities, incubators, recruitment partners, and language-specific communities
- Source strategy: approved Actiris access, public feeds, employer partnerships, and licensed private sources

### Wallonia

- Primary language: French
- Secondary language: English
- Source hypothesis: Le Forem and private technical employers
- Distribution: universities, training organizations, engineering communities, and digital-skills programs

Le Forem provides APIs for automated employment-data exchange and partner integrations. Access, permitted fields, and reuse conditions must be confirmed for each intended use.

## First 1,000 activated users

A registered account is not sufficient as a success metric. An **activated user** should:

1. upload or create a candidate profile;
2. confirm or edit the parsed information;
3. review at least five relevant jobs; and
4. save, reject, or apply to at least one job.

Illustrative acquisition target:

| Channel | Target activated users | Tactics |
|---|---:|---|
| Founder-led onboarding | 200 | Directly recruit professionals in Belgian technology and consulting networks |
| Universities and bootcamps | 200 | Offer free CV-to-job matching sessions to graduating cohorts |
| Career and professional communities | 200 | Workshops and practical Dutch, French, and English content |
| Referral loop | 200 | Give users additional deep evaluations for inviting peers |
| Recruitment and consultancy partners | 150 | Run small co-branded pilots with candidate consent |
| Organic search and multilingual content | 50 | Role-specific pages for specialized professions and shortage skills |
| **Total** | **1,000** |  |

These numbers are acquisition targets, not forecasts.

## Distribution sequence

### Phase 1: Concierge validation

Start with a small group of candidates and manually observe:

- which CV information is frequently parsed incorrectly;
- which job attributes candidates consider essential;
- which explanations create trust;
- which recommended jobs candidates save or apply to; and
- whether candidates prefer a score, a category, or a written explanation.

The first version should optimize relevance and learning, not job volume.

### Phase 2: Community-led growth

Create practical content around:

- what an AI integration developer does;
- transferable skills between technologies;
- how to evaluate Belgian consultancy vacancies;
- Dutch versus English job requirements;
- the meaning of “five years of experience”; and
- hard requirements versus preferences.

Each article should lead to a JobMatch workflow rather than function only as SEO content.

### Phase 3: Partner-led distribution

Potential partners include:

- coding bootcamps;
- university career centers;
- outplacement organizations;
- reskilling and digital-skills programs;
- professional associations;
- recruitment firms;
- engineering and life-science consultancies; and
- employers with difficult-to-fill technical roles.

Pauwels Consulting is a possible partner hypothesis because it operates across engineering, life sciences, digital, and business consulting. No partnership currently exists in the repository or has been verified. The preferred approach is a licensed feed or partner pilot, not unapproved scraping.

## Competitive positioning

JobMatch should compete on:

- relevance rather than listing volume;
- multilingual normalization;
- explainability;
- candidate ownership;
- cross-source tracking;
- transparent data provenance; and
- privacy and regulatory readiness.

It should not attempt to outspend LinkedIn, Indeed, or major job boards on inventory or advertising.

## Expansion beyond technology

After the matching engine performs well in technical roles, expand into:

1. engineering and industrial operations;
2. life sciences and pharmaceuticals;
3. finance, accounting, and compliance;
4. healthcare administration and technology;
5. skilled trades and technical maintenance;
6. logistics and supply-chain roles; and
7. public-sector and nonprofit specialist roles.

Each expansion should follow evidence that the skill ontology and evaluation method generalize to the new category.

## GTM success metrics

- activated users;
- CV parsing confirmation rate;
- weekly active candidates;
- jobs reviewed per active candidate;
- save rate;
- application-start rate;
- relevance rating for the top five matches;
- 14-day and 30-day retention;
- free-to-paid conversion;
- referral rate;
- cost per activated user; and
- partner-sourced activation rate.

---

# 3. Technical Architecture & Infrastructure

## Recommended architecture

JobMatch should begin as a **modular monolith with independent workers**, matching the platform's existing architecture style.

The web application can remain one Next.js deployment while ingestion, parsing, embedding, and evaluation run asynchronously through workers.

```text
Authorized job sources
        |
        v
Source connectors
        |
        v
Raw snapshots + provenance
        |
        v
Normalization, deduplication, freshness checks
        |
        v
Job index + embeddings
        |
        v
Deterministic hard filters
        |
        v
Vector pre-filtering
        |
        v
LLM deep evaluation
        |
        v
Explainable candidate matches
        |
        +--> JobMatch web interface
        |
        +--> Saved/applied tracker
        |
        +--> My-Job export
```

The candidate flow is separate:

```text
CV upload -> private object storage -> extraction/OCR -> structured profile
          -> candidate confirmation -> profile version -> matching pipeline
```

## Platform integration

| Capability | Existing foundation | JobMatch use |
|---|---|---|
| Authentication | `@asafarim/auth` and Hub SSO | Shared candidate and recruiter identity |
| UI | `@asafarim/ui` | Shared navigation, tokens, forms, and alerts |
| Object storage | `@asafarim/storage` | Private CV files and derived artifacts |
| Database | PostgreSQL/Prisma conventions | Core metadata, audit, and configuration |
| Async work | Redis and BullMQ patterns | Ingestion, OCR, parsing, embeddings, and scoring |
| Deployment | Docker Compose and Caddy | Web application and worker deployment |
| Testing | Vitest, Playwright, and axe-core patterns | Matching, security, accessibility, and regression tests |

A JobMatch entry must eventually be added to the platform registry and URL system. The current platform centralizes these definitions rather than maintaining separate app lists.

## Database recommendation

The platform uses both shared and isolated database patterns:

- EduMatch and TimelineAI use the shared platform PostgreSQL database.
- AppBuilder and Testora use isolated application databases.

JobMatch should use a **dedicated PostgreSQL database with vector support** because:

- job listings are high-volume and frequently updated;
- ingestion traffic is independent from identity traffic;
- CV data requires stricter access boundaries;
- embedding indexes can grow rapidly; and
- search and ingestion workloads should not compete with platform transactions.

The shared platform identity remains the authentication source. The JobMatch database stores an opaque authenticated user ID and does not duplicate the platform user table.

Recommended entities:

- `JobSource`
- `JobSourceAgreement`
- `JobPosting`
- `JobSnapshot`
- `JobEmbedding`
- `CandidateProfile`
- `CandidateProfileVersion`
- `CandidateDocument`
- `MatchEvaluation`
- `SavedJob`
- `ApplicationRecord`
- `MyJobExport`
- `UsageEvent`
- `AuditEvent`

## Data ingestion layer

### Source priority

Use the following order of preference:

1. official APIs;
2. licensed commercial feeds;
3. direct employer or consultancy feeds;
4. public open-data portals with explicit reuse rights;
5. public career pages with written permission; and
6. limited browser collection where automated access is explicitly permitted.

“Publicly visible” must not be treated as equivalent to “licensed for bulk commercial reuse.”

### Connector contract

Each connector should provide:

- source name;
- external job ID;
- canonical job URL;
- employer;
- title;
- description;
- location;
- language;
- contract type;
- salary information when available;
- skills and qualifications;
- publication date;
- expiry or last-seen date;
- source attribution;
- terms or agreement reference; and
- capture timestamp.

### Normalization and deduplication

Deduplicate using:

- source-specific external ID;
- canonical URL;
- employer normalization;
- normalized title;
- location;
- description hash; and
- publication and expiry dates.

Every displayed job should retain the original source and link to the source application page.

### Rate limits and proxy policy

The default policy is **no proxy rotation**.

- Use source-specific rate limits.
- Use conditional requests, caching, incremental synchronization, and exponential backoff.
- Use a stable egress identity where possible.
- Use a managed proxy only when a source agreement explicitly permits it or geographic routing is genuinely required.
- Never rotate proxies to bypass CAPTCHA, rate limits, anti-bot controls, authentication, or a source's refusal of automated access.
- Disable a connector when the source does not authorize automated collection.

If a source cannot be accessed lawfully and reliably, JobMatch should not build its business model around that source.

## CV parsing layer

The CV pipeline should:

1. accept PDF and common document formats;
2. validate MIME type and file size;
3. scan files for malware;
4. store originals in private object storage;
5. extract text locally where possible;
6. use OCR only for scanned documents;
7. send the minimum necessary text to the selected model;
8. return structured JSON validated by a schema;
9. show the parsed profile to the user for correction; and
10. create immutable profile versions for matching reproducibility.

The system must not infer or score ethnicity, religion, political beliefs, sexual orientation, health, disability, pregnancy, or personality from writing style. CV photographs should not be analyzed for suitability.

## Two-tier matching engine

### Tier 0: deterministic eligibility filters

Before embeddings or LLM evaluation, apply explicit rules for:

- required language;
- required certification;
- work authorization;
- location or remote constraints;
- salary floor;
- contract type;
- seniority;
- mandatory technology;
- job expiry; and
- user opt-outs.

A deterministic filter must be able to explain why a job was removed.

### Tier 1: vector similarity

Create embeddings for normalized job descriptions and candidate skills/experience. Embedding text should exclude unnecessary direct identifiers such as names, emails, telephone numbers, home addresses, and photographs.

Embeddings produce a shortlist; they do not make the final decision.

### Tier 2: LLM evaluation

Only the strongest candidates should reach deep evaluation. The model should return structured data containing:

```text
suitability_score: 0–100
confidence: low | medium | high
matching_skills: [...]
missing_skills: [...]
uncertain_requirements: [...]
evidence: [...]
explanation: [...]
recommended_action: [...]
```

The score represents observed fit against available profile and job data, not probability of being hired.

Each explanation should link to a specific CV fact, job requirement, uncertainty, or missing piece of information. Job descriptions are untrusted input; instructions embedded in a listing must never override system instructions.

## Cost controls and prompt optimization

- Parse a CV only when the profile changes.
- Normalize a job description once per source update.
- Cache job embeddings by content hash.
- Cache evaluations by candidate profile version, job content hash, prompt version, and model version.
- Use a small model for extraction and classification.
- Use a stronger model only for shortlisted jobs.
- Limit deep evaluations by plan tier.
- Remove duplicated boilerplate and navigation text.
- Store structured facts instead of repeatedly sending entire documents.
- Batch embedding work.
- Run non-urgent evaluations asynchronously.
- Set per-user and global monthly AI budgets.
- Use provider adapters to avoid hard vendor lock-in.

## My-Job integration

No My-Job artifact currently exists in the repository. Before implementation, define:

- file extension;
- local versus cloud storage;
- column names;
- ownership model;
- duplicate identity;
- import and export behavior; and
- conflict resolution.

### Recommended MVP

Start with a deterministic download named `My-Job.csv` or `My-Job.xlsx`.

Suggested columns:

- Job ID
- Source
- Source URL
- Job title
- Employer
- Location
- Contract type
- Salary range
- Match score
- Score version
- Matching skills
- Missing skills
- Explanation
- Status
- Saved date
- Applied date
- Interview date
- Follow-up date
- Notes
- Last source update

Do not silently overwrite a local file. A browser cannot write to an arbitrary local file without explicit user permission. The initial workflow should download a new export or use the browser File System Access API only with consent.

Later versions can support Google Drive, OneDrive, SharePoint, Notion, or Airtable. The export writer should be deterministic, versioned, idempotent, and tested against fixed fixtures.

---

# 4. Revenue & Monetization Model

## Revenue stream 1: B2C Pro subscription

### Free tier

- One candidate profile
- Limited refreshes
- Limited deep evaluations
- Basic saved-job tracking
- Basic My-Job export

### Pro tier

Pricing hypothesis to validate through paid pilots:

- approximately €9.90–€14.90 per month;
- annual plan with a modest discount;
- higher evaluation allowance;
- multiple profile versions;
- advanced skill-gap analysis;
- job-specific CV guidance;
- interview preparation;
- priority refreshes; and
- advanced My-Job synchronization.

## Revenue stream 2: One-time career products

Possible products:

- job-specific CV tailoring;
- cover-letter preparation;
- interview preparation;
- skill-gap learning plan;
- career-transition report; and
- multi-job application review.

An illustrative test range is €29–€79 per package. These products are AI-assisted career support and must not promise employment outcomes.

## Revenue stream 3: Recruiter and consultancy subscriptions

Potential customers include technical recruitment firms, engineering consultancies, life-science recruiters, and SME recruitment teams.

Possible capabilities:

- search opt-in candidate profiles;
- receive candidate-consented recommendations;
- understand why a candidate matches;
- see missing skills and uncertainties;
- contact candidates through a controlled workflow; and
- track recruiter-side pipeline activity.

Pilot pricing can be tested around €299–€999 per team per month or through usage-based pricing. This product should not launch until candidate consent, auditability, AI Act classification, and human oversight are operationally real.

## Revenue stream 4: Institutional and licensed integrations

Potential customers include universities, training providers, public employment initiatives, reskilling programs, and outplacement organizations.

Models include:

- per-seat licensing;
- annual institutional contracts;
- white-label candidate portals;
- API access; and
- aggregated labor-market intelligence.

Analytics must use aggregated or sufficiently anonymized data. Identifiable candidate-profile sales should not be part of the business model.

## Monetization principles

JobMatch should reject:

- pay-to-rank candidate results;
- pay-to-rank job results;
- sale of candidate CVs;
- hidden recruiter influence over recommendations;
- unclear affiliate relationships; and
- automatic applications without user confirmation.

---

# 5. Cost Structure & Unit Economics

The following are planning assumptions, not vendor quotations.

## LLM usage envelope

For 1,000 activated users, assuming ten deep evaluations per user per month:

- 10,000 deep evaluations per month;
- approximately 3,000–8,000 input tokens per evaluation;
- approximately 500–1,000 output tokens per evaluation;
- approximately 30–80 million deep-evaluation input tokens monthly; and
- approximately 5–10 million deep-evaluation output tokens monthly.

One CV parse per user adds approximately 8,000–15,000 input tokens and 1,000–3,000 output tokens, mostly as a one-time or profile-version cost.

If Pro users receive 50 evaluations instead of ten, the evaluation component is approximately five times larger. Usage limits and caching are essential.

```text
LLM cost =
(input tokens / 1,000,000 × input price)
+ (output tokens / 1,000,000 × output price)
+ embedding cost
+ OCR/document-processing cost
```

Actual provider pricing should be obtained before financial close because model prices and data-processing terms change.

## Primary cost centers

| Cost center | Main driver | Control |
|---|---|---|
| CV parsing | Profile versions and document size | Local extraction, parse-on-change, structured output |
| Deep evaluation | Jobs evaluated per user | Tier limits, shortlist first, caching |
| Embeddings | New or changed jobs | Hash-based refreshes and batch processing |
| Vector database | Job/profile/index volume | Dedicated PostgreSQL/vector service and index monitoring |
| Job database | Listing volume and snapshot retention | Retain normalized data longer than raw snapshots |
| Object storage | CV originals, OCR output, exports | Private buckets and retention rules |
| Browser workers | Permitted page complexity | Prefer APIs and feeds; never run browsers in request path |
| Proxy services | Permitted source access | Budget zero by default |
| Redis/BullMQ | Ingestion and evaluation throughput | Queue namespaces and gradual isolation |
| Worker compute | OCR, browser, and embeddings | Separate workloads by resource profile |
| Monitoring/email | Alerts and digests | Never log raw CV or job text |
| Compliance/legal | Agreements, DPIA, audits | Treat as launch-critical budget |
| Security | Scanning and testing | Signed URLs, least privilege, penetration testing |

## Illustrative pilot allowance

A small pilot may require planning allowances such as:

- dedicated database/vector service: €50–€250 per month;
- worker compute: €100–€500 per month;
- object storage and backups: €10–€100 per month;
- permitted browser infrastructure: €0–€500 per month;
- permitted proxy services: €0 by default, depending on contracts;
- monitoring, email, and operational tools: €50–€250 per month; and
- legal, privacy, and security: primarily one-time project costs plus recurring advisory support.

These figures must be replaced with actual quotes after source-access requirements are known.

## Unit-economic targets

These are management targets to validate, not current results:

- AI and infrastructure variable cost below 25–30% of Pro subscription revenue;
- gross margin above 70% at mature usage levels;
- customer-acquisition payback within three months;
- 5–10% free-to-paid conversion after relevance is proven;
- positive month-three retention for paid users; and
- increasing application-start rate without increasing irrelevant applications.

## Core formulas

```text
Gross margin = (revenue - variable AI/storage/processing/payment costs) / revenue

CAC = sales and marketing spend / new activated or paid customers

Paid payback period = CAC / monthly gross profit per paid customer

Match precision@5 = relevant top-five matches / evaluated top-five matches
```

## Quality gates before scaling

- Measured top-five relevance above a predefined user-validated threshold
- Stable quality across Dutch, French, and English profiles
- High job freshness and low duplicate rate
- Low rate of unsupported scores
- Successful CV deletion and export workflows
- No unresolved source-license issues
- No material evidence of protected-attribute bias
- Predictable per-user AI cost

---

# 6. Risk Analysis & Mitigation

| Risk | Impact | Mitigation |
|---|---|---|
| Unauthorized scraping | Legal claims and blocked sources | Prefer APIs, feeds, and written agreements; maintain a source-rights register |
| Anti-scraping controls | Connector instability and cost | Respect limits; use backoff and caching; never bypass access controls |
| VDAB dependency | Launch delay or incomplete Flanders coverage | Start partnership work early and maintain alternative sources |
| Stale vacancies | Candidates waste time | Incremental sync, expiry checks, last-seen timestamps, freshness labels |
| Duplicate vacancies | Inflated inventory and poor ranking | Canonical URLs, source IDs, employer/title/content hashing |
| CV data breach | Severe privacy and reputational damage | Private storage, encryption, signed URLs, malware scanning, deletion workflows |
| Excessive data collection | GDPR exposure | Collect only necessary data; avoid sensitive attributes and unnecessary raw retention |
| Special-category CV data | Regulatory exposure | Do not use sensitive data for ranking; provide controls and deletion |
| Automated decision risk | Unlawful or opaque employment outcomes | Keep recommendations advisory; provide explanation, correction, human review, and contestability |
| EU AI Act classification | High-risk compliance obligations | Treat employment matching/ranking as high-risk by default and obtain legal classification |
| Model hallucination | False confidence and harmful applications | Evidence-linked output, explicit unknowns, deterministic filters, evaluations |
| Prompt injection in job text | System manipulation or data leakage | Treat every listing as untrusted content and isolate it from system instructions |
| Bias in ranking | Discrimination and poor outcomes | Remove protected attributes, test across languages, audit score distributions |
| Provider outage | Interrupted matching | Provider adapters, fallback, queued retries, honest degraded mode |
| LLM cost escalation | Negative margins | Usage caps, model cascade, caching, token budgets, metering |
| Candidate cold start | Low-quality recommendations | Start with one role family and a small set of high-quality sources |
| Fake or scam jobs | Candidate harm | Source allowlists, employer-domain checks, reporting, source attribution |
| My-Job ambiguity | Failed export experience | Define schema first; begin with deterministic export; never silently overwrite |
| Local-file limitations | Users expect silent updates | Explain download behavior; add explicit file/cloud connectors later |
| Current repository license | Inability to commercialize current code | Obtain commercial license or relicense before customer deployment |
| Shared platform contention | Impact on other apps | Isolate JobMatch search/ingestion data and workers |

## Regulatory posture

The European Commission's AI Act Service Desk explicitly lists automated job matching and ranking tools that analyze CVs and job descriptions as a high-risk employment use case. Calling the product “assistive” does not by itself remove the need for legal classification and compliance planning.

GDPR Article 22 protects individuals from decisions based solely on automated processing that produce legal or similarly significant effects. Candidate-side recommendations are safer than automatic employer rejection, but they can still influence access to opportunities and should include transparency, human control, correction, and contestability.

The Belgian Data Protection Authority emphasizes that recruitment data should be limited to what is strictly necessary and places restrictions around sensitive candidate information.

Before processing CVs at scale or launching recruiter features, establish:

- controller and processor responsibilities;
- LLM provider data-processing agreements;
- retention and deletion periods;
- candidate access, correction, deletion, and portability procedures;
- cross-border transfer safeguards;
- audit-log retention;
- model and prompt versioning;
- human-oversight procedures; and
- incident response.

---

# 7. Execution Plan and Investment Gates

## Gate 0 — Commercial and data-rights readiness

Resolve these before broad ingestion:

1. written commercial license for the relevant platform code;
2. JobMatch ownership and commercialization structure;
3. `My-Job` schema and ownership model;
4. source-rights register;
5. VDAB partnership or alternative Flanders source;
6. Forem and Brussels source-access assessment;
7. privacy counsel and DPIA plan; and
8. candidate terms and privacy notice.

## Gate 1 — Technical foundation

Build:

- Next.js JobMatch application;
- shared Hub SSO integration;
- dedicated JobMatch database;
- private CV storage;
- candidate profile and profile-version model;
- job-source model;
- one authorized source connector;
- deterministic My-Job export;
- audit and usage metering; and
- unit and integration tests.

## Gate 2 — Candidate beta

Add:

- CV parsing;
- profile-confirmation UI;
- normalized skill taxonomy;
- hard filters;
- embedding pre-filter;
- structured LLM evaluation;
- match explanations;
- saved and applied tracking; and
- relevance feedback.

The outcome should be proof that candidates trust and act on recommendations.

## Gate 3 — Belgian coverage

Add sources gradually:

1. one strong Flanders source;
2. one Brussels source;
3. one Wallonia source; and
4. one private consultancy or employer partner.

Do not add a source unless data rights, freshness, duplicates, attribution, and connector failure are observable.

## Gate 4 — Monetization

Launch:

- Pro subscription;
- one-time career products;
- premium My-Job capabilities; and
- an institutional pilot.

Only then evaluate recruiter features.

## Gate 5 — B2B recruiter product

Before launch:

- complete AI Act classification and conformity analysis;
- establish recruiter human-oversight procedures;
- prevent automatic rejection based solely on JobMatch output;
- build candidate consent and visibility controls;
- add recruiter audit trails;
- perform bias and performance testing; and
- review Belgian employment-agency and intermediary obligations.

## Suggested use of initial funding

A staged allocation could be:

- 40% product and engineering;
- 20% privacy, legal, source agreements, and security;
- 15% data ingestion and infrastructure;
- 15% distribution and partnerships; and
- 10% contingency.

Funding should be released against evidence of source access, match quality, activation, retention, and cost control rather than feature completion alone.

---

# 8. Milestones & Related Issues

This roadmap converts the investment gates into an execution backlog. It is intentionally outcome-led: a milestone is complete only when its exit criteria are demonstrated, not when its code has been merged. Issues should be created in the project tracker with the IDs below so that product, legal, data, security, and go-to-market work remain visible in one delivery sequence.

## Delivery conventions

- **Priority:** `P0` blocks the next gate or creates material legal, privacy, security, or data-rights risk; `P1` is required for the milestone outcome; `P2` improves quality or scale after the gate is proven.
- **Issue types:** `DEC` decision, `LEGAL` legal/compliance, `PROD` product, `ENG` engineering, `DATA` data/connector, `ML` matching/AI, `SEC` security, `OPS` operations, `GTM` go-to-market, and `MEAS` measurement.
- **Definition of done:** acceptance criteria are met, tests or evidence are attached, operational ownership is assigned, and known limitations are recorded.
- **Dependency notation:** an issue may not be marked complete until the listed issue IDs are complete or explicitly waived by the milestone owner.
- **No silent scope expansion:** new connectors, sensitive attributes, recruiter functionality, or automatic application behavior require a new decision issue and a compliance review.

## Milestone summary

| ID | Milestone | Outcome | Gate | Target exit evidence |
|---|---|---|---|---|
| M0 | Commercial, rights, and product decisions | JobMatch can be pursued lawfully and the MVP contract is unambiguous | 0 | Signed/recorded decisions, source-rights register, privacy/DPIA plan, `My-Job` schema |
| M1 | Platform and delivery foundation | A deployable JobMatch shell is integrated with the platform | 1 | Staging deployment, SSO, CI, database, observability, baseline security |
| M2 | Candidate profile and CV pipeline | A candidate can safely create and correct a versioned profile | 1–2 | Tested upload, extraction, structured profile, confirmation, deletion |
| M3 | Authorized job ingestion MVP | One reliable, rights-cleared source produces fresh normalized jobs | 1–2 | Connector agreement, sync metrics, provenance, deduplication, freshness checks |
| M4 | Search and deterministic eligibility | Candidates can discover explainable, clearly eligible jobs | 2 | Hard-filter reasons, search UI, freshness and duplicate-quality thresholds |
| M5 | Explainable matching beta | Shortlisted jobs receive evidence-linked, bounded evaluations | 2 | Offline evaluation set, score schema, prompt/model versioning, cost controls |
| M6 | Candidate workflow and `My-Job` export | Users can act on matches and retain a portable tracking artifact | 2 | Save/reject/apply flow, deterministic export, import/export tests, audit events |
| M7 | Concierge beta and relevance validation | Real candidates demonstrate usefulness and trust | 2 | Activated-user cohort, top-five relevance results, feedback and support loop |
| M8 | Belgian source and language expansion | Flanders, Brussels, and Wallonia coverage is added responsibly | 3 | One approved source per region or documented alternative, multilingual quality report |
| M9 | Production readiness and privacy operations | The service can operate safely at pilot scale | 3 | DPIA decision, deletion/access workflows, incident runbook, load and recovery evidence |
| M10 | B2C monetization | Paid candidate value and unit economics are validated | 4 | Billing, entitlements, paid pilot, conversion/retention/cost dashboard |
| M11 | Institutional and partner pilots | Organizations can use JobMatch under controlled agreements | 4 | Pilot contracts, consent model, tenant isolation, partner outcome report |
| M12 | Recruiter product readiness | A compliant, human-supervised B2B product is ready for a limited launch decision | 5 | AI Act/legal review, recruiter controls, bias/performance audit, go/no-go decision |

## M0 — Commercial, rights, and product decisions

**Objective:** Remove the blockers that cannot be solved by engineering and define what the MVP is allowed to do.

**Exit criteria:** The commercial license or relicense path is documented; source permissions are recorded for the launch source; the controller/processor model and retention assumptions have legal owners; and the `My-Job` contract is approved.

### Related issues

- **JM-001 [P0][LEGAL] Resolve commercial licensing for the platform.** Identify the relevant copyright holders and dependencies, obtain written commercial permission or approve a relicensing plan, and record permitted deployment and modification rights.
- **JM-002 [P0][DEC] Confirm JobMatch ownership and operating entity.** Decide who owns the product, customer contracts, source agreements, data, models, and incident obligations.
- **JM-003 [P0][DATA] Create the source-rights register.** Record source owner, access method, agreement, permitted fields, commercial reuse, attribution, rate limits, retention, geographic limits, and termination contact.
- **JM-004 [P0][DATA] Assess launch sources and select the first authorized connector.** Compare official APIs, licensed feeds, employer feeds, and open-data options; document rejected sources and reasons.
- **JM-005 [P0][LEGAL] Obtain privacy and AI Act classification advice.** Assess candidate-side recommendations, future recruiter ranking, Article 22 implications, special-category data, DPIA requirements, and human oversight.
- **JM-006 [P0][DEC] Approve MVP scope and non-goals.** Explicitly exclude automatic applications, employer rejection, pay-to-rank behavior, CV resale, unapproved scraping, and sensitive-attribute inference.
- **JM-007 [P0][PROD] Define the `My-Job` schema and ownership model.** Approve CSV as the first format, column types, stable job identity, export version, status vocabulary, conflict behavior, and local/cloud roadmap.
- **JM-008 [P1][LEGAL] Draft candidate terms, privacy notice, consent language, and source attribution text.** Cover CV processing, model providers, retention, deletion, user correction, feedback, and original application links.
- **JM-009 [P1][MEAS] Define the KPI dictionary and gate thresholds.** Specify activation, precision@5, freshness, duplicate rate, parsing confirmation, cost per evaluation, retention, conversion, and incident thresholds.

## M1 — Platform and delivery foundation

**Objective:** Establish a secure, observable application boundary using existing ASafarIM conventions.

**Dependencies:** JM-001, JM-002, JM-006.

**Exit criteria:** A staging deployment is reachable through the approved platform path; authenticated users can access an isolated JobMatch workspace; CI runs quality checks; secrets are externalized; and critical errors and queue health are observable without logging CV contents.

### Related issues

- **JM-010 [P0][ENG] Scaffold the JobMatch Next.js application.** Add the app entry points, scripts, environment contract, shared UI integration, error/loading states, and initial route structure.
- **JM-011 [P0][ENG] Register JobMatch in shared authentication and URL systems.** Add the app to the platform registry, SSO configuration, callback URLs, navigation, and authorization boundaries.
- **JM-012 [P0][ENG] Provision the dedicated PostgreSQL database and Prisma schema baseline.** Configure migrations, least-privilege credentials, backups, and an opaque authenticated user ID without duplicating the platform user table.
- **JM-013 [P0][ENG] Define environment and secret management.** Separate local, staging, and production configuration; validate required variables at startup; and prevent secrets from entering logs or client bundles.
- **JM-014 [P1][ENG] Establish CI checks and test harnesses.** Add unit, integration, end-to-end, accessibility, migration, and type/lint/build checks appropriate to the repository.
- **JM-015 [P1][OPS] Add baseline observability.** Instrument request errors, queue latency, connector runs, evaluation cost, freshness, and storage events with redaction and retention controls.
- **JM-016 [P1][SEC] Perform threat modeling and dependency/security baseline.** Cover upload handling, signed URLs, IDOR, prompt injection, webhook abuse, SSRF, rate limiting, and dependency scanning.

## M2 — Candidate profile and CV pipeline

**Objective:** Let a candidate create a useful, editable, versioned profile without turning the CV into an uncontrolled source of sensitive data.

**Dependencies:** M1; JM-005, JM-008.

**Exit criteria:** Supported files are validated and malware-scanned, originals are private, extracted data is schema-valid, users can correct it before matching, profile versions are immutable, and deletion removes derived artifacts within the documented SLA.

### Related issues

- **JM-017 [P0][ENG] Implement private candidate-document storage.** Add MIME and size validation, private buckets, encryption, short-lived signed URLs, ownership checks, retention metadata, and deletion hooks.
- **JM-018 [P0][SEC] Integrate malware scanning and quarantine.** Reject or quarantine unsafe files, record scan outcomes, and ensure untrusted documents never reach parsers or models before approval.
- **JM-019 [P0][ENG] Build text extraction and OCR workers.** Prefer local extraction, isolate OCR workloads, handle malformed documents, and expose retryable job states.
- **JM-020 [P0][ML] Define the candidate profile schema and extraction contract.** Include skills, roles, experience, languages, location, work authorization, preferences, certifications, salary expectations, confidence, and provenance; explicitly exclude protected-attribute inference.
- **JM-021 [P0][PROD] Build profile review and correction UI.** Display extracted facts and uncertainty, require confirmation before matching, allow manual profile creation, and explain how corrections affect results.
- **JM-022 [P1][ENG] Implement immutable profile versions.** Store source document hash, parser/model/prompt versions, confirmed edits, timestamps, and a reproducible version reference.
- **JM-023 [P1][SEC] Implement candidate data rights workflows.** Support access, correction, export, deletion, consent withdrawal, and account closure with auditability and no raw CV logging.
- **JM-024 [P1][MEAS] Create multilingual CV parsing fixtures.** Build consented or synthetic Dutch, French, and English documents covering tables, scans, abbreviations, missing fields, and mixed-language content.

## M3 — Authorized job ingestion MVP

**Objective:** Build a source-transparent ingestion pipeline that is reliable enough for candidate testing.

**Dependencies:** M1; JM-003, JM-004.

**Exit criteria:** The first connector runs within its agreement, stores raw snapshots with controlled retention, normalizes required fields, preserves provenance, detects duplicates, and exposes freshness and failure metrics.

### Related issues

- **JM-025 [P0][DATA] Implement the connector interface and source configuration model.** Require external ID, canonical URL, employer, title, description, location, language, contract, salary, skills, dates, attribution, agreement reference, and capture time.
- **JM-026 [P0][DATA] Implement the first approved source connector.** Support initial sync, incremental sync, pagination, retries, conditional requests, rate limits, backoff, and connector shutdown.
- **JM-027 [P0][DATA] Store raw snapshots and normalized postings separately.** Hash content, retain source payloads only as long as justified, and make normalization reproducible.
- **JM-028 [P0][DATA] Implement canonicalization and deduplication.** Use source ID, URL, employer/title/location, description hash, and dates; retain links between duplicate records and select a display representative.
- **JM-029 [P1][DATA] Implement freshness and expiry processing.** Track first seen, last seen, publication, expiry, source update, and verification status; label or hide stale listings.
- **JM-030 [P1][SEC] Add connector security controls.** Validate outbound destinations, prevent SSRF, isolate browser or parser workers, redact secrets, and prohibit proxy rotation used to bypass controls.
- **JM-031 [P1][MEAS] Add ingestion quality dashboards and alerts.** Monitor sync success, records added/updated/expired, duplicates, parse failures, latency, rate-limit responses, and agreement expiry.
- **JM-032 [P2][DATA] Build an operator replay and quarantine workflow.** Allow a failed snapshot or normalization version to be reprocessed safely without duplicating postings.

## M4 — Search and deterministic eligibility

**Objective:** Give candidates a fast inventory view where hard exclusions are predictable and explainable.

**Dependencies:** M2, M3.

**Exit criteria:** Users can search and filter normalized jobs; hard exclusions produce user-understandable reasons; expired or unauthorized records are not displayed; and results preserve source attribution.

### Related issues

- **JM-033 [P0][ENG] Implement deterministic eligibility rules.** Cover language, certification, work authorization, location/remote, salary floor, contract, seniority, mandatory technology, expiry, and opt-outs.
- **JM-034 [P0][ENG] Persist filter decisions and reason codes.** Make each exclusion explainable, version rules, distinguish missing data from failed requirements, and avoid implying certainty when data is incomplete.
- **JM-035 [P1][ENG] Build candidate search and results UI.** Add filters, sorting, pagination, source labels, freshness labels, original application links, and accessible empty/error states.
- **JM-036 [P1][DATA] Normalize multilingual fields and controlled vocabularies.** Define language, location, contract, seniority, salary, skill aliases, and employer identity rules without erasing original text.
- **JM-037 [P1][SEC] Add authorization, rate limits, and abuse controls to search.** Protect candidate data and prevent bulk extraction of job or profile information.
- **JM-038 [P1][MEAS] Establish search-quality fixtures and thresholds.** Test boundary cases, missing fields, multilingual synonyms, duplicates, expiry, and source attribution.

## M5 — Explainable matching beta

**Objective:** Produce useful recommendations while keeping deterministic filtering, evidence, uncertainty, and model limits visible.

**Dependencies:** M2, M4; JM-005, JM-020, JM-024.

**Exit criteria:** An offline evaluation set meets an agreed precision/relevance threshold across supported languages; every score has evidence and model/prompt versions; prompt injection tests pass; and per-user cost is metered and bounded.

### Related issues

- **JM-039 [P0][ML] Define the matching feature contract.** Specify suitability score, confidence, matching skills, missing skills, uncertain requirements, evidence, explanation, recommended action, and schema validation.
- **JM-040 [P0][ML] Implement privacy-preserving embedding inputs.** Remove names, contact details, addresses, photographs, and unnecessary identifiers while retaining relevant professional facts.
- **JM-041 [P0][ML] Implement embedding generation and content-hash caching.** Version embedding models, batch jobs, retry failures, and invalidate only changed content.
- **JM-042 [P0][ML] Implement shortlist ranking after hard filters.** Combine explicit preferences and vector similarity without presenting similarity as hiring probability.
- **JM-043 [P0][ML] Implement structured LLM evaluation.** Use provider adapters, schema validation, bounded scores, explicit unknowns, evidence links, and asynchronous queue processing.
- **JM-044 [P0][SEC] Test prompt-injection and untrusted-job-content isolation.** Ensure job text cannot alter system instructions, reveal candidate data, invoke tools, or change scoring rules.
- **JM-045 [P1][ML] Build a versioned offline evaluation set.** Include positive, negative, borderline, multilingual, sparse-CV, stale-job, and missing-requirement examples with human judgments.
- **JM-046 [P1][ML] Add bias and consistency evaluation.** Compare language, formatting, career-gap, seniority, and missing-data effects; do not use protected attributes for ranking.
- **JM-047 [P1][OPS] Add model, prompt, evaluation, and budget controls.** Store versions, cache by profile/job/prompt/model, configure model cascades, enforce quotas, and support honest degraded mode.
- **JM-048 [P2][PROD] Design evidence-linked explanation presentation.** Let users inspect the CV fact and job requirement supporting each explanation and report incorrect evidence.

## M6 — Candidate workflow and `My-Job` export

**Objective:** Turn recommendations into a controlled job-search workflow and a durable user-owned artifact.

**Dependencies:** M5; JM-007.

**Exit criteria:** A candidate can save, reject, mark applied, record follow-ups, open the original source, and download a deterministic export without silent local-file overwrites.

### Related issues

- **JM-049 [P0][PROD] Define saved, rejected, and application state transitions.** Specify idempotency, timestamps, user notes, source changes, and behavior when a job expires or is deduplicated.
- **JM-050 [P0][ENG] Implement saved-job and application records.** Enforce user ownership, unique identities, audit events, optimistic updates, and safe retries.
- **JM-051 [P0][ENG] Implement deterministic `My-Job` CSV export.** Version headers and formatting, escape values safely, include provenance and score versions, and test fixed fixtures.
- **JM-052 [P1][PROD] Build tracking and export UI.** Support status, notes, applied/interview/follow-up dates, export preview, and clear download behavior.
- **JM-053 [P1][ENG] Add export security and privacy controls.** Prevent formula injection, unauthorized downloads, accidental sensitive fields, and cross-user access.
- **JM-054 [P1][MEAS] Instrument workflow conversion events.** Measure viewed, saved, rejected, application-started, export-created, feedback-submitted, and failure events without raw document content.
- **JM-055 [P2][ENG] Specify future import and cloud-sync contracts.** Document conflict resolution and consent requirements without implementing silent synchronization in the MVP.

## M7 — Concierge beta and relevance validation

**Objective:** Validate that real candidates trust the product and take better actions, rather than merely generating scores.

**Dependencies:** M6; JM-009, JM-045.

**Exit criteria:** A defined cohort reaches activation; top-five relevance and explanation-trust targets are measured; support findings are converted to backlog issues; and a go/no-go decision is recorded for broader beta.

### Related issues

- **JM-056 [P0][GTM] Recruit and consent the first candidate cohort.** Define inclusion criteria, incentives, consent, feedback cadence, and support ownership across Dutch, French, and English users.
- **JM-057 [P0][PROD] Run concierge onboarding sessions.** Observe parsing corrections, essential filters, explanation trust, and whether recommendations lead to saves or application starts.
- **JM-058 [P0][MEAS] Run top-five relevance and calibration study.** Collect human judgments, precision@5, score calibration, false-positive/false-negative examples, and language breakdowns.
- **JM-059 [P1][PROD] Implement relevance feedback and correction reporting.** Allow users to say why a match is unsuitable and connect feedback to profile, source, rule, or model improvements.
- **JM-060 [P1][GTM] Create multilingual onboarding and support content.** Explain privacy, scores, limitations, source links, and candidate control in Dutch, French, and English.
- **JM-061 [P1][MEAS] Publish the beta decision report.** Compare gate thresholds, quality by language/role/source, cost per activated user, retention, incidents, and prioritized next steps.

## M8 — Belgian source and language expansion

**Objective:** Add regional breadth only after the ingestion and quality controls are proven.

**Dependencies:** M7; each connector requires JM-003 and a source-specific approval.

**Exit criteria:** At least one rights-cleared source is operational for each intended region, or a documented coverage decision explains the alternative; multilingual quality is measured; and regional source failures do not take down the product.

### Related issues

- **JM-062 [P0][DATA] Complete VDAB access and partnership decision.** Obtain approved access or document an alternative Flanders source, fields, limits, attribution, and launch impact.
- **JM-063 [P0][DATA] Assess and onboard an approved Brussels source.** Evaluate Actiris, employer, partner, or licensed options and implement only after rights review.
- **JM-064 [P0][DATA] Assess and onboard an approved Wallonia source.** Evaluate Le Forem, employer, partner, or licensed options and implement only after rights review.
- **JM-065 [P1][DATA] Add one private consultancy or employer partner feed.** Use a written pilot agreement, field mapping, freshness SLA, attribution, and termination process.
- **JM-066 [P1][ML] Expand multilingual normalization and evaluation.** Test Dutch/French/English titles, skills, requirements, salary formats, and explanations with language-specific quality gates.
- **JM-067 [P1][MEAS] Compare regional coverage and source quality.** Report activated-user relevance, freshness, duplicates, missing-field rates, and connector cost by region.
- **JM-068 [P2][DATA] Add connector contract-test fixtures.** Detect upstream schema changes, field loss, encoding errors, pagination regressions, and unexpected volume changes.

## M9 — Production readiness and privacy operations

**Objective:** Make the candidate beta safe, supportable, recoverable, and economically observable.

**Dependencies:** M7, M8; JM-005, JM-016, JM-023.

**Exit criteria:** Privacy and security controls are exercised end to end; production recovery is tested; operational runbooks exist; and launch owners have accepted residual risk.

### Related issues

- **JM-069 [P0][LEGAL] Complete DPIA and processing-register review.** Record purposes, data flows, processors, transfers, retention, residual risks, mitigations, and review dates.
- **JM-070 [P0][SEC] Conduct application and infrastructure security testing.** Test access control, uploads, storage, APIs, queues, SSRF, injection, rate limits, logs, and dependency vulnerabilities.
- **JM-071 [P0][OPS] Implement backup, restore, disaster recovery, and deletion verification.** Test database restore, object cleanup, queue recovery, RPO/RTO, and evidence generation.
- **JM-072 [P0][OPS] Create incident response and source takedown runbooks.** Cover data breach, unsafe CV, provider outage, unauthorized source complaint, stale jobs, and model safety incidents.
- **JM-073 [P1][ENG] Harden production deployment and access.** Apply least privilege, network boundaries, secure headers, secret rotation, admin MFA, and separate worker permissions.
- **JM-074 [P1][OPS] Establish retention and data-quality jobs.** Expire raw snapshots, delete orphaned artifacts, remove stale postings, and alert on failed scheduled jobs.
- **JM-075 [P1][MEAS] Build the launch scorecard.** Combine quality, activation, retention, cost, availability, source, privacy, and security metrics with accountable owners.

## M10 — B2C monetization

**Objective:** Validate willingness to pay without degrading candidate trust or allowing paid ranking influence.

**Dependencies:** M9; M7 decision report.

**Exit criteria:** Pricing and entitlements are tested with a small paid cohort; billing is recoverable; usage is metered; cancellations and refunds work; and contribution margin is reported by plan.

### Related issues

- **JM-076 [P0][PROD] Define free and Pro entitlements.** Set profile, refresh, deep-evaluation, export, and career-tool limits with clear user-facing explanations.
- **JM-077 [P0][ENG] Implement subscription billing and entitlement enforcement.** Handle checkout, webhooks, retries, cancellation, refunds, plan changes, and webhook signature verification.
- **JM-078 [P0][OPS] Add AI and infrastructure cost metering.** Attribute embedding, evaluation, OCR, storage, and worker costs to usage and plan without exposing provider secrets.
- **JM-079 [P1][PROD] Build one-time career product workflow.** Start with one bounded product, disclose AI assistance, require user review, and avoid employment guarantees.
- **JM-080 [P1][GTM] Run pricing and paid-pilot experiments.** Test price points, packaging, messaging, activation-to-paid conversion, retention, refunds, and qualitative objections.
- **JM-081 [P1][MEAS] Report unit economics and monetization gate.** Track revenue, variable cost, gross margin, CAC, payback, conversion, retention, and support burden.

## M11 — Institutional and partner pilots

**Objective:** Prove controlled distribution and institutional value before exposing candidate data to broader B2B workflows.

**Dependencies:** M9, M10; JM-002, JM-005, JM-008.

**Exit criteria:** Pilot partners have signed agreements, candidate consent and data boundaries are tested, tenant access is isolated, and an outcome report supports continuation or termination.

### Related issues

- **JM-082 [P0][LEGAL] Define institutional pilot contract and data-processing terms.** Cover roles, permitted purposes, data fields, retention, subprocessors, security, support, and exit/export.
- **JM-083 [P0][ENG] Implement tenant and partner access boundaries.** Prevent cross-organization data access and make every partner action auditable.
- **JM-084 [P0][PROD] Build candidate consent and visibility controls.** Let candidates understand which institution can see what, revoke consent, and export or delete their data.
- **JM-085 [P1][GTM] Run university, outplacement, or reskilling pilot.** Define cohort, success metrics, onboarding, support, and a fixed end date.
- **JM-086 [P1][MEAS] Produce partner outcome and ROI report.** Measure activation, relevance, application starts, completion, satisfaction, operational cost, and data incidents.

## M12 — Recruiter product readiness

**Objective:** Decide whether a recruiter-facing product can launch without turning JobMatch into an opaque or unlawful employment decision system.

**Dependencies:** M9, M11; JM-005, JM-046, JM-069, JM-070.

**Exit criteria:** Legal classification and obligations are documented; recruiter users cannot silently automate rejection; candidate consent and visibility are operational; bias/performance evidence is reviewed; and an explicit launch or defer decision is approved.

### Related issues

- **JM-087 [P0][LEGAL] Complete recruiter-use AI Act and employment-law review.** Confirm classification, provider/deployer obligations, documentation, logging, human oversight, monitoring, and Belgian intermediary obligations.
- **JM-088 [P0][PROD] Define recruiter human-oversight and contestability workflow.** Require review, prohibit sole reliance for rejection, expose evidence and uncertainty, and record overrides and appeals.
- **JM-089 [P0][ENG] Implement candidate opt-in discovery and contact controls.** Support consent scope, visibility, withdrawal, controlled messaging, block/report, and audit trails.
- **JM-090 [P0][ML] Run pre-launch bias and performance audit.** Evaluate false positives/negatives, language, missing data, seniority, career gaps, role families, and source effects using an approved methodology.
- **JM-091 [P1][PROD] Build recruiter workspace and audit views.** Show provenance, score version, explanation, uncertainty, model limitations, reviewer identity, and action history.
- **JM-092 [P1][SEC] Perform recruiter-specific abuse and isolation testing.** Test bulk export, inference of hidden attributes, unauthorized contact, tenant escape, prompt injection, and privilege escalation.
- **JM-093 [P0][DEC] Hold the recruiter go/no-go review.** Approve launch, limited pilot, remediation, or permanent deferral based on legal, quality, consent, safety, and economics evidence.

## Cross-milestone issue standards

Every implementation issue should include:

- **Problem and user/business outcome**
- **Scope and explicit non-scope**
- **Dependencies and owner**
- **Acceptance criteria**
- **Test/evidence plan**
- **Privacy, security, source-rights, and accessibility impact**
- **Telemetry and rollback plan**
- **Open decisions and residual risks**

The backlog should be reviewed at each gate. A failed gate creates remediation issues rather than being reclassified as complete. In particular, poor relevance, unresolved data rights, unsupported multilingual quality, unsafe model behavior, or uncontrolled AI cost are reasons to pause expansion—not reasons to lower the acceptance threshold.

---

# Investment Conclusion

JobMatch has a credible opportunity if it is built as a **candidate-controlled relevance and decision-support product**, not as an unlicensed scraping operation or autonomous hiring engine.

The strongest initial strategy is to:

1. start with Belgium's multilingual technology and specialized-profession market;
2. use official and licensed data sources before browser collection;
3. treat CVs as highly sensitive personal data;
4. build explainability and compliance into the matching model from the start;
5. launch B2C before B2B;
6. make `My-Job` a reliable workflow artifact, beginning with deterministic export;
7. use the ASafarIM Platform for SSO, UI, storage, workers, and deployment; and
8. obtain commercial licensing before presenting the current repository as a commercial product.

The immediate decision is whether source rights, commercial licensing, the `My-Job` contract, and the privacy posture can be secured well enough to justify a focused candidate beta.

## External reference sources

- [Statbel — Job vacancy, Q1 2026](https://statbel.fgov.be/en/themes/work-training/labour-market/job-vacancy)
- [VDAB — Vacancy API access](https://extranet.vdab.be/api-center-excellence-coe/vacatures-ophalen-met-de-vacatures-api)
- [VDAB — Shortage occupations 2026](https://www.vdab.be/trends-en-cijfers/knelpuntberoepenlijst)
- [Le Forem — APIs](https://www.leforem.be/partenaires/api.html)
- [European Commission AI Act Service Desk — Employment](https://ai-act-service-desk.ec.europa.eu/en/employment-0)
- [EUR-Lex — GDPR Article 22](https://eur-lex.europa.eu/eli/reg/2016/679/art_22/oj/eng)
- [Belgian Data Protection Authority — Recruitment of candidates](https://www.gegevensbeschermingsautoriteit.be/burger/thema-s/privacy-op-de-werkplek/aanwerving-van-kandidaten)
