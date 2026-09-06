# TasksAI — Performance budgets (M11)

Route-level budgets. CI check wiring is a follow-up; the numbers are the
contract.

## Web vitals (p75, production, mid-tier mobile)

| Metric | Budget |
|---|---|
| LCP | ≤ 2.5 s |
| INP | ≤ 200 ms |
| CLS | ≤ 0.1 |
| TTFB | ≤ 0.8 s |

## Per-route JS (gzipped, first load)

| Route | Budget |
|---|---|
| `/` (landing) | ≤ 90 KB |
| `/workspace` | ≤ 130 KB |
| `/w/[slug]/*` (workspace shell + view) | ≤ 190 KB |
| `/w/[slug]/copilot` | ≤ 210 KB |
| `/w/[slug]/analytics` | ≤ 180 KB |

Next 16 + Turbopack, `output: standalone`. The workspace shell is a client
component; views are code-split per route.

## Data / query budgets

- List endpoints: cursor-paginated, `limit ≤ 100`, default 25.
- A single page render issues **≤ 4** DB round trips (server components
  batch with `Promise.all`).
- `/w/[slug]/analytics` and `/focus` compute from one task scan + one
  activity scan; heavy aggregates move to `MetricSnapshot` (M10) rather
  than recomputing on every load.
- Large task lists: the list/board views must **virtualize** above ~200
  rows (helper: `lib/pwa/…` is unrelated; virtualization lands with the
  first workspace that has that volume — tracked).

## Images

- Only `favicon.svg` ships today. Any future raster asset: `next/image`,
  AVIF/WebP, explicit dimensions, `≤ 100 KB` above the fold.

## DB hotspots (profiled at M11, revisited under M15 load)

- `task` has composite indexes on `(workspaceId, projectId)`,
  `(workspaceId, assigneeId)`, `(workspaceId, dueDate)`.
- FTS uses the out-of-band expression GIN indexes (`scripts/search-indexes.sql`).
- `activity_event (workspaceId, occurredAt)` covers the SSE stream poll and
  the flow-metric scans.

## Offline

Service worker (`public/sw.js`): shell cache-first, `GET /api/v1/*`
network-first with a short cache fallback, mutations never cached. The
offline mutation queue (`lib/pwa/queue.ts`) replays on reconnect and
surfaces 409s as conflicts.
