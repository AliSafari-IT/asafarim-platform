# TasksAI (`@asafarim/tasks-ai`)

AI-native work execution — *from scattered intent to trusted execution*.
Dev port **3013** · domain `tasks-ai.asafarim.com`.

> **Status: pre-beta (through M07).** The non-AI core task experience,
> capture/Inbox, My Work, and the proposal-only AI copilot have landed, but
> this is not a launched or commercial product. See
> [`docs/charter.md`](docs/charter.md) and the milestone plan in
> [`docs/roadmap-implementation-plan.md`](docs/roadmap-implementation-plan.md).
> The commercial-license gate and public launch are M14; design-partner
> beta begins at M13 ([`docs/beta-plan.md`](docs/beta-plan.md)).

## What exists

- Next.js 16 app shell (public landing + authenticated `/w/{slug}`), shared
  SSO via Hub, `@asafarim/ui` design system, `data-app="tasks-ai"` theming.
- **Dedicated PostgreSQL database** (isolated Prisma client under
  `lib/db/generated`), migration boundary, readiness probe.
- `/api/health` (web) and a BullMQ **worker skeleton** with a health
  heartbeat.
- Structured, secret-redacting logger.
- Unit tests (Vitest), integration-test harness (gated on a throwaway DB),
  Playwright smoke, and a dedicated CI workflow.

### Surfaces (M03–M07)

- **Workspace Home** ([`docs/`](docs/) · `lib/home/`): a guided first-run
  activation flow and a single-screen overview of projects, due work, and
  entry points — the answer to "where do I start?"
- **Capture & Inbox** ([`docs/capture-inbox.md`](docs/capture-inbox.md)): a
  global Capture action on every workspace page; an Inbox that means
  "captured but not organized yet" (a persisted `task.triagedAt`, not a
  filter over open tasks); a keyboard-driven triage pass that moves work
  into normal planning.
- **My Work** ([`docs/my-work.md`](docs/my-work.md)): the daily execution
  view — everything assigned to me, grouped by Overdue / Today / Blocked /
  Upcoming / No due date, with quick edit and keyboard control. Deliberately
  *not* a ranking; Focus is the separate prioritization layer.
- **Projects** — project list and per-project task workspace
  (`components/tasks/TaskWorkspace.tsx`).
- **AI Copilot** ([`docs/copilot.md`](docs/copilot.md)): a guided
  intent→plan flow at `/w/{slug}/copilot` — paste notes, pick an intent and
  destination, generate a **proposal**, review a grouped diff (create /
  update / link) with source citations and confidence, partially accept,
  edit, apply, undo, and leave feedback. The human is always the author.
- **Focus** ([`docs/intelligence.md`](docs/intelligence.md)): explainable
  focus ranking with per-factor transparency and user overrides.
- Settings, imports, search, analytics, automations, and admin surfaces are
  scaffolded under `/w/{slug}/*`.

The four surfaces that must stay distinct:

| Surface  | Question it answers                          |
|----------|----------------------------------------------|
| Inbox    | What still needs organizing?                 |
| My Work  | What am I responsible for, and when?         |
| Projects | What is the team doing, in context?          |
| Focus    | What deserves my attention first, and why?  |

## AI boundary

AI never mutates domain data. Every change is a **proposal** of operations
drawn from a fixed allowlist (`create_task`, `update_task`, `link_tasks`) —
assignees, dates, roles, permissions, billing, and messaging are not
representable in the schema, so prompt injection cannot widen the scope.
The pipeline, provider boundary (fixture / Anthropic / OpenAI), redaction,
quotas, kill switch, and offline evals are documented in
[`docs/ai-boundary.md`](docs/ai-boundary.md) and ADR
[0004](docs/adr/0004-ai-proposal-model.md). Core task management stays fully
usable with AI disabled.

## Testora ↔ TasksAI integration

The autonomous quality loop with Testora (epic
[#269](https://github.com/AliSafari-IT/asafarim-platform/issues/269)) crosses
an app boundary with isolated databases and no shared session. The trust
boundary, HMAC signing scheme, data-minimisation rules and versioned payload
schemas are defined in
[`docs/testora-tasksai-contract.md`](../../docs/testora-tasksai-contract.md)
and [ADR 0002](../../docs/adr/0002-testora-tasksai-trust-boundary.md), with the
schemas shipped in
[`@asafarim/testora-tasksai-contract`](../../packages/testora-tasksai-contract).

## Commands

```bash
pnpm --filter @asafarim/tasks-ai dev            # web on :3013
pnpm --filter @asafarim/tasks-ai worker:dev     # background worker
pnpm --filter @asafarim/tasks-ai typecheck
pnpm --filter @asafarim/tasks-ai test           # unit only, DB-free
pnpm --filter @asafarim/tasks-ai test:integration   # needs TASKSAI_TEST_DATABASE_URL
pnpm --filter @asafarim/tasks-ai db:migrate     # prisma migrate dev
pnpm --filter @asafarim/tasks-ai e2e            # Playwright smoke
pnpm --filter @asafarim/tasks-ai ai:eval        # offline AI evals (fixture, $0)
```

Local infra (Postgres :55438, Redis :6390):

```bash
pnpm db:up   # docker compose up -d  (brings up tasksai-postgres among others)
```

## Environment

Resolved and validated in [`lib/env.ts`](lib/env.ts). See
[`.env.example`](.env.example). Rules:

1. **Fail loudly** — missing `TASKSAI_DATABASE_URL` in staging/production
   stops boot.
2. **No shared-DB fallback** — TasksAI never falls back to the platform
   `DATABASE_URL`, and refuses a `TASKSAI_DATABASE_URL` byte-identical to it
   ([`docs/adr/0001-dedicated-database.md`](docs/adr/0001-dedicated-database.md)).
3. **Never echo values** — errors name the variable, never its contents.

## Deployment

See [`docs/deploy-plan.md`](docs/deploy-plan.md). Docker stages: `builder`,
`migrator` (one-shot `prisma migrate deploy`), `worker`, `runner`.
