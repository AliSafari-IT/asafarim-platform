# AI Workbench launch gate

Part of [#684](https://github.com/AliSafari-IT/asafarim-platform/issues/684). A tool moves from `experiment` to
`beta` only when everything here is green for it. This gate never waives a failed quality
or security check to meet a date.

## Automated coverage

| Layer | What | Where |
| --- | --- | --- |
| Unit | Catalogue validation, schemas, adapters, exports, handoffs, cost mapping, admission, analytics allowlist, SEO | `apps/web/lib/**/*.test.ts(x)`, `packages/timeline-contract`, `packages/tool-handoff` |
| Component | Shared shell states and each tool's review/editor (server-rendered) | `components/tools/*.test.tsx`, `lib/tools/**/*.test.tsx` |
| Integration | Fixture/live boundary, rate limits, idempotency, timeout, provider-disabled, invalid output, safe logging, CSRF, body caps | `lib/tools/server/*.test.ts(x)`, `app/api/tools/[slug]/run/route.test.ts` |
| Eval gate | Schema, grounding, unsupported claims, false precision, injection, exports, guardrails | `benchmarks/ai-tools` (CI job `evaluate`) |
| E2E | Keyboard-only example → run → review/edit → export → handoff file for all three tools; axe (WCAG 2.2 AA, no serious or critical violations); provider unavailable, network failure, navigation mid-run, analytics blocked; performance budgets; server-log leak check. Desktop and mobile profiles, production build, fixture mode, no keys | `apps/web/e2e/tools.spec.ts` (CI job `e2e`) |
| Destinations | Handoff validation, preview, idempotent confirm, audit without content | TimelineAI, TasksAI, and Testora tests (`workbench-import`, `handoff`) |

Run locally:

```bash
pnpm --filter @asafarim/web test
pnpm --filter @asafarim/ai-tools-benchmark test
pnpm --filter @asafarim/web exec next build && pnpm --filter @asafarim/web e2e
```

The destination sign-in → preview → confirm path is covered by each destination's own
tests. A cross-app browser run needs Hub and the destination databases, so it's part of the
manual post-deploy check (see [handoff.md](./handoff.md#manual-end-to-end-check)).

## Performance budgets

Lab numbers from the E2E suite on a production build (fixture mode, local server). They
guard against regressions; they are not field data.

| Metric | Budget | Measured, desktop | Measured, mobile (Pixel 5 profile) |
| --- | --- | --- | --- |
| Initial JavaScript per tool page (transferred) | ≤ 450 KB | 234 KB | 234 KB |
| Largest Contentful Paint | ≤ 2.5 s | 0.18–0.21 s | 0.14–0.15 s |
| Cumulative Layout Shift | ≤ 0.1 | 0 | 0 |
| Slowest interaction (Event Timing, a proxy for INP) | ≤ 200 ms | 72–88 ms | 48–56 ms |
| Fixture-mode run response | ≤ 800 ms | 83–92 ms | 73–82 ms |

Measured on 2026-09-27 at the commit that added this file. Every E2E run attaches its
numbers (`perf-<tool>-<profile>.json`). Field Core Web Vitals come from Search Console
after launch.

## Accessibility fixes made by the gate

The first axe run found real issues. They're fixed for the whole Web app:

- The Web accent `#b45309` measured 4.46:1 on the page background (AA needs 4.5:1). It's now `#9f4a07`, at least 4.6:1 on every Web surface.
- Warning and success badges measured 3.9:1 and 4.27:1. They now use darker, Web-only text colours.
- Links inside running text on tool pages relied on colour alone. They're now underlined.

## Launch checklist (per tool)

- [ ] Eval gate green for the tool's current versions, and the opt-in live eval reviewed (`pnpm --filter @asafarim/ai-tools-benchmark eval:live`, budget-capped).
- [ ] CI green: `evaluate`, `e2e`, and the general checks.
- [ ] Threat model reviewed for anything the tool changed ([threat-model.md](./threat-model.md)).
- [ ] **Migrations:** none. The cost ledger table (`WebToolCostEvent`) already exists, and destination imports use existing tables.
- [ ] **Secrets and settings:** `ai.anthropic.apiKey` in Admin (or `ANTHROPIC_API_KEY` in `.env.production.age`), `AI_TOOLS_MODE=live`, and limits reviewed ([runbook.md](./runbook.md#configuration)). Live stays off until `web.aiTools.liveEnabled` is switched on in Admin.
- [ ] **Caddy/Docker:** no change. New routes live in the existing `web`, `timelineai`, `tasks-ai`, and `testora` images; the new packages are source-only.
- [ ] Catalogue: `lifecycle: "beta"`, `indexable: true`, `liveGeneration: true`, `lastReviewed` updated, case study linked.
- [ ] Sitemap and indexing steps ([seo.md](./seo.md#launch-and-inspection-runbook)).
- [ ] Analytics baseline and launch annotation ([analytics.md](./analytics.md#baseline-and-launch-annotations)).
- [ ] Cost alert: `AI_TOOLS_DAILY_BUDGET_USD` set, and the cost-ledger query checked daily for the first week.
- [ ] Privacy and terms still describe what the tool does (review whenever retention changes).
- [ ] Case study updated with the tool's status.
- [ ] Deploy, run `pnpm smoke:ai-tools` against production (no spend), then once with `AI_TOOLS_SMOKE_LIVE=1`.
- [ ] Kill-switch drill ([runbook.md](./runbook.md#kill-switch-drill)), noted in its table.
- [ ] Manual handoff check into the destination app.

## Rollback

1. **Fast, no deploy:** pause the tool (Admin `web.aiTools.disabledTools`) or switch live off globally.
2. **Content or code:** set the tool back to `lifecycle: "experiment"` and `liveGeneration: false`, then deploy. The page stays up and leaves the sitemap.
3. **Full revert:** redeploy the previous image tags (see `docs/deployment.md`). There is no data migration to undo.

## Epic exit evidence (#670)

| Evidence | Status |
| --- | --- |
| Charter, boundaries, promotion criteria | Done: [charter.md](./charter.md) |
| Typed registry, shared shell, catalogue | Done: `apps/web/lib/tools`, `/tools` |
| Server-only execution boundary with fixture mode, idempotency, cost events | Done: [execution-boundary.md](./execution-boundary.md) |
| Three tools with typed contracts, grounding checks, review, export | Done: test plan, action plan, cited timeline |
| Versioned handoffs into Testora, TasksAI, TimelineAI | Done: [handoff.md](./handoff.md) (file-based MVP) |
| Fixture-first eval gate in CI | Done: `benchmarks/ai-tools` |
| Threat model, abuse limits, spend controls | Done: [threat-model.md](./threat-model.md) |
| SEO, structured data, languages decision | Done: [seo.md](./seo.md) |
| Privacy-safe analytics and measurement plan | Done: [analytics.md](./analytics.md) |
| Case study and conversion paths | Done: Showcase `/projects/ai-workbench` |
| Launch E2E, accessibility, performance budgets | Done: this document |
| Production runbook, rollback, smoke test | Done: [runbook.md](./runbook.md), `pnpm smoke:ai-tools` |
| Kill-switch drill, cost-alert check, sitemap verification, and post-deploy smoke **in production** | Pending: done per tool at its beta launch (checklist above) |
