# TasksAI end-user workflow and test-scenario catalog

## Purpose and scope

This is the executable product test map for TasksAI. It was derived from the current route tree, React components, client API, API routes, Prisma seed, Playwright tests, the app README, and the product documents in this directory. It covers the browser experience first and then separately lists supported API, integration, governance, billing, and enterprise contracts that do not currently have a complete browser UI.

The catalog is intentionally broader than a smoke test. Every feature should be checked for permissions, empty and populated states, validation, failure recovery, concurrency, accessibility, and tenant isolation where applicable.

### Status legend

- **UI** — directly executable in the current browser interface.
- **API** — implemented contract, but no complete end-user UI is present.
- **External** — requires a configured provider, signed request, email, GitHub, Stripe, Testora, or identity system.
- **Planned/gap** — described in product documentation but not fully wired in the current UI; do not report it as shipped.

## Test identities and deterministic fixtures

Use isolated accounts and never reuse production data.

| Fixture | Required state | Used to verify |
| --- | --- | --- |
| `owner@tasksai.test` | Owner of `test-workspace` | All UI, destructive governance, billing, beta, enterprise |
| `admin@tasksai.test` | Admin of `test-workspace` | Invitations, AI settings, rules, audit, feedback triage |
| `member@tasksai.test` | Member of `test-workspace` | Normal creation, planning, capture, comments, Copilot |
| `guest@tasksai.test` | Guest with access to one scoped project | Read/comment experience and hidden write controls |
| `outsider@tasksai.test` | Authenticated but not a workspace member | Tenant boundary and not-found behavior |
| Workspace A | `test-workspace`, with AI enabled and a finite budget | Main scenarios |
| Workspace B | A second workspace with unrelated users and data | Cross-tenant isolation |
| Empty workspace | Owner only, no user projects or tasks | First-run experience |
| `ALPHA` project | Workspace-visible, mixed task states | Lists, board, calendar, timeline, search |
| `PRIVATE` project | Private/scoped membership | Visibility checks |
| Task data | Inbox item; overdue; due today; future; undated; blocked; completed; archived; unassigned; assigned to each persona | Grouping and filtering |
| Conflict task | Record fetched in two independent sessions | Optimistic concurrency |
| Large project | At least 220 open tasks and multiple result pages | Pagination, virtualization, keyboard, performance |
| Gated task | Unsatisfied Testora completion check | Completion blocking and override |
| AI states | Enabled, disabled, budget exhausted, rate limited, provider unavailable | Copilot safety and recovery |
| Rule states | Draft, active, paused, successful run, failed run, loop-risk dry run | Automations |

Reset mutable fixtures between suites. Keep timestamps relative to the test clock so overdue/today/upcoming groups are deterministic in the browser's configured timezone.

## Route and workflow map

| Surface | Route | Primary job | Minimum role |
| --- | --- | --- | --- |
| Product overview | `/` | Understand the product and enter the app | Public |
| Use cases | `/use-cases` | Explore representative workflows | Public |
| Roadmap | `/roadmap` | Understand delivery status | Public |
| Workspace resolver | `/workspace` | Choose or create a workspace | Authenticated |
| Home | `/w/{slug}` | Orient, onboard, and resume work | Guest |
| Inbox | `/w/{slug}/inbox` | Triage captured work | Guest read; member write |
| My Work | `/w/{slug}/my-work` | Execute assigned work | Guest read; member write |
| Focus | `/w/{slug}/focus` | Review ranked work and risk signals | Guest |
| Projects | `/w/{slug}/projects` | Create and browse projects | Guest read; member create |
| Project detail | `/w/{slug}/projects/{id}` | Plan and execute project tasks | Guest read/comment; member write |
| Search | `/w/{slug}/search` | Find work and save queries | Guest within scope |
| Import | `/w/{slug}/imports` | Dry-run and apply CSV/JSON imports | Member |
| Copilot | `/w/{slug}/copilot` | Generate, review, and apply AI proposals | Member; AI must be enabled |
| Automations | `/w/{slug}/automations` | Draft, test, activate, and inspect rules | Guest/member view; admin manage |
| Analytics | `/w/{slug}/analytics` | Review deterministic flow and portfolio metrics | Guest within scope |
| Settings | `/w/{slug}/settings` | Members, AI, billing, audit, and feedback | Role-dependent |

## Browser workflow scenarios

### 1. Public, authentication, and workspace entry

#### PUB-01 — Public product overview (UI)

- **Preconditions:** Signed out.
- **Steps:** Open `/`; traverse the header, product explanation, AI preview, and footer; follow the use-cases and roadmap links; activate the primary sign-in CTA.
- **Expected:** Content is readable without authentication; the AI card is clearly a preview and does not mutate data; early-development language is honest; links resolve; sign-in goes through the shared Hub authentication flow; keyboard focus remains visible.

#### PUB-02 — Auth-aware public navigation (UI)

- **Preconditions:** Repeat once signed out and once signed in.
- **Steps:** Open `/`, `/use-cases`, and `/roadmap`; inspect the primary CTA, app switcher, account menu, theme control, and skip link.
- **Expected:** Signed-out users see sign-in; signed-in users see an Open TasksAI action and account controls; theme persists across navigation; the skip link moves focus to main content; no workspace data appears on public pages.

#### PUB-03 — Use-case explorer (UI)

- **Steps:** Open `/use-cases`; select Notes to plan, Sprint planning, Daily focus, and Portable data in turn; use mouse and keyboard.
- **Expected:** Exactly one flow is selected; its steps and explanation update without navigation errors; controls expose selected state; all four flows remain informational rather than silently creating data.

#### AUTH-01 — Unauthenticated workspace protection (UI)

- **Steps:** While signed out, open `/workspace` and a known `/w/{slug}` URL directly.
- **Expected:** Both paths redirect to shared sign-in; the return path is preserved when supported; no protected HTML or tenant data flashes before redirect.

#### AUTH-02 — Workspace resolver states (UI)

