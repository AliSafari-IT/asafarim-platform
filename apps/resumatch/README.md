# ResuMatch

An AI CV-tailoring tool: point it at the job you want to apply to — by URL,
pasted posting text or job-invitation email, a PDF/DOCX of the posting, or a
manual entry form — and AI rewords and reprioritizes your confirmed profile
toward it, optimizing for both the recruiter skimming it and the ATS
(applicant tracking system) matching its keywords, while never inventing an
employer, a date, a degree, or a skill you did not list. It can also draft a
cover letter under the same no-fabrication contract, and the applications
list tracks each job from saved to offer/rejected. Download results as PDF
via the browser's own print dialog or as DOCX. Runs at
`resumatch.asafarim.com`, port 3012 in local development.

ResuMatch only ever looks at the one posting a candidate explicitly
provides — no job-board aggregation — which needs no job-board licensing at
all. See
[`docs/business-plan.md`](docs/business-plan.md) for the milestone sequence
and [`docs/threat-model.md`](docs/threat-model.md) for what the tailoring
flow does and does not defend against.

## Showcase-only MVP

ResuMatch is an experimental portfolio/showcase MVP, not a professional
career, recruiting, HR, legal, or compliance service. The rewritten CV it
produces is yours to review before you use it for anything — it must not be
treated as a final document without reading it. Results may be incomplete,
inaccurate, stale, or unavailable, and the deployed instance provides no
professional support, accuracy guarantee, uptime guarantee, or service
continuity promise.

