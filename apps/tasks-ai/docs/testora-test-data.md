# Synthetic test data for Testora's TasksAI catalog (#742)

Testora's TasksAI end-user catalog signs in to TasksAI as synthetic accounts and
runs against synthetic workspaces. This page is the operator runbook for
creating, checking and removing that data. Updating Testora's catalog
("Update tests" / `pnpm --filter testora db:seed`) **never** touches it.

## Two tools, two databases

| Step | Tool | Writes | Output (git-ignored, repo root `.tasksai-test/`) |
|---|---|---|---|
| 1. Accounts | `pnpm --filter @asafarim/db db:seed:tasksai-identities` | platform DB (Hub users) | `identities.<env>.json` (ids), `credentials.<env>.json` (passwords) |
| 2. Workspaces & tasks | `pnpm --filter @asafarim/tasks-ai test-data -- setup` | TasksAI DB | `test-data.<env>.json` (handles), handoff samples |

TasksAI stores only the accounts' opaque ids; step 2 reads them from
`identities.<env>.json` and never reads the platform database.

## Local (full data)

```bash
pnpm --filter @asafarim/db db:seed:tasksai-identities
pnpm --filter @asafarim/tasks-ai test-data -- setup
pnpm --filter @asafarim/tasks-ai test-data -- verify
```

Then put the credentials into the **Testora target's secrets** (Run page →
target → Secrets) for `asafarim-tasks-ai:local`, using the JSON keys of
`credentials.local.json` as the secret names, and delete that file:

| Identity | Secret names | TasksAI role in `tasksai-synthetic-main` |
|---|---|---|
| owner | `TASKSAI_TEST_OWNER_EMAIL` / `_PASSWORD` | owner |
| admin | `TASKSAI_TEST_ADMIN_EMAIL` / `_PASSWORD` | admin |
| member | `TASKSAI_TEST_MEMBER_EMAIL` / `_PASSWORD` | member |
| member2 | `TASKSAI_TEST_MEMBER2_EMAIL` / `_PASSWORD` | member |
| guest | `TASKSAI_TEST_GUEST_EMAIL` / `_PASSWORD` | guest (project SYNG only) |
| outsider | `TASKSAI_TEST_OUTSIDER_EMAIL` / `_PASSWORD` | none (isolation checks) |

Passwords exist only in that file (until you delete it) and in Testora's
encrypted target secrets. `--rotate` on the identities CLI issues new ones.

## Commands

`test-data -- <command>`:

- `setup`: create the synthetic workspaces that are missing. Re-running is a database no-op. Handoff samples are rewritten each time (they expire).
- `reset`: `cleanup` + `setup`; re-anchors dates to today (use after an archival test or a destructive run).
- `verify`: read-only; exit 1 if anything is missing.
- `cleanup`: delete every `tasksai-synthetic-*` workspace and every row scoped to one, in every table.
- `prune-runs [--run=<id>] [--older-than-hours=<n>]`: delete records a Testora run created. Their titles/names start with `[run:<runId>]`; baseline records never do.

Options: `--env=<label>` (default `local`), `--identities=<path>`,
`--anchor=YYYY-MM-DD --tz=<zone>` (controlled clock; default today,
Europe/Brussels), `--confirm-host=<host>` (any non-local database).

**Removal order:** `test-data -- cleanup` first (memberships live in TasksAI),
then `db:seed:tasksai-identities -- --remove`.

## What setup creates

All slugs start with `tasksai-synthetic-`; that prefix is the only thing cleanup matches.

- **main**: owner, admin, member, member2, guest. Projects **SYNA** (populated), **SYNG** (guest's only project), **SYNE** (empty). Tasks overdue / due today / upcoming / undated / assigned to member2 / unassigned / blocked (by a blocker) / parent + subtask / relates pair / pending and satisfied completion checks / two completed / one aging (started 30 days ago). Labels `synthetic-bug`, `synthetic-ux`. A member comment, a member saved search, an admin **draft** automation.
- **second**: a project and a "secret" task that must never show in main.
- **empty**: members, no projects.
- **ai-off**: AI disabled (`AiSettings.enabled=false`), for the AI-unavailable fallback.
- **disposable**: owner + admin only, for owner-only archival; `reset` recreates it.

Every synthetic workspace except ai-off uses the deterministic **fixture** AI
provider (`AiSettings.provider=fixture`). Dates are relative to the anchor in the
chosen timezone, at 12:00 UTC of that calendar day.

Committed import samples: `scripts/test-data/samples/` (valid CSV/JSON,
malformed, missing fields). Handoff samples (a real `asafarim-handoff/1` envelope
and its byte-identical duplicate) are generated into `.tasksai-test/`.

Not provided by setup: the **automation worker**. Its liveness is a queue heartbeat, not a row, so Testora's preflight checks it.

## Remote test environment

```bash
DATABASE_URL=<test platform db> pnpm --filter @asafarim/db db:seed:tasksai-identities -- --env=remote-test --confirm-host=<host>
TASKSAI_DATABASE_URL=<test tasksai db> pnpm --filter @asafarim/tasks-ai test-data -- setup --env=remote-test --confirm-host=<host>
```

Testora seeds the "Remote test environment" target only when
`NEXT_PUBLIC_ASAFARIM_TASKSAI_TEST_URL` and `NEXT_PUBLIC_ASAFARIM_TASKSAI_TEST_HUB_URL`
are set. They are `NEXT_PUBLIC_*`: inlined at **build** time wherever a client
bundle imports them, so changing them needs a Testora rebuild, not just a re-seed.

## Production (remote smoke): owner only

Both tools **refuse** the production databases (`NODE_ENV=production`, or the
compose hosts `postgres` / `tasksai-postgres`). The read-only remote-smoke
baseline needs:

- one Hub account: the `member` identity (`tasksai-test+member@asafarim.test`);
- one TasksAI workspace, `tasksai-synthetic-main`, where that account is the only member (role member), with the read-only baseline projects and tasks.

Whether to create it is the **owner's** decision. If yes, the owner runs both
tools with `--allow-production-baseline`, which limits them to exactly that and
nothing else. No catalog test mutates production data (see the coverage manifest).

## Guard summary

| Database | identities CLI | test-data |
|---|---|---|
| local | all accounts | full data |
| other host | needs `--confirm-host=<host>` | needs `--confirm-host=<host>` |
| production | refused; owner flag → member only | refused; owner flag → main workspace, member only |
| the platform DB as TASKSAI_DATABASE_URL | — | refused |