- **Preconditions:** Test accounts with zero, one, and multiple workspaces.
- **Steps:** Open `/workspace` with each account.
- **Expected:** Zero workspaces shows creation; one workspace redirects directly; multiple workspaces show a chooser and creation form; inaccessible workspaces are absent.

#### AUTH-03 — Create workspace validation (UI)

- **Steps:** Submit blanks, malformed/duplicate slugs, then a unique name and slug; retry after a simulated server failure.
- **Expected:** Invalid submissions show actionable errors without creating data; duplicate state is handled deterministically; a valid workspace is created once and opens its Home; retry does not create duplicates.

#### AUTH-04 — Workspace and role isolation (UI)

- **Steps:** Open Workspace A as the outsider and attempt a Workspace A resource URL while authenticated in Workspace B.
- **Expected:** Access is denied with the product's safe not-found/forbidden behavior; no names, counts, search hits, notifications, or IDs from Workspace A leak in the response or UI.

### 2. Workspace shell and navigation

#### NAV-01 — Primary navigation and active state (UI)

- **Steps:** Visit Home, Inbox, My Work, Focus, Projects, Search, Automations, Copilot, Analytics, and Settings from the sidebar; refresh each route and use browser Back/Forward.
- **Expected:** The selected item is announced and styled correctly; refresh preserves the route; Back/Forward restores the expected surface; workspace slug remains stable; no stale page content is shown.

#### NAV-02 — Command palette navigation (UI)

- **Steps:** Press Ctrl+K on Windows/Linux or Cmd+K on macOS; type a partial destination; use Arrow Up/Down and Enter; reopen and press Escape.
- **Expected:** The palette opens, filters commands, maintains one active option, navigates on Enter, closes on Escape, restores focus, and never triggers the underlying page accidentally.

#### NAV-03 — Command-palette capture (UI)

- **Preconditions:** Member, then guest.
- **Steps:** As member, enter a title that is not a navigation match and choose capture; as guest, open the palette and search for capture.
- **Expected:** Member sees the Capture dialog prefilled with the query; guest sees no mutating capture command; typed text is not lost when the member enters the dialog.

#### NAV-04 — Shell permission variants (UI)

- **Steps:** Compare owner, admin, member, and guest shells.
- **Expected:** All roles can reach permitted read surfaces; guest has no global Capture button and no write-only command; administrative mutations remain unavailable to member/guest even if a URL is entered manually.

### 3. Home and first-run onboarding

#### HOME-01 — Empty-workspace onboarding (UI)

- **Preconditions:** Empty workspace, owner/member.
- **Steps:** Open Home; create the first project with blank, malformed, duplicate, then valid keys.
- **Expected:** Home explains the first step; the key must match the uppercase project-key rules; validation and conflict errors preserve input; one valid project advances the onboarding stage.

#### HOME-02 — First task and activation progress (UI)

- **Preconditions:** Workspace has one user project and no tasks.
- **Steps:** Create the first task from Home; refresh.
- **Expected:** Required title validation is clear; the task appears exactly once; the activation checklist/progress advances from project creation to task creation and survives refresh.

#### HOME-03 — Oriented returning-user dashboard (UI)

- **Preconditions:** Mixed task/project data and at least one AI proposal.
- **Steps:** Open Home; inspect metrics, Your next few, projects, latest proposal, and links to Inbox, My Work, Focus, import, and Copilot.
- **Expected:** Counts agree with source lists; completed/archived work is not presented as active; each link opens the correct workspace surface; the latest proposal state is accurate.

#### HOME-04 — Home with AI disabled (UI)

- **Preconditions:** Workspace AI kill switch off.
- **Steps:** Open Home and inspect contextual AI entry points.
- **Expected:** AI actions are hidden or disabled with an explanation; deterministic navigation and task work remain usable; no AI request is sent.

### 4. Global capture

#### CAP-01 — Capture to Inbox (UI)

- **Preconditions:** Member.
- **Steps:** Open Capture; enter a title and optional notes; leave destination as Inbox; submit; choose Open it.
- **Expected:** Title is required; success names Inbox as the destination; one untriaged task is created with capture provenance; Open it reaches the relevant work; the dialog can close cleanly.

#### CAP-02 — Capture directly to a project (UI)

- **Steps:** Choose `ALPHA`; enter title, notes, due date, and Assign to me; clear Review in Inbox; submit.
- **Expected:** Task is in `ALPHA`, assigned to the current user, due on the selected local date, and already triaged; it appears in the appropriate project and My Work group but not Inbox.

#### CAP-03 — Project capture that still needs review (UI)

- **Steps:** Choose `ALPHA`, enable Review in Inbox, and submit.
- **Expected:** The task belongs to `ALPHA` but remains untriaged and appears in Inbox; organizing it removes it from Inbox without changing its project.

#### CAP-04 — Repeated rapid capture and remembered destination (UI)

- **Steps:** Capture two tasks successively without reopening; close and reopen Capture; switch workspaces and reopen.
- **Expected:** Repeated capture resets task fields without duplicating submissions; the last valid project is remembered only for that workspace; a project inaccessible or deleted since the last use is not selected.

#### CAP-05 — Capture cancellation and failure recovery (UI)

- **Steps:** Enter data; close with Escape, backdrop, and Close in separate runs; simulate a 5xx/network failure and retry.
- **Expected:** Cancellation creates nothing; focus returns to the invoker; failure keeps recoverable input and shows an error; a successful retry creates one task.

#### CAP-06 — Capture authorization (UI)

- **Steps:** As guest, inspect shell/palette and attempt the create endpoint from the browser session.
- **Expected:** No capture UI is offered and the server rejects mutation; project/task data is unchanged.

### 5. Inbox triage

#### INB-01 — Inbox membership and pagination (UI)

- **Preconditions:** Untriaged open items plus triaged, completed, and archived controls; more than one page.
- **Steps:** Open Inbox and load older items.
- **Expected:** Only untriaged, incomplete, nonarchived items appear; source and missing project/owner/date context are visible; older pages append without duplicates or reordered selection.

#### INB-02 — Partial organization (UI)

- **Steps:** Change project, owner, and due date one at a time without choosing Organize.
- **Expected:** Each saved field updates; the item remains in Inbox while untriaged; version advances after each accepted edit; missing-field indicators update.

