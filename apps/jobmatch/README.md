# JobMatch

An explainable, source-transparent job-search assistant: fewer vacancies,
each with the reason it fits. Runs at `jobmatch.asafarim.com`, port 3012 in
local development.

**Status: M1 — platform and delivery foundation.** There is no job source,
no CV upload, and no matching. What exists is the boundary the rest gets
built inside. See [`docs/business-plan.md`](docs/business-plan.md) for the
milestone sequence and [`docs/threat-model.md`](docs/threat-model.md) for
what M1 does and does not defend against.

## What M3 delivers

- A source model that will not sync without a recorded, unexpired agreement
  reference. No source ships enabled.
- Raw snapshots stored before parsing, so a normalization fix is replayed
  against the original bytes rather than needing a re-fetch.
- Deduplication across sources, with the copy a candidate sees chosen by
  authority and reuse rights rather than by arrival order.
- Freshness from four separate dates, including postings that vanish from a
  feed without ever being marked expired.
- SSRF-resistant fetching: public HTTPS only, no redirects followed, size and
  time bounded, conditional requests, and agreed rate limits obeyed.
- Every sync attempt recorded, refusals included, and surfaced at `/sources`.

## What M2 delivers

- Private document storage with byte-level type sniffing, a 10 MB cap, and
  90-day retention. Filenames never build storage keys.
- Malware scanning as a hard gate: nothing reaches a parser without a clean
  verdict, and an unavailable scanner quarantines rather than waving through.
- Local text extraction for PDF, Word, and plain text, with a bounded retry
  budget and reason codes a candidate can act on.
- A profile contract with no field for any protected attribute, so age,
  nationality, and gender have nowhere to land.
- Immutable, lineage-linked profile versions. Matching reads only a version
  the candidate has confirmed.
- GDPR access and erasure as one-click actions, with erasure removing
  derived data, not just the original file.

## What M1 delivered

- A deployable Next.js app registered in the platform registry, app
  switcher, Caddy routing, and the production compose stack.
- Shared sign-in through Hub. JobMatch reads the platform session and never
  stores a credential of its own.
- Its own PostgreSQL instance (pgvector image, ready for M5's embeddings)
  with its own credentials, holding an opaque platform user id rather than a
  copy of the platform user table.
- A validated environment contract that refuses to boot staging or
  production without an explicit `JOBMATCH_DATABASE_URL`.
- Redaction-by-construction logging and an append-only audit table.
- CI covering typecheck, unit tests, migration apply, and schema drift.

## Local development

```bash
docker compose up -d jobmatch-postgres
```

```bash
pnpm --filter @asafarim/jobmatch db:migrate
```

```bash
pnpm --filter @asafarim/jobmatch dev
```

Then open <http://localhost:3012>. `/workspace` redirects to Hub's sign-in
(run `pnpm --filter @asafarim/hub dev` too) and comes back with a workspace
created on first visit.

```bash
pnpm --filter @asafarim/jobmatch test
```

## Environment

| Variable | Required in | Notes |
|---|---|---|
| `JOBMATCH_DATABASE_URL` | staging, production | No fallback to the platform `DATABASE_URL` — a missing value fails startup rather than silently using the identity database. Local development defaults to `localhost:55437`. |
| `JOBMATCH_SHADOW_DATABASE_URL` | CI only | Throwaway database for the migration drift check. |
| `JOBMATCH_ENVIRONMENT` | staging, production | `staging` there, `production` in prod; it decides whether secrets may be defaulted. |
| `NEXT_PUBLIC_JOBMATCH_URL` | all deployments | Inlined at build time; also an allowed SSO callback origin. |
| `NEXT_PUBLIC_HUB_URL` | all deployments | Where unauthenticated visitors are sent to sign in. |
| `JOBMATCH_SCANNER_URL` | production (JM-018) | ClamAV sidecar. Without it every upload is quarantined — a fail-closed default, and the reason the CV pipeline is not usable in production yet. |
| `JOBMATCH_SCANNER` | local only | Set to the exact literal `insecure-accept-all` to run the pipeline without a scanner. Refused on any deployed environment, and it names itself on every document it clears. |
| `JOBMATCH_INGESTION_TOKEN` | production | Bearer token for `POST /api/ingestion/sync`, which runs ingestion, re-assesses freshness and prunes expired snapshots. Unset disables the route entirely (404). Drive it from a scheduler. Holding it does not authorise fetching from a source whose agreement is missing or expired — that is checked per source. |
| `JOBMATCH_RETENTION_TOKEN` | production | Bearer token for `POST /api/retention`, which sweeps documents past their 90-day window. Unset disables the route entirely (404) rather than leaving it open. Drive it from a scheduler. |
| `STORAGE_*` | production | S3-compatible object storage for uploaded CVs. Without it, `@asafarim/storage` falls back to `.local-storage/` on disk, which is fine locally and not fine anywhere else. |

Production additionally needs `JOBMATCH_DB_PASSWORD` and its URL-encoded
form `JOBMATCH_DB_PASSWORD_URL` in `.env.production`, following the same
convention as AppBuilder and Testora.

## Why a separate database

Job listings are high-volume and rewritten constantly by ingestion; CV-derived
data needs a stricter access boundary than identity traffic; and embedding
indexes grow fast. Mixing that into the shared platform Postgres would put
search and ingestion load onto identity transactions. The full rationale is
in the business plan under "Database recommendation".

JobMatch's Prisma client is generated into `lib/db/generated` rather than
`node_modules/@prisma/client`, because pnpm symlinks that path to the shared
store where the *platform* client lives. Both clients coexist in one process
only because of that split.