Do not upload sensitive information that is unnecessary for evaluating the
showcase. The public deployment is subject to the repository's
[`LICENSE`](../../LICENSE). JM-001 (issue #205) is **decided**: the instance
runs strictly as a non-commercial portfolio showcase operated by the
Licensor, with a showcase disclosure shown before CV upload. See
[`docs/jm-001-licensing-decision.md`](docs/jm-001-licensing-decision.md) for
the decision record, dependency/license inventory, and permissions register
— including a short note on why the job-board licensing constraint that
originally motivated it no longer applies.

## What ships today

- **Candidate profile & CV pipeline** — private document storage with
  byte-level type sniffing, a 10 MB cap, and 90-day retention; malware
  scanning as a hard gate (the production compose stack runs a ClamAV
  sidecar at `RESUMATCH_SCANNER_URL`, and uploads quarantine by design
  whenever no scanner answers — a fail-closed posture); deterministic
  PDF/Word/text extraction with an optional AI pass wired into
  upload/rescan that degrades back to deterministic on any failure; a
  profile contract with no field for any protected attribute; full CRUD
  for every section with inline editing and manual entry; an AI
  tone-rewrite for the Summary field; immutable, lineage-linked profile
  versions; and one-click GDPR access + erasure covering every model that
  holds personal data, including tailored resumes, cover letters, and
  fetched job pages.
- **Job details, five ways in** — paste a URL (fetched under an
  SSRF-resistant posture: public HTTPS only, no-redirect, size-capped,
  timeout-bounded; with a real provider configured the fetch goes through
  the model's browsing instead, degrading to the raw fetch on failure),
  paste the posting text, paste a job-invitation email, upload the posting
  as PDF/DOCX, or fill in a manual entry form. Every path lands on the
  same extracted title/employer/snippet confirmation before anything else
  happens.
- **AI CV tailoring** — a fence-sentinel prompt (the job text, the profile
  text, and any per-run instructions are DATA, never instructions) asks a
  model for an ATS-aware rewrite: a role-targeted headline, a 2–4 sentence
  summary mapped onto the posting's stated priorities, the candidate's own
  skills reordered job-relevant-first, and per-experience bullets that
  weave the posting's terminology in only where the underlying fact is
  real. The persisted content is built in code, not trusted from model
  output: `mergeTailoringSuggestions` copies employer/dates/`isCurrent`
  and all of education/certifications straight from the confirmed profile,
  and drops any suggested skill name that isn't already in it — so a model
  response has no path to fabricate a fact. Generation is proposal-review,
  not one-shot: `generate-preview` returns a draft to read and edit,
  `generate-confirm` persists it. The preview carries a deterministic
  keyword-coverage report and quality checklist, and the flow accepts
  freeform per-run instructions ("emphasize my backend work") as a third
  fenced input — bounded by the same char caps and merge, which can't be
  instructed into fabricating. `RESUMATCH_AI_PROVIDER=fixture` (the
  default everywhere) is deterministic and free; `openai`/`anthropic` are
  real adapters behind the same JM-005 sign-off gate the prior product
  used.
- **AI cover letters** — a second fenced call drafts a letter from the
  same confirmed inputs under the same no-fabrication contract and merge
  discipline, with tone and length controls, the same preview/confirm
  review before anything is saved, and its own deterministic quality
  checks.
- **Export, history, diff** — `app/tailor/[id]/preview/` renders the
  tailored content inside a `@media print` stylesheet (Download PDF calls
  `window.print()`), and both resume and letter have DOCX download routes
  generated from the same content source — the "print and DOCX can never
  diverge" guarantee. `app/tailor/history` lists every tailored run with a
  side-by-side compare. `TailoredResume.templateKey` already exists as a
  field, so more layouts stay additive.
- **Application tracking** — `app/applications` tracks each job through
  saved → applied → interviewing → offer/rejected with a multi-step status
  indicator, optional notes, and a link back to the tailored resume used.

AI-call audit events surface in the platform admin console.

## What was removed in the pivot

Everything tied to aggregating and matching against external job postings:
the authorized-source ingestion pipeline (`JobSource`/`JobSnapshot`/
`JobPosting`/`IngestionRun`), deterministic eligibility filtering and search,
the tracked-job workflow and its CSV export, embedding-based ranking, and
the structured match-evaluation pipeline (`MatchResult`/`MatchRun`). None of
it shipped a live model call or a connected job source before the pivot —
see `docs/business-plan.md` for the full milestone-by-milestone account of
what existed and why it was cut.

## Where a fuller version could go

The two hard constraints — no fabricated facts, no job-board licensing —
leave room to grow; the in-app `/roadmap` page tracks the live sequence.
What follows is a direction sketch, not a commitment.

- **More print templates** — `TailoredResume.templateKey` already exists,
  so additional `@media print` layouts are additive, no pipeline change.
- **Richer application tracking** — reminders, follow-up dates, and
  interview notes layered onto the status list.
- **Production readiness & privacy operations** — a DPIA for the
  AI-tailoring flow specifically (job text and rewritten resume both pass
  through a model call), an incident runbook, and load/recovery evidence —
  the bar for operating at pilot scale.

Deliberately out of scope: job-board aggregation and resume-based job
search (the licensing dependency that killed the prior product), mock
interviews/video tooling (a different product surface), and any feature
whose output could put words in the candidate's history that they didn't
confirm.

## Local development

```bash
docker compose up -d resumatch-postgres
```

```bash
pnpm --filter @asafarim/resumatch db:migrate
```

```bash
pnpm --filter @asafarim/resumatch dev
```

Then open <http://localhost:3012>. `/workspace` redirects to Hub's sign-in
(run `pnpm --filter @asafarim/hub dev` too) and comes back with a workspace
created on first visit.

```bash
pnpm --filter @asafarim/resumatch test
```

## Environment

| Variable | Required in | Notes |
|---|---|---|
| `RESUMATCH_DATABASE_URL` | staging, production | No fallback to the platform `DATABASE_URL` — a missing value fails startup rather than silently using the identity database. Local development defaults to `localhost:55437`. |
| `RESUMATCH_SHADOW_DATABASE_URL` | CI only | Throwaway database for the migration drift check. |
| `RESUMATCH_ENVIRONMENT` | staging, production | `staging` there, `production` in prod; it decides whether secrets may be defaulted. |
| `NEXT_PUBLIC_RESUMATCH_URL` | all deployments | Inlined at build time; also an allowed SSO callback origin. |
| `NEXT_PUBLIC_HUB_URL` | all deployments | Where unauthenticated visitors are sent to sign in. |
| `RESUMATCH_SCANNER_URL` | when a scanner is deployed | Scanner endpoint selected by the developer. The production compose stack wires this to a ClamAV sidecar (`tcp://clamav:3310`); anywhere it's unset, every upload quarantines — a fail-closed default. |
| `RESUMATCH_SCANNER` | local only | Set to the exact literal `insecure-accept-all` to run the pipeline without a scanner. Refused on any deployed environment, and it names itself on every document it clears. |
| `RESUMATCH_RETENTION_TOKEN` | production | Bearer token for `POST /api/retention`, which sweeps documents past their 90-day window. Unset disables the route entirely (404) rather than leaving it open. Drive it from a scheduler. |
| `STORAGE_*` | production | S3-compatible object storage for uploaded CVs. Without it, `@asafarim/storage` falls back to `.local-storage/` on disk, which is fine locally and not fine anywhere else. |
| `REDIS_URL` | worker (all environments) | The platform's shared Redis instance (same variable Vionto's and AppBuilder's workers read — not a ResuMatch-specific `RESUMATCH_REDIS_URL`). Required to start `worker/index.ts`; see [worker/](#worker) below. |
| `RESUMATCH_AI_PROVIDER` | none — default `fixture` everywhere | Model backend for every AI call kind — CV extraction, tailoring, cover letter, job-URL browsing, and Summary rewrite (JM-005). `openai`/`anthropic` are accepted in staging/production only once `RESUMATCH_AI_CLASSIFICATION_SIGNED_OFF=true` **and** the matching API key is set; otherwise startup refuses, naming the gate variable, never a value. Local dev may flip this freely. |
| `RESUMATCH_AI_CLASSIFICATION_SIGNED_OFF` | staging, production (only if a real provider is selected) | JM-005 gate. Flipping this is a config-only change — no code edit. |
| `OPENAI_API_KEY` / `ANTHROPIC_API_KEY` | staging, production (only if the matching provider is selected) | Shared platform keys (see root `.env.example`). Unused while `RESUMATCH_AI_PROVIDER` stays `fixture`. |
| `RESUMATCH_AI_MONTHLY_BUDGET_USD` | none — default `20` | Monthly spend ceiling in USD shared across all provider-call kinds (`tailor`, `extract`, `rewrite`, `fetch_job`, `cover_letter`). `0` freezes AI spend entirely. |

## Worker

`apps/resumatch/worker/` is a standalone BullMQ process, mirroring
`apps/tasks-ai/worker/`. It carries only generic maintenance today (a
health-ping heartbeat and a noop job proving the enqueue → process →
complete loop) — the pivot removed the embedding/match-evaluation queues
the prior product's worker was building toward.

```bash
pnpm --filter @asafarim/resumatch worker:dev    # tsx watch, picked up by `pnpm dev` via turbo
pnpm --filter @asafarim/resumatch worker:start  # production entrypoint
```

- `resumatch.maintenance` queue: a `health-ping` job (60s heartbeat, logs
  Redis + database liveness) and a `noop` job.
- Uses the same isolated Prisma client (`lib/db/generated`) and redacting
  logger (`lib/observability/logger.ts`) as the Next.js app.

Production additionally needs `RESUMATCH_DB_PASSWORD` and its URL-encoded
form `RESUMATCH_DB_PASSWORD_URL` in `.env.production`, following the same
convention as AppBuilder and Testora.

## Why a separate database

CV-derived and AI-tailored resume data needs a stricter access boundary
than identity traffic. Mixing that into the shared platform Postgres would
put this app's load onto identity transactions. The full rationale is in
the business plan under "Database recommendation".

ResuMatch's Prisma client is generated into `lib/db/generated` rather than
`node_modules/@prisma/client`, because pnpm symlinks that path to the shared
store where the *platform* client lives. Both clients coexist in one process
only because of that split.