#### INB-03 — Organize and assign shortcuts (UI)

- **Steps:** Select one row and choose Organize; on another choose Assign to me.
- **Expected:** Organize stamps triaged and removes the item; Assign to me sets the current user and triages atomically; the resulting tasks appear in their project/My Work exactly once.

#### INB-04 — Complete and dismiss (UI)

- **Steps:** Complete one Inbox task and dismiss another.
- **Expected:** Complete sets completion state; Dismiss archives; both disappear from Inbox; neither action hard-deletes data; completed/archived states are reflected by direct API/detail reads where permitted.

#### INB-05 — Keyboard-only triage (UI)

- **Steps:** Use j/k and arrows to move, Enter to open detail, p/o/d to focus project/owner/date, t to organize, a to assign, c to complete, and x to dismiss.
- **Expected:** Selection and focus are always visible; shortcuts act only on the selected row and do not fire while typing in an input; destructive effects are announced; empty-list transition is understandable.

#### INB-06 — Concurrent triage conflict (UI)

- **Preconditions:** Open the same row in two sessions.
- **Steps:** Change and organize it in session A; submit a stale change in session B.
- **Expected:** Session B receives `conflict_version`, does not overwrite A, and explains that the item changed; reloading shows A's canonical state.

#### INB-07 — Guest Inbox (UI)

- **Steps:** Open Inbox as guest and inspect/open a visible item.
- **Expected:** Scoped items may be read; triage and mutation controls/shortcuts are absent or inert; detail permits only allowed collaboration.

### 6. My Work

#### WORK-01 — Assignment scope and exact grouping (UI)

- **Preconditions:** Current user has open, triaged, nonarchived tasks in every due/risk category, plus excluded controls.
- **Steps:** Open My Work and compare every row with fixture truth.
- **Expected:** Only tasks assigned to the current user appear; each appears exactly once in Overdue, Today, Blocked, Upcoming, or No due date; untriaged, completed, archived, and other-user tasks are excluded.

#### WORK-02 — Full-data summary and pagination (UI)

- **Preconditions:** More rows than the first page.
- **Steps:** Compare summary counts before and after loading more.
- **Expected:** Summary represents the full server result, not only rendered rows; loading more appends unique rows; group order and selection remain stable.

#### WORK-03 — Quick planning actions (UI)

- **Steps:** Use date picker, Today, Tomorrow, Next week, Assign/Unassign, and Open project on different rows.
- **Expected:** Dates use the user's local date and regroup immediately; assignment removes/adds the row appropriately; project navigation opens the correct project; optimistic state reconciles to server truth.

#### WORK-04 — Completion and gated completion (UI/External)

- **Steps:** Complete a normal task, then the Testora-gated task with an unsatisfied check.
- **Expected:** Normal task leaves the open list and summary changes; gated task remains open with a clear blocking reason; no client-only optimistic completion survives a rejected server response.

#### WORK-05 — Keyboard execution (UI)

- **Steps:** Use j/k, Enter, c, t/m/w, a/u, and p across rows and groups.
- **Expected:** Keyboard behavior matches visible actions; shortcuts do not fire inside inputs/dialogs; focus is preserved after a row disappears; the next logical row becomes selected.

#### WORK-06 — Empty and failure states (UI)

- **Preconditions:** Test no assigned work, all finished, work exists but belongs to others, and an API failure.
- **Steps:** Open/retry each state.
- **Expected:** Each empty state explains the distinct cause and relevant next action; failure is not presented as empty data; Retry refetches without a full-page crash.

#### WORK-07 — Stale plan edit and guest behavior (UI)

- **Steps:** Submit a stale row edit from a second session; repeat inspection as guest.
- **Expected:** Stale edit cannot overwrite newer work and prompts refresh; guest receives a read-only view and cannot invoke completion/planning endpoints.

### 7. Projects and task lifecycle

#### PROJ-01 — Project list and creation (UI)

- **Steps:** Open Projects; create with blank/malformed key, duplicate key, and a valid uppercase key/name.
- **Expected:** Inbox system container is not offered as a normal project; validation is specific; conflicts do not duplicate; valid project appears once; guest cannot create.

#### PROJ-02 — Project list view and quick add (UI)

- **Steps:** Open `ALPHA` List; quick-add blank then valid titles; open the created task.
- **Expected:** Blank submission is rejected; valid task appears once in project order; detail fetches that exact task rather than relying on a paged list snapshot.

#### PROJ-03 — Board workflow (UI)

- **Steps:** Switch to Board; complete an Open card with Done; inspect Done column and refresh.
- **Expected:** Open and Done columns reflect server completion state; completion persists; no hidden drag-and-drop capability is implied if it is not implemented.

#### PROJ-04 — Calendar and timeline (UI)

- **Steps:** Switch to Calendar and Timeline; compare dated tasks and undated controls.
- **Expected:** Dated tasks are ordered consistently by date; undated tasks are explicitly described as omitted; timezone conversion does not shift a date-only task to an adjacent day.

#### TASK-01 — Edit task fields (UI)

- **Steps:** Open detail; edit title and description and blur each; change owner and due date; close/reopen.
- **Expected:** Required title cannot become blank; blur autosave is visible and not duplicated; owner/due updates use scoped planning; reopened detail shows canonical values and updated version.

#### TASK-02 — Mark complete from detail (UI)

- **Steps:** Mark an open task complete and close detail.
- **Expected:** The task state updates in every active view and associated counts; repeat activation is idempotent or unavailable; a gated task follows WORK-04.

#### TASK-03 — Archive/delete confirmation (UI)

- **Preconditions:** Task with subtasks.
- **Steps:** Choose Delete; cancel once; confirm once.
- **Expected:** A styled, keyboard-accessible confirmation names the consequence; cancel changes nothing; confirm archives rather than irreversibly erasing and detaches subtasks according to contract; stale deletion is rejected.

#### TASK-04 — Concurrent field edit (UI)

