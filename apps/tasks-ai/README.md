# TasksAI (`@asafarim/tasks-ai`)

AI-native work execution — *from scattered intent to trusted execution*.
Dev port **3013** · domain `tasks-ai.asafarim.com`.

> **Status: beta.** The non-AI core task experience, capture/Inbox, My Work,
> the proposal-only AI copilot, Focus, Automations, Analytics, Search, and a
> real task-detail planning surface (subtasks, dependencies, completion
> checks) have all landed, but this is not a launched or commercial product.
> Per the milestone plan, a Showcase entry stays `planned` → `beta` only at
> M13 → `live` only at M14, which is why the public
> [`/projects`](https://asafarim.com/projects) page lists TasksAI as beta.
> See internal docs `ventures/tasks-ai/product/product-charter.md` and the milestone plan in
> internal docs `ventures/tasks-ai/roadmap/internal-implementation-plan.md`.
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

### Navigation

Workspace navigation is grouped by job, not one flat list: **Work** (Home,
Inbox, My Work, Focus) · **Planning** (Projects, Search) · **AI &
Automation** (Copilot, Automations) · **Insights** (Analytics) ·
**Workspace** (Settings). Every destination carries an always-available
(not hover-only) description, a workspace switcher replaces the old static
workspace-name label once a viewer belongs to more than one workspace, and
project sub-routes show a breadcrumb back to Projects. The command palette
(⌘K) covers every destination, not just a handful.

### Surfaces (M03–M10)

- **Workspace Home** ([`docs/`](docs/) · `lib/home/`): a guided first-run
  activation flow and a single-screen overview of projects, due work, and
  entry points — the answer to "where do I start?"
- **Capture & Inbox** (internal docs `ventures/tasks-ai/engineering/capture-inbox.md`): a
  global Capture action on every workspace page; an Inbox that means
  "captured but not organized yet" (a persisted `task.triagedAt`, not a
  filter over open tasks); a keyboard-driven triage pass that moves work
  into normal planning.
- **My Work** (internal docs `ventures/tasks-ai/engineering/my-work.md`): the daily execution
  view — everything assigned to me, grouped by Overdue / Today / Blocked /
  Upcoming / No due date, with quick edit and keyboard control. Deliberately
  *not* a ranking; Focus is the separate prioritization layer.
- **Projects** — project list and per-project task workspace
  (`components/tasks/TaskWorkspace.tsx`).
- **Task detail** (`components/tasks/TaskDetailPanel.tsx`): the authoritative
  planning surface for one task — owner, due date, subtasks (with parent
  breadcrumb navigation), dependencies (`blocks`/`blocked by` in plain
  language, `relates`/`duplicates` as secondary), and completion checks
  (the green-light gate `completeTask()` enforces — a blocked completion
  names which checks are pending instead of a generic error). Status and
  labels are not yet wired up here; see
  [issue #387](https://github.com/AliSafari-IT/asafarim-platform/issues/387).
- **AI Copilot** (internal docs `ventures/tasks-ai/engineering/copilot.md`): a guided
  intent→plan flow at `/w/{slug}/copilot` — paste notes, pick an intent and
  destination, generate a **proposal**, review a grouped diff (create /
  update / link) with source citations and confidence, partially accept,
  edit, apply, undo, and leave feedback. The human is always the author.
- **Focus** (internal docs `ventures/tasks-ai/engineering/intelligence.md`): explainable
  focus ranking with per-factor transparency and user overrides.
- **Automations**: trigger → conditions → actions rules, created as drafts,
  dry-run before activation.
- **Analytics**: cycle time, throughput, aging, predictability, and
  per-project portfolio health — reports on work, never on individuals.
- **Search**: full-text search across tasks, projects, comments, and labels,
  with saved searches.
- Settings, imports, and admin surfaces live under `/w/{slug}/*`.

Every major empty state (Inbox, My Work, Projects, Focus, Search,
Automations, Analytics) points at a next action rather than a dead end.

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
internal docs `ventures/tasks-ai/engineering/ai-boundary.md` and ADR
0004 (internal docs `ventures/tasks-ai/adr/0004-ai-proposal-model.md`). Core task management stays fully
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
   (internal docs `ventures/tasks-ai/adr/0001-dedicated-database.md`).
3. **Never echo values** — errors name the variable, never its contents.

## Deployment

See internal docs `ventures/tasks-ai/operations/deployment-plan.md`. Docker stages: `builder`,
`migrator` (one-shot `prisma migrate deploy`), `worker`, `runner`.
