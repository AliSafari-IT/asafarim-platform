# Capture and the Inbox

> Issue #366. Implementation: `lib/capture/inbox.ts` (the rule),
> `lib/capture/service.ts` (Inbox container + triage),
> `components/capture/CaptureDialog.tsx` (capture),
> `components/tasks/InboxTriage.tsx` (triage).

TasksAI's charter is *"when a call or brief ends, capture the resulting work
in seconds so nothing depends on memory."* That promise needs two things the
product did not have: a capture action you cannot miss, and somewhere for
captured work to wait.

## The workflow

```
Capture (seconds, title only)
      ↓
Inbox  (captured, not organized yet)
      ↓  triage: project / owner / date
My Work, projects, Focus  (planned work)
```

* **Inbox** — captured work that still needs organizing.
* **My Work** — planned open work assigned to me (see `my-work.md`).

They are different questions, so they are different queries. An item does not
sit in the Inbox forever just because it is incomplete, and an untriaged item
does not appear in My Work just because it has your name on it.

## The rule

A task is in the Inbox when, and only when:

```
triagedAt === null && completedAt === null && archivedAt === null
```

`triagedAt` is a persisted, nullable column on `task` (migration
`20260913120000_capture_inbox_triage`). Existing rows were backfilled to
`createdAt`, so enabling this did not dump entire workspaces into the Inbox.

Triaging stamps `triagedAt` and the item leaves the Inbox permanently.
Completing or archiving it also removes it — both are legitimate triage
outcomes ("do it now", "never mind").

## Where captured work goes

Capture requires only a title. It never silently picks a project.

* **No project chosen** → the workspace **Inbox container**: a real project
  row flagged `project.isInbox`, created on demand. Keeping `task.projectId`
  NOT NULL means every existing query, export, and analytic kept working.
* **A project chosen** → that project. The dialog shows the destination
  before you save and names it after you save, and remembers your last
  choice per workspace (visible, and changeable in the same dropdown).

`needsTriage()` in `lib/capture/inbox.ts` is the single decision point for
every channel:

| Channel | Lands in Inbox? |
|---|---|
| Capture / command palette, no project | yes |
| Capture / command palette, project chosen | no (choosing the project *is* the decision) — unless "still review it in the Inbox" is ticked |
| Capture-by-email | always (nobody was there to decide) |
| Import | no, unless the import was created with `captureToInbox: true` |
| GitHub integration | always |
| Applied AI proposal | only when the applied task has neither an assignee nor a due date |

## Copilot / AI

Nothing enters the work graph until a human applies a proposal — that is the
AI boundary (`docs/adr/0004-ai-proposal-model.md`) and it is unchanged.
Applying is not the same as *planning*, though: an applied task that arrives
with no owner and no date still needs human resolution, so it lands in the
Inbox instead of quietly posing as planned work. A proposal applied with
explicit planning context is triaged immediately.

## Provenance

`task.source` is preserved and sharpened: `manual`, `quick_capture`,
`import`, `proposal`, plus `email` and `integration`, which used to be
indistinguishable from a CSV import. The triage list shows the source as a
small badge — enough for trust and debugging, not enough to dominate the
interface. Existing rows keep the value they were written with.

## Permissions

Capture and triage both need the `member` role (`task.create` /
`task.update` in `lib/authz.ts`). Guests can read the Inbox for projects they
belong to — scoped like every other read — but the Capture action is hidden
for them and the API refuses with `forbidden`.

## Keyboard

Triage is a pass down a list, not a form per item:

```
j / ↓  next        t  organize (leave the Inbox)
k / ↑  previous    a  assign to me
Enter  details     c  complete        x  dismiss
p / o / d  jump to the project / owner / due-date field
```

⌘K still opens the command palette, and its capture command now opens the
same dialog — the palette never writes a task itself, which is what makes
"silently create it in `projects[0]`" structurally impossible.