- **Steps:** Open one task in two sessions; save different titles in sequence.
- **Expected:** First accepted write wins its version; second stale write receives a conflict and offers reload; no silent last-write overwrite occurs.

#### TASK-05 — Detail load/save failure (UI)

- **Steps:** Open an inaccessible/deleted task; simulate save failure on an existing task; retry or reload.
- **Expected:** Load failure is distinct from an empty detail; save error does not falsely claim success; unsaved input is recoverable where safe; canonical server value is clear after reload.

#### TASK-06 — Guest task detail (UI)

- **Steps:** Open a scoped task as guest; attempt edit, completion, assignment, due date, delete, and comment.
- **Expected:** Task fields are read-only with an explanatory hint; mutation controls are absent; comment reading/posting remains available; unscoped private tasks are not discoverable.

#### TASK-07 — Large-project behavior (UI)

- **Preconditions:** At least 220 tasks.
- **Steps:** Scroll each supported view, open late-list tasks, use keyboard navigation, and change a row.
- **Expected:** Virtualization/pagination keeps input responsive; no row duplicates or blank holes persist; selection, task identity, and edits remain correct after recycling rendered rows.

### 8. Comments, notifications, and realtime collaboration

#### COLLAB-01 — Comments (UI)

- **Steps:** Open task comments; submit blank/whitespace and valid plain-text comments; reload as another member and as guest.
- **Expected:** Blank comments are rejected; valid comment appears once with author/time; content is rendered as text, not executable HTML; permitted members and scoped guests can read/post; failures preserve draft text.

#### COLLAB-02 — Concurrent task and comment activity (UI)

- **Steps:** Keep task detail open in session A; edit/comment in session B; observe A, then refresh if necessary.
- **Expected:** Realtime or polling behavior updates without duplicating events; stale task edits still use version conflict protection; comments are not lost or attributed to the wrong actor.

#### COLLAB-03 — Notification bell (UI)

- **Preconditions:** Generate mention, assignment, comment, watched-change, and accepted-invite notifications.
- **Steps:** Observe unread badge; open bell; inspect up to 20 items; click outside; wait through a poll interval; reopen.
- **Expected:** Badge is accurate and caps visually at `9+`; opening marks displayed unread notifications read; supported kinds have understandable text; outside click closes; polling does not duplicate entries; loading failure does not crash the shell.

#### COLLAB-04 — Workspace scoping of collaboration (UI)

- **Steps:** Compare notification/comment data across Workspaces A and B; try direct IDs from the other tenant.
- **Expected:** Only current-workspace activity appears; cross-tenant IDs return safe denial; actor/task metadata from the other workspace never leaks.

### 9. Search and saved searches

#### SEARCH-01 — Empty and recent state (UI)

- **Steps:** Open Search with and without previous searches.
- **Expected:** Empty query shows a purposeful prompt or workspace-scoped recent searches; no all-tenant data is queried; recent chips rerun the exact query.

#### SEARCH-02 — Debounced multi-type search (UI)

- **Steps:** Type quickly, pause beyond 250 ms, and inspect task, project, comment, and label matches; then enter a no-result query.
- **Expected:** Obsolete responses do not replace newer results; type and useful context are shown; project hits navigate correctly; no-results is distinct from loading/error; task/comment results do not pretend to deep-link if no route is wired.

#### SEARCH-03 — Save, rerun, and delete query (UI)

- **Steps:** Search, save with a meaningful name, rerun the saved query, delete it, and refresh.
- **Expected:** Empty query cannot be saved; saved search persists and reproduces the exact query; delete removes only the selected saved search and persists.

#### SEARCH-04 — Search permissions and unsafe input (UI)

- **Steps:** Search as guest for terms present only in a private/unscoped project; enter punctuation, Unicode, and markup-like text.
- **Expected:** Results respect role/project scope; snippets are safely escaped; unusual input does not create syntax/server errors; no cross-workspace result appears.

### 10. CSV/JSON import

#### IMPORT-01 — Missing-project prerequisite (UI)

- **Preconditions:** No user project.
- **Steps:** Open Import.
- **Expected:** The wizard explains that a project is required and links to project creation; apply is unavailable.

#### IMPORT-02 — CSV dry run and apply (UI)

- **Steps:** Select CSV and project; paste a header and valid/invalid/duplicate rows; map required Title plus optional Description, Due, and External ID; run dry run; apply valid rows.
- **Expected:** Title mapping is mandatory; preview reports totals, valid, failed, duplicate, and first errors without writing tasks; Apply creates only accepted rows once; summary matches created data.

#### IMPORT-03 — JSON dry run and Inbox review (UI)

- **Steps:** Select JSON and Review imported rows in Inbox; dry-run a valid array with one malformed record; apply.
- **Expected:** Malformed rows are isolated and explained; accepted tasks land in the chosen project but remain untriaged in Inbox; imported provenance/external identity is retained.

#### IMPORT-04 — Preview invalidation (UI)

- **Steps:** Complete a dry run, then change kind, destination, mapping, review option, or content.
- **Expected:** Previous preview/apply eligibility is cleared on every material input change; stale rows cannot be applied under new settings.

#### IMPORT-05 — Idempotency and interrupted apply (UI/API)

- **Steps:** Trigger Apply twice and simulate an interrupted response before retrying.
- **Expected:** External IDs/content identity prevent duplicate task creation; apply is resumable/idempotent; malformed input causes no hidden partial batch writes; final counts reconcile.

### 11. AI Copilot proposal workflow

#### AI-01 — First-use education and intent selection (UI)

- **Steps:** Open Copilot without query context; inspect education; select Extract plan, Decompose task, Acceptance criteria, and Summarize discussion.
- **Expected:** Each intent explains the input/output; no task changes occur before explicit apply; examples populate editable source rather than immediately running a job.

#### AI-02 — Contextual task entry (UI)

- **Steps:** From task detail choose Break down task, then Draft acceptance criteria.
- **Expected:** Copilot opens with the correct intent and task-bound context; source is prefilled; the proposal can update/parent only within the resolved task scope; inaccessible task IDs are rejected.

#### AI-03 — Generate proposal with destination (UI)

