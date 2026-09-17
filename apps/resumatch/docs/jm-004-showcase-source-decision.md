# JM-004 — First showcase source decision

**Status: decided (Option C).** Recorded against business-plan decisions
JM-003 (source-rights register) and JM-004 (assess launch sources and select
the first connector). Tracked by issue #208.

## Decision

The public showcase uses a **synthetic, deterministic demo source** as its
first and only source. It is loaded through the real M3 ingestion contract
(`runSync` → snapshot → normalize → deduplicate → age-out → record), not a
bypass of it.

This is Option C from issue #208: ship a synthetic source for the portfolio
flow while keeping the connector interface ready for a later rights-cleared
source. It lets the full candidate journey — create/confirm profile → follow
the next step → search demo jobs → read eligibility reasons → save a job →
export My Jobs — be demonstrated now, without presenting the showcase as a
live recruitment service.

### Why not the alternatives

- **Option A (synthetic only, no future connector seam):** rejected only in
  framing — the machinery to add a real connector already exists and is
  kept. In practice this decision *is* Option A's dataset plus Option C's
  intent.
- **Option B (rights-cleared real source):** still blocked on non-engineering
  work — selecting a source, agreeing terms, and completing the JM-003
  register. Out of scope for #208 and deferred.

## Provenance and labelling

| Field | Value |
| --- | --- |
| Source key | `synthetic-belgian-showcase` |
| Source name | `Synthetic Belgian showcase (demo data)` |
| Kind | `JSON_FEED` |
| Owner | Repository maintainer (Licensor) |
| Data origin | Fabricated in `apps/jobmatch/lib/ingestion/showcaseFixture.ts` |
| Agreement reference | `JM-004-SYNTHETIC-SHOWCASE` (this document) |
| Agreement expiry | 2099-12-31 (fixed; the "agreement" is the fixture file) |
| Commercial reuse | No |
| Attribution shown | "Synthetic demonstration data — fabricated for the JobMatch showcase, not a live vacancy." |
| Endpoint | `https://showcase.jobmatch.asafarim.com/synthetic-belgian-feed.json` — a syntactically valid public HTTPS URL that satisfies the SSRF allowlist and is **never fetched**; the loader hands the fixture in as an offline body |

Every posting from this source shows the attribution string on its card, the
Sources page badges it `synthetic demo`, and the app footer and overview
state that no live source is connected. Nothing labels these as real
vacancies.

## Loading and resetting

The source is not seeded automatically. An operator loads it against a
running instance:

```bash
# dev server must be up (port 3012)
pnpm --filter @asafarim/jobmatch showcase:load
pnpm --filter @asafarim/jobmatch showcase:load -- --reset   # wipe + reload
```

The command is a thin HTTP client for `POST /api/ingestion/showcase`, which
is authenticated by `JOBMATCH_INGESTION_TOKEN` (the same secret the sync
route uses) and disabled entirely when that token is unset. `--reset`
deletes the source's postings, snapshots and runs, then re-syncs; without it
the load is idempotent (identical bytes → nothing added or changed).

Disabling the source is `UPDATE job_sources SET sync_enabled = false` (or
status `PAUSED`/`TERMINATED`); its data is removed with `--reset` semantics
or by deleting the `job_sources` row (postings and snapshots cascade).

## Explicitly not in scope

Real external connector selection and source-rights approval; an operator
source-configuration UI; ingestion replay/quarantine tooling; the exhaustive
ingestion failure matrix; live AI matching. These remain follow-up issues.
The JM-001 non-commercial portfolio-showcase licensing decision and the
showcase-only disclosure are unchanged.
