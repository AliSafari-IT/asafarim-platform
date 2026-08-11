# Engineering proof board — plan

Tracks [#13](https://github.com/AliSafari-IT/asafarim-platform/issues/13). This
document is the working plan; it is not itself the deliverable.

## What shipped in this PR

- `apps/showcase/app/proof/data.ts` — the public data contract. Every export
  is explicitly allow-listed; package/app versions are read live from
  `package.json` files (real data), the changelog is a curated slice of real
  commits, and everything else (architecture, security boundaries, deployment
  topology, quality metrics) is hand-authored prose reviewed for what it must
  never contain — see the file's header comment for the hard rule.
- `apps/showcase/app/proof/page.tsx` — renders the contract: architecture map,
  SSO/RBAC boundary summary, deployment topology (no hosts/IPs/credentials),
  quality metrics section (honestly labelled "not yet measured" where true),
  package/version cards, and a changelog timeline.
- Nav entry (`/proof`) added to the showcase top nav, i18n'd across all 5
  locales. The homepage stays a gallery; this page carries the technical
  detail, per the issue's acceptance criteria.

## What's intentionally deferred (tracked as separate issues)

The full issue asks for 8 proof surfaces plus a signed CI artifact pipeline.
Shipping all of it in one PR would mean guessing at CI/observability
infrastructure that doesn't exist yet in this repo (there is currently no
PR-triggered build/lint/typecheck/test workflow — only deploy and benchmark
workflows). Rather than fabricate metrics, the Quality section says plainly
that build/a11y/perf numbers aren't wired up yet. Follow-on work:

1. **CI status pipeline** ([#146](https://github.com/AliSafari-IT/asafarim-platform/issues/146)) — add a PR-triggered workflow that runs
   `turbo build && turbo lint && turbo typecheck && turbo test`, and publishes
   a JSON summary (pass/fail per check, commit SHA, timestamp) as a workflow
   artifact with a checksum so it's traceable to the run that produced it.
   The `/proof` page's `CI_METRICS` should then read that published artifact
   instead of the static "not yet measured" placeholder.
2. **Accessibility & performance snapshots** ([#147](https://github.com/AliSafari-IT/asafarim-platform/issues/147)) — Lighthouse CI against the
   deployed showcase (or a preview build), scheduled, publishing timestamped
   scores the page can render honestly as "last known" with the report date.
3. **Live health/status for safe endpoints** ([#148](https://github.com/AliSafari-IT/asafarim-platform/issues/148)) — a small allow-listed `/api/status`
   per app (up/down + response time only, no internals) that the proof page
   can poll and label `live` vs `last-known` per the freshness contract
   already defined in `data.ts`.
4. **Architecture/security diagrams as visuals** ([#149](https://github.com/AliSafari-IT/asafarim-platform/issues/149)) — the current page is prose;
   an SVG/diagram rendering of `ARCHITECTURE_NODES` and the SSO/RBAC flow
   would satisfy "diagrams match the current implementation" more literally.
5. **Automated changelog** ([#150](https://github.com/AliSafari-IT/asafarim-platform/issues/150)) — replace the hand-curated `CHANGELOG_SEED` with a
   small script that filters `git log --grep=^feat` on merge to main and
   writes a committed JSON file, so the changelog stops needing manual edits.

## Rules this page follows (from the issue)

- No private hosts, database details, env values, user data, logs, or admin
  endpoints — enforced by review of `data.ts`, not by runtime filtering.
- Every metric states its measurement method and timestamp.
- Degraded/unavailable data renders honestly ("not yet measured") rather than
  being hidden or invented.
- Homepage stays a restrained gallery; this page carries the technical detail.