- **Steps:** Enter source below minimum length, then valid source; choose destination project; repeat in a workspace with no project using destination creation where offered.
- **Expected:** Short/blank input is rejected locally; generation shows progress; valid response creates a proposal only—not tasks; destination is explicit; unavailable destination is handled before apply.

#### AI-04 — Evidence, uncertainty, and duplicate review (UI)

- **Preconditions:** Proposal contains create/update/link operations, citations, assumptions, open questions, low confidence, and duplicate suggestions.
- **Steps:** Expand every group and compare it with the source.
- **Expected:** Operations are grouped and understandable; source spans/quotes, confidence, assumption badges, open questions, and duplicates are visible; low-confidence assumptions default to unselected; no unsupported due date, assignment, message, or delete operation is proposed.

#### AI-05 — Selective review and inline edit (UI)

- **Steps:** Use Accept all, Untick all, per-operation selection, and edit a proposed create-task title.
- **Expected:** Selection state is exact; edited operations are visibly distinct and validated; unselected operations are not included in impact; original proposal remains auditable.

#### AI-06 — Apply confirmation and blast radius (UI)

- **Steps:** Apply a small unchanged selection; then apply a proposal with edits or more than 15 operations.
- **Expected:** Confirmation states exact creates/updates/links and destination; high-impact/edit case requires elevated confirmation; closing confirmation writes nothing; approved subset is applied exactly once.

#### AI-07 — Partial apply and post-apply navigation (UI)

- **Steps:** Apply only selected operations; use Inbox, Project, My Work, and Another proposal actions; submit trust/minutes-saved feedback.
- **Expected:** Only selected operations exist; proposal state records the decision; navigation reaches relevant results; feedback submission cannot alter task data and handles failure independently.

#### AI-08 — Reject and regenerate (UI)

- **Steps:** Reject a proposal; separately change the source and regenerate.
- **Expected:** Reject creates no task mutations and records proposal disposition; regenerate produces a new reviewable proposal rather than overwriting applied history; source remains editable.

#### AI-09 — AI disabled, exhausted, limited, and degraded (UI)

- **Preconditions:** Exercise kill switch, monthly budget exhausted, quota/rate limit, and provider failure/degraded response.
- **Steps:** Attempt generation from Copilot and contextual task actions in each state.
- **Expected:** Disabled state makes no provider call and points admins to settings; exhausted/limited states explain retry/administrative action; provider errors preserve source; degraded output is labeled and still requires review; deterministic task management remains available.

#### AI-10 — Proposal concurrency, authorization, and idempotency (UI/API)

- **Steps:** Apply the same proposal in two sessions; have a guest and outsider attempt generation/apply; alter destination access between generation and apply.
- **Expected:** Proposal applies once; repeat/stale apply is safe; guest/outsider cannot mutate; apply rechecks current workspace/project authorization; no cross-tenant references or partial unauthorized operations are committed.

### 12. Focus signals and analytics

#### INTEL-01 — Deterministic Focus ranking (UI)

- **Steps:** Open Focus with mixed fixtures; record order, score, and factors; refresh without data changes; change a due/blocker fact and refresh.
- **Expected:** Unchanged input produces unchanged order under `focus-rank@1`; factors explain rank; relevant data change predictably changes score/order; completed/archived tasks are absent.

#### INTEL-02 — Risk/workload signals and evidence (UI)

- **Steps:** Inspect due-date risk, blocker-chain, stale-work, and workload-imbalance cards.
- **Expected:** Every signal shows severity, confidence, freshness, rule version, limitations/alternatives, and evidence sufficient to inspect the source; no individual productivity, emotion, or hidden-person scoring is presented.

#### INTEL-03 — Signal feedback (UI)

- **Steps:** Submit Helpful, False alarm, and Wrong evidence on separate signals; retry one failed submission.
- **Expected:** Feedback is tied to the correct signal/version and workspace, acknowledged once, and does not silently change task state; failed submission can retry without duplicates.

#### INTEL-04 — Focus empty and scoped states (UI)

- **Steps:** Open with no eligible tasks and as a scoped guest.
- **Expected:** Empty state is clear; guest sees only allowed evidence/tasks; absence of permission-scoped data does not expose global counts.

#### ANALYTICS-01 — Flow metrics semantics (UI)

- **Steps:** Compare cycle-time p50, throughput/day, aging open, and predictability CV with fixture event data and `flow@1` definitions.
- **Expected:** Values are deterministic, labelled with units/window/semantic version, and agree with reproducible calculation; missing samples use honest unavailable/insufficient-data states.

#### ANALYTICS-02 — Portfolio and goals (UI)

- **Steps:** Inspect project open/overdue/health/forecast p80 and any goal progress; compare scoped roles.
- **Expected:** Project table is semantic and sortable/readable; forecast assumptions are disclosed; counts reconcile; goals show only when present; no individual ranking appears; guests see only scoped projects.

### 13. Automations

#### AUTO-01 — Draft a rule (UI)

- **Preconditions:** Admin.
- **Steps:** Create rules for task.created, status_changed, assigned, updated, and completed using comment, add label, due-in-days, assign, and set-status actions; try blank/invalid arguments.
- **Expected:** New rules begin in Draft; names/trigger/action arguments are validated; draft creation has no side effect on existing or new tasks.

#### AUTO-02 — Dry run (UI)

- **Steps:** Supply matching and nonmatching sample events; run a loop-risk sample.
- **Expected:** Dry run reports trigger match, conditions, whether it would run, planned actions, and loop risk; it creates no comments/labels/task changes and no normal execution run.

#### AUTO-03 — Activate, execute, and inspect (UI)

- **Steps:** Activate a safe draft; perform its triggering task event; open Runs.
- **Expected:** State changes to Active; one causal event produces expected actions within rate/depth limits; run log records outcome and causation without secrets; task mutation and notification behavior are correct.

#### AUTO-04 — Pause and resume (UI)

- **Steps:** Pause an active rule, trigger its event, inspect Runs; reactivate and trigger again.
- **Expected:** Paused rule performs no action; prior runs remain visible; reactivation affects only later events; state survives refresh.

