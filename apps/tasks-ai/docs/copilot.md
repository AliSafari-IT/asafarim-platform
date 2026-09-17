# TasksAI — AI copilot from intent to approved plan (M07)

Builds the review UX on top of the M06 boundary. The human stays the author.

## Flow (guided since issue #368)

`/w/{slug}/copilot` walks four visible steps, all decided by the pure model
in **`lib/ai/workflow.ts`** (framework-free, unit-tested in
`lib/ai/workflow.test.ts` — same convention as `lib/home/state.ts` and
`lib/work/my-work.ts`):

1. **Source** — paste meeting notes, a brief, a transcript, rough
   requirements. Examples are offered instead of a blank textarea, and the
   source stays on screen during review so proposal claims can be checked
   against it.
2. **Intended outcome** — the intents in plain language (`COPILOT_INTENTS`):
   turn notes into a project plan / break a task into concrete steps / draft
   acceptance criteria / summarize a discussion / surface risks and open
   questions / write a project brief / summarize what changed (issue #233) /
   check an existing task for duplicates elsewhere in the workspace (issue
   #234). Intents map 1:1 to AI kinds via `kindForIntent()`.
3. **Destination** — `destinationState()`. A workspace with no projects never
   gets a mysteriously disabled button: a member is offered an inline
   "create a project" form (a normal user action, *not* part of any
   proposal), and a guest is told who can create one.
4. **Generate → review → approve.** `generateBlock()` gives the plain reason
   the button is unavailable whenever it is; `GENERATE_EXPECTATION` sets the
   expectation before the call. Generating streams over SSE (issue #236,
   `api.runAiJobStream` in `lib/client/api.ts`): text and drafted operations
   appear as the provider round trip progresses, with a Stop button that
   cancels the call server-side and leaves no Proposal. A stream that dies
   before its terminal event falls back to the plain `POST .../ai/jobs`
   call automatically — safe to retry, since an identical input the stream
   *did* manage to persist is served back from the job cache rather than
   duplicated (`lib/ai/job.ts`).

### Contextual entry points

`copilotHref(slug, { intent, taskId, from })` builds every link, so no
surface hand-rolls a query string. Entry points live on the workspace Home,
the Inbox empty state, Projects and a project's empty state, the global
Capture dialog, and a task's detail drawer ("Ask Copilot" → break into
subtasks / draft acceptance criteria, seeded with that task). Every one of
them routes through this same proposal pipeline — there is no second,
quieter mutation path. All are gated on the workspace AI kill-switch, which
the workspace layout reads once and carries on the shell context
(`useWorkspace().aiEnabled`).

### First-use education

`FIRST_USE_CALLOUT` — "Copilot never edits your workspace directly" —
dismissible, remembered per browser under `FIRST_USE_STORAGE_KEY`. Not a
permanent tutorial.

- **Proposal diff** (`components/ai/ProposalDiff.tsx`, logic in
  `lib/ai/diff.ts` and `lib/ai/workflow.ts`): operations grouped
  **create / update / link**. Per-item accept toggle (partial accept), inline
  title edit, a **From your notes** / **Assumption** badge with the
  confidence % (`evidenceFor()`), and the actual cited passage of the source
  underneath (`evidenceText()`). Intra-proposal duplicate hints from
  `duplicateHints()`. The model's unresolved questions render above the
  groups (`Proposal.openQuestions`, migration
  `20260914160000_proposal_open_questions`).
- **Default acceptance** (`defaultAccepted()`): low-confidence assumptions
  start **unticked** and `defaultAcceptanceNotice()` says so, so a
  high-impact guess is never approved by inattention.
- **Impact before commit**: `impactSentence()` — "This will create 7 tasks,
  2 subtasks and 3 dependencies in WEB · Website redesign." — plus
  `inboxLandingSentence()`, then a styled `ConfirmDialog`. Never
  `window.confirm` (platform rule).
- **Apply**: `POST .../ai/proposals/{id}/apply` with the selected indices and
  (when edited) the edited operations. >15 ops or any edit → `?confirm=high`
  (elevated confirmation, ADR-0004). Transactional, captures an undo plan.
- **After apply** (`postApplyOutcome()`): what happened in verifiable counts
  plus the ways onward — triage the new work / review in the project / go to
  My Work / draft another. Applied tasks arrive with no owner and no date
  (AI may set neither), so they wait in the Inbox per `lib/capture/inbox.ts`
  — the outcome says so rather than leaving the user to discover it.
- **Regenerate / Reject / Undo**: reject changes nothing and records
  `outcome: "rejected"` feedback; undo replays the inverse plan.
- **Feedback** (`lib/ai/feedback.ts`): after apply, a quick trust (1–5) +
  minutes-saved prompt. `POST .../ai/proposals/{id}/feedback` also takes
  `editDistance`, `correctionReason`, `outcome`.

## Metrics (`GET .../ai/metrics`)

30-day aggregate for the KPI dictionary: proposals generated / applied,
acceptance rate, avg edit distance (`lib/ai/diff.ts` `editDistance`, 0 =
applied verbatim), avg time saved, avg trust, cost, and the list of
correction reasons.

## Guardrails (unchanged from M06, enforced structurally)

AI never auto-sends messages, deletes records, assigns people, or changes
committed dates — those operations do not exist in the schema. Every
generated fact links to a source span or is flagged an assumption.
Regeneration re-submits the (never-stored-verbatim) input.

## Degraded and disabled states

`providerNotice()` keeps the offline-fallback warning visible and explains
the consequence ("leans much harder on assumptions"). `aiDisabledState()`
explains the kill switch and links to AI settings **only** for a role that
could actually change it (`isAtLeast(role, "admin")`, mirroring the
`customfield.manage` gate `updateAiSettings()` enforces). The rest of
TasksAI is fully usable with AI off, and no AI affordance is rendered at
all in that state.

## Analytics

Funnel events in `lib/client/telemetry.ts`: `copilot.opened`,
`copilot.source_added`, `copilot.proposal_generated`,
`copilot.proposal_reviewed` (fires on the first real review interaction, not
merely on render), `copilot.proposal_partially_applied`,
`copilot.proposal_applied`, `copilot.proposal_rejected`,
`copilot.result_opened`. These sit alongside the existing
`workspace.activation.first_proposal_*` events, which measure the *first*
proposal in a workspace once; these measure every walk of the funnel.

## Schema

`ProposalFeedback` (migration `20260906001808`): outcome, editDistance,
timeSavedMin, correctionReason, trust.

`Proposal.openQuestions` (migration
`20260914160000_proposal_open_questions`): nullable JSON; the draft's
`openQuestions` used to be discarded at persist time, so review could never
show what the model was unsure about.