#### AUTO-05 — Failure, recursion, and rate limit (UI/API)

- **Steps:** Cause an invalid-target action, a self-triggering chain, and events beyond `maxRunsPerHour`.
- **Expected:** Failed run is visible with safe error text; causation depth/loop guard stops recursion; rate limit prevents excess writes; unrelated rules and manual task work remain usable.

#### AUTO-06 — Automation permissions (UI)

- **Steps:** Compare admin, member, and guest; attempt direct mutations from unauthorized sessions.
- **Expected:** Nonadmins may view permitted rules/runs but cannot create, activate, pause, or dry run; server enforcement matches UI; outsider sees nothing.

#### AUTO-07 — Unsupported UI action clarity (UI)

- **Steps:** Inspect action choices for webhook delivery.
- **Expected:** The current browser editor does not claim webhook as an action when it is not offered there; webhook behavior is tested through the API/integration scenarios below.

### 14. Settings: members, AI, billing, audit, and feedback

#### SET-MEMBER-01 — Invite and revoke (UI)

- **Preconditions:** Admin.
- **Steps:** Invite invalid and valid emails as member/admin/guest; repeat a pending invite; revoke it.
- **Expected:** Validation and duplicate conflicts are actionable; valid invitation shows role and expiry; revocation removes only the target pending invite; no user becomes a member before acceptance.

#### SET-MEMBER-02 — Settings permissions (UI)

- **Steps:** Open Members as owner/admin/member/guest and attempt direct invite/revoke calls.
- **Expected:** Admin/owner controls work; member/guest see an admin-only/read-only explanation; server rejects unauthorized calls; member directory obeys private-project/tenant policy.

#### SET-AI-01 — AI policy settings (UI)

- **Steps:** As admin, toggle enabled, set/remove monthly budget, change max blast radius, provider, and model; enter invalid limits; repeat as member.
- **Expected:** Valid changes persist and immediately govern Copilot; numeric constraints are enforced; usage and configuration are not confused; member gets read-only state; disabling does not erase proposal audit history.

#### SET-BILL-01 — Usage transparency and closed gate (UI)

- **Steps:** Open Billing under closed commercial gate and with populated usage meters.
- **Expected:** Plan/status, estimated monthly amount when available, included/used/remaining/overage, and cost driver are understandable; closed gate is explicit; no nonfunctional purchase promise/button is presented; only current workspace usage appears.

#### SET-AUDIT-01 — Audit browse, filter, and export (UI)

- **Steps:** As admin, filter by event, clear filter, export CSV, and compare rows to recent task/admin/AI actions; repeat as member.
- **Expected:** Filter is exact/predictable; event, actor type, target, time, and safe metadata are shown; CSV matches scoped results and safely quotes fields; secrets/raw sensitive payloads are absent; member cannot access audit data.

#### SET-FEEDBACK-01 — Submit product feedback (UI)

- **Steps:** As each workspace role, submit blank and valid title/detail with severity; simulate failure.
- **Expected:** Required fields are enforced; valid feedback appears once with source/state/respond-by data; failure preserves text; submission does not grant access to admin triage.

#### SET-FEEDBACK-02 — Admin feedback triage (UI)

- **Steps:** As admin move an item through supported states and link/change fields where offered; repeat as member.
- **Expected:** State transition persists and is auditable; only the selected item changes; member cannot triage; concurrent stale changes do not silently overwrite.

## API, integration, and governance workflows without a complete browser UI

These scenarios are part of the implemented product contract but should be run with API/integration harnesses. They must not be described to an end user as current clickable UI unless a corresponding surface is added.

### 15. Membership lifecycle and collaboration contracts

#### API-MEMBER-01 — Invitation acceptance (API)

- Create an invitation as admin, accept its token as the invited identity before expiry, and list membership.
- Expect the exact role to be added once, an invite-accepted notification/audit event, and token replay to fail safely. Wrong identity, expired, revoked, and cross-workspace tokens must fail without membership change.

#### API-MEMBER-02 — Revoke member (API)

- As authorized admin/owner, revoke a normal member; attempt self/last-owner and unauthorized revocation cases.
- Expect invariants to preserve workspace ownership, access to end immediately, sessions/API calls to reauthorize, and an audit event without deleting authored history.

#### API-COLLAB-01 — Watchers, mentions, and realtime (API/External)

- Add/remove task watchers, post comments containing valid/invalid mentions, and consume the SSE stream while task/comment events occur.
- Expect notification fan-out once per eligible recipient, no notification to inaccessible identities, ordered/deduplicable realtime events, reconnection support, and workspace authorization on stream establishment.

#### API-COLLAB-02 — Attachment metadata boundary (API/Planned gap)

- Verify metadata routes and authorization if enabled; confirm that the product does not claim a complete upload/download workflow while object-storage wiring is absent.
- Expect filenames/types/sizes to be sanitized and scoped; executable content must never render inline without a safe policy.

### 16. Portability and capture integrations

#### API-PORT-01 — Workspace export (API)

- As admin, export CSV and JSON with mixed projects/tasks/comments and non-ASCII text; repeat as member/outsider.
- Expect stable schemas, correct quoting/encoding, only authorized workspace data, no secrets, and denied unauthorized export. Compare row counts and relationships with source data.

#### API-PORT-02 — Deletion manifest and data-subject workflows (API)

- As owner, request/preview deletion manifest, exercise user data export and deletion under retention/legal-hold variants, and retry idempotently.
- Expect explicit affected-resource counts, owner-only authorization, retained audit/legal-hold records to follow policy, no other tenant impact, and a durable audit trail.

#### API-CAPTURE-01 — Inbound email capture (External)

- Send valid signed/provider-authenticated inbound email, duplicate delivery, malformed sender/workspace mapping, oversized content, and spoofed requests.
- Expect one provenance-labelled Inbox item for valid mail, idempotent duplicate handling, safe plain-text extraction, and rejection without tenant discovery for invalid input.

#### API-CAPTURE-02 — GitHub issue ingestion (External)

- Configure a scoped GitHub integration; ingest create/update/duplicate/out-of-order issue events and invalid HMAC payloads.
- Expect read-first, scoped synchronization; stable external identity; no duplicates; signature rejection; no write-back or broader repository access unless explicitly configured.

### 17. API tokens, webhooks, and automation integrations

#### API-TOKEN-01 — Token lifecycle and scopes (API)

- Create a least-privilege token, use allowed and disallowed endpoints, rotate/revoke it, and test expiry and cross-workspace IDs.
- Expect the secret to be shown only at creation, stored hashed, scopes enforced server-side, revoked/expired use denied, rate/meter accounting, and audit events with no token secret.

#### API-WEBHOOK-01 — Delivery signing and retries (API/External)

- Register a webhook, trigger an event, verify signature/timestamp/event ID; return 5xx then success; replay and reorder deliveries; disable endpoint.
- Expect bounded retries/backoff, stable event identity for receiver deduplication, signed payloads, secret rotation support, safe logs, no retry on permanent disable, and workspace-scoped event data.

#### API-AUTO-01 — Webhook automation action (API/External)

- Create/dry-run/activate a webhook action through the API and trigger it under loop/rate limits.
- Expect dry run not to send externally; active execution delegates to the signed delivery mechanism; failures are visible in rule runs; webhook callbacks cannot recursively bypass causation depth.

### 18. Testora completion contract

#### TESTORA-01 — Provision tests from a task (API/External)

- Provision from an authorized task with acceptance criteria, repeat idempotently, and try guest/outsider/cross-workspace task IDs.
- Expect a stable TasksAI↔Testora link, no duplicate suite/case creation on retry, correct source metadata, and strict authorization.

#### TESTORA-02 — Regression, flake, run, check, and greenlight events (External)

- Send correctly signed events for all supported types, duplicates, stale/out-of-order events, unknown links, invalid signatures, and excessive payloads.
- Expect HMAC verification, idempotent event processing, freshness/source display in check data, safe rejection, and no automatic task completion.

#### TESTORA-03 — Completion gate and override (API/External)

- Attempt completion with failed/pending/stale and satisfied greenlights; as admin apply an override with reason; repeat as member.
- Expect unsatisfied gates to block completion, satisfied gate to allow it, admin override to require a reason and be audited, member override denial, and Testora outage to fail safely under documented policy.

### 19. Beta, billing, and enterprise contracts

#### BETA-01 — Enrolment, consent, metrics, and decision (API)

- Enrol a workspace as owner, capture member consent/withdrawal, generate representative events, read beta metrics, and submit the decision contract.
- Expect no beta instrumentation before required consent, withdrawal to stop future optional collection, metrics to use documented definitions without invented customer claims, and owner/admin authorization per route.

#### BILL-01 — Commercial gate and subscription lifecycle (API/External)

- With the gate false, attempt checkout; with an authorized test configuration, create checkout, process signed Stripe test webhooks, view invoice state, and cancel; replay/out-of-order events and repeat as nonowner.
- Expect hard denial while closed, owner-only lifecycle control, webhook signature/idempotency, entitlement changes only from trusted state, transparent usage, and no live-money charge in tests.

#### ENT-01 — Domain claim and verification (API/External)

- Claim a domain, prove ownership, retry proof, attempt a conflicting tenant claim, and remove/expire verification.
- Expect ownership proof before activation, globally unique active claim, no domain-user takeover from unverified claims, and auditable lifecycle.

#### ENT-02 — SCIM and service accounts (API/External)

- Provision/update/deactivate users and groups with duplicate/out-of-order SCIM requests; create scoped service account credentials, rotate, revoke, and test least privilege.
- Expect idempotent directory reconciliation, role/last-owner safeguards, immediate deprovisioning, nonhuman actor labels in audit, secret-once behavior, and tenant isolation.

#### ENT-03 — Retention, legal hold, and audit stream (API/External)

- Configure retention, place/release a legal hold, run deletion/expiry, and stream audit events to a receiver that fails and recovers.
- Expect held records not to purge, release to resume policy, immutable governance audit, signed/scoped export, bounded retry with no event loss/duplication beyond documented at-least-once semantics, and no unsupported compliance-certification claim.

## Cross-cutting test passes

Run these passes against every applicable UI scenario, not only once per release.

### Permission matrix

| Capability | Owner | Admin | Member | Guest | Outsider |
| --- | --- | --- | --- | --- | --- |
| Read scoped workspace/project/task | Yes | Yes | Yes | Yes, scoped | No |
| Create/edit/complete/archive task | Yes | Yes | Yes | No | No |
| Comment on scoped task | Yes | Yes | Yes | Yes | No |
| Create project/import/use Copilot | Yes | Yes | Yes | No | No |
| Manage invitations, AI, rules, audit, feedback triage | Yes | Yes | No | No | No |
| Destructive governance, subscription, enterprise owner actions | Yes | Route-dependent | No | No | No |

For every hidden UI control, also assert the backing endpoint rejects an unauthorized direct request. UI hiding is not authorization.

### Error and recovery matrix

For each mutation, cover:

1. Client validation failure: no request and no data change.
2. `401`: return to sign-in without leaking the attempted resource.
3. `403/404`: safe denial with no tenant enumeration.
4. `409 conflict_version`: preserve newer server state and offer reload/retry.
5. `429`: explain throttling and prevent rapid duplicate retry.
6. `5xx`/network loss: do not claim success; preserve safe input; idempotent retry.
7. Slow/out-of-order responses: newest query/state wins; controls expose busy state.
8. Double-click/reload during submission: at most one logical mutation.

### Accessibility and keyboard pass

- Start at 200% zoom and 320 CSS-pixel width; verify no required control or content is lost in two dimensions.
- Traverse every page without a pointer. Check skip link, landmarks, heading order, labels, error association, visible focus, logical tab order, and focus restoration.
- Verify dialogs trap focus, have an accessible name, close with Escape where safe, and return focus to the invoker.
- Verify async success/error and row-removal changes use appropriate live announcements without chatter.
- Verify color is not the only carrier for status, severity, confidence, selected state, or overdue state; contrast remains sufficient in both themes.
- Enable reduced motion. Verify no essential meaning depends on animation.
- Screen-reader check the analytics table, virtualized lists, notification menu, command palette, proposal operation selection, and confirmation dialogs.
- Track existing documented gaps: automated axe CI, board roving-tab behavior, and translated accessible names are not yet exit evidence.

### Responsive, localization, and date/time pass

- Exercise phone, tablet, desktop, long names/titles, multiline descriptions, Unicode, RTL-like strings, and 200% zoom.
- Test daylight-saving boundaries and users in at least UTC-08, UTC, and UTC+10. A date-only due date must not shift days.
- Test `en`, `nl`, and `fr` locale selection only to the degree currently implemented. Record remaining English UI as a gap rather than passing it based on documentation alone.
- Use locale-specific number/date formatting for analytics and billing while keeping exported/API schemas stable.

### PWA/offline pass

- Load once online, then navigate cached shell/read surfaces offline and distinguish cached/stale data from live truth.
- Queue an allowed mutation offline, reconnect, and verify one replay; create a server-side version change before reconnect and expect a visible 409 conflict instead of overwrite.
- Verify sign-out/tenant switch clears or namespaces sensitive caches and queued work.
- Verify service-worker update does not strand an incompatible shell/API version and provides a recoverable refresh path.

### Performance and scale pass

- Measure production builds against `performance-budgets.md`: p75 web vitals, per-route JS, API/query budgets, and offline behavior.
- Use the 220-task fixture to prove virtualization and bounded rendering; use high comment, notification, audit, search, and automation-run counts for pagination.
- Confirm typing remains responsive in Capture, Search, task detail, Import, and Copilot under slow network/CPU.
- Confirm no N+1 user/project lookups or unbounded tenant scans appear at the browser/API boundary.

### Security and privacy pass

- Attempt stored/reflected HTML and script payloads in every free-text field and imported value; render as safe text.
- Verify CSRF/session policy on mutations, request-size limits, upload/provider signature checks, rate limits, and secret redaction.
- Repeat object-ID substitution across workspaces for every detail/mutation endpoint.
- Verify audit records for privileged, destructive, AI-apply, override, token, webhook, billing, and enterprise operations.
- Verify AI source and output follow the documented provider/data-processing boundary and that the kill switch prevents provider traffic.

## Current automated coverage and recommended order

The existing Playwright suite covers only:

- public landing and health smoke;
- anonymous workspace redirect;
- one create-project/create-task/complete path;
- basic Home orientation;
- a basic My Work path; and
- command-palette navigation.

`workspace.spec.ts` is skipped unless fixture environment variables are present. Treat it as conditional coverage, not a guaranteed CI gate.

Automate in this order:

1. **P0 data safety:** AUTH-04, INB-06, WORK-04/07, TASK-03/04/06, AI-06/10, IMPORT-05, AUTO-05/06, and all Testora signature/gate tests.
2. **P0 core journey:** AUTH-02/03 → HOME-01/02 → CAP-01/02 → INB-02/03 → WORK-01/03/04 → TASK-01/02.
3. **P1 AI trust:** AI-01 through AI-09, including disabled/degraded paths and exact selective apply.
4. **P1 collaboration/admin:** COLLAB-01/03, SET-MEMBER, SET-AI, SET-AUDIT, notification and invitation integration tests.
5. **P1 portability/automation:** SEARCH, IMPORT, AUTO, export, token, webhook, and inbound capture workflows.
6. **P2 breadth:** view variants, analytics semantics, beta/billing/enterprise contracts, offline, localization, and sustained scale.

For browser automation, use role-specific saved authentication states and API-created fixtures, but perform the behavior under test through the UI. Assert both the visible outcome and a scoped server read after important mutations. Keep provider-dependent suites tagged and run deterministic fakes in pull requests, with signed sandbox-provider tests in a scheduled environment.

## Known product/documentation gaps to record during testing

The repository contains implementation and documentation through M15 contracts, while the app README currently characterizes the shipped UI primarily through M07. Test reports should identify the commit and distinguish implemented UI from API-only and planned work.

Do not mark these as passing browser workflows without additional implementation evidence:

- proposal undo exists in the client/API contract, but a complete visible post-apply undo journey is not evident in the current Copilot UI;
- watcher management, notification preferences, member revocation, exports/deletion, tokens, webhooks, beta, subscription lifecycle, and enterprise controls are API-first rather than complete Settings UI;
- webhook is supported by the automation platform contract but is not offered by the current browser rule-action picker;
- attachment metadata exists, while full object-storage upload/download wiring is explicitly incomplete;
- task hierarchy/dependency visualization, labels/custom fields, recurrence, templates, bulk actions, and full drag-and-drop planning should not be inferred from roadmap language;
- search task/comment results lack a complete detail deep-link journey in the current component;
- full `en`/`nl`/`fr` UI localization and translated accessible names require verification and are not established by docs alone;
- accessibility documentation lists automated axe coverage and board keyboard behavior as open gaps;
- performance and enterprise scale numbers remain budgets/targets until measured on a production-like test cut.

When a scenario exposes one of these gaps, report it as **not implemented**, **partially implemented**, or **documentation drift** rather than as a generic test failure. That keeps release quality separate from roadmap scope.

## Release evidence template

For each run, record:

- build commit, environment, browser/device, locale/timezone, test identity/role, and fixture revision;
- scenario ID and status: Pass, Fail, Blocked, Not implemented, or Not applicable;
- expected versus actual result, reproducible steps, screenshot/video/log correlation ID, and affected workspace/resource IDs with secrets removed;
- whether data was created, changed, archived, or externally delivered, plus cleanup outcome;
- severity: P0 tenant/data/security, P1 core workflow/trust, P2 degraded edge/accessibility, or P3 cosmetic;
- linked defect and rerun evidence.

A release candidate is not ready when any P0 scenario fails, tenant isolation is unverified, the commercial gate behaves contrary to configured policy, AI can mutate without explicit reviewed approval, or Testora completion gates can be bypassed without an authorized audited override.
