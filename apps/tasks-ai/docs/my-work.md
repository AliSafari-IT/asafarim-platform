# My Work — the daily execution view

> Issue #367. Implementation: `lib/work/my-work.ts` (the pure planning
> model), `lib/work/service.ts` (the query, the counts, the quick edit),
> `components/tasks/MyWork.tsx` (the view),
> `app/api/v1/workspaces/[slug]/my-work/route.ts`.

## The job

The product charter promises: *"when I plan the week, see everything that's
mine, what's overdue, and what's blocked — across projects — in one place."*
My Work is that place. Its mental model is **everything I am responsible
for, organized so I know what to do next**.

It is one of four surfaces that must stay distinct:

| Surface  | Question it answers                          |
|----------|----------------------------------------------|
| Inbox    | What still needs organizing?                 |
| My Work  | What am I responsible for, and when?         |
| Projects | What is the team doing, in context?          |
| Focus    | What deserves my attention first, and why?   |

My Work does **not** rank. Focus is the explainable prioritization layer and
stays its own page — My Work links to it ("Need help prioritizing? Open
Focus") rather than quietly folding scoring into a list, so a user always
knows whether they are reading their own list or a machine's opinion.

## What is in the list

```
assigned to me  ∧  not completed  ∧  triagedAt IS NOT NULL  ∧  not archived
```

The `triagedAt` clause is the Inbox rule (see `capture-inbox.md`): an
untriaged capture is Inbox work, not planned work, even when it already has
your name on it.

Guests stay limited to projects they belong to, like every other read.

## Grouping

Every open row lands in **exactly one** section — the view never shows the
same task twice.

| Section     | Rule                                            | Sort                         |
|-------------|-------------------------------------------------|------------------------------|
| Overdue     | due date before today (UTC)                     | oldest due date first        |
| Today       | due today                                       | due date, then position      |
| Blocked     | blocked by an open task, and not overdue/today  | nearest due date, undated last |
| Upcoming    | dated, in the future                            | nearest due date first       |
| No due date | no date, not blocked                            | most recently updated first  |

Time pressure beats waiting: an overdue *and* blocked task stays in Overdue,
badged "Blocked by N", rather than disappearing into a section people read
as "not today's problem". Blocked therefore collects the undated and future
work that is waiting — exactly the work that would otherwise look actionable
and is not.

Every comparator ends on `id`, so an unrelated update can never make rows
swap places. A list you plan a day from has to render the same way twice.

Dates are UTC calendar midnights, matching how an HTML date input's value is
stored — the same convention as `lib/home/service.ts`. Server-local midnight
plus 24h misclassifies on non-UTC servers and across DST.

## Row context

Title, project key + name (a link to the project), due state in words
("Today", "3 days late"), status, `Blocked by N` / `Blocks N`, labels, and a
warning badge when a row is no longer yours or still sits in the Inbox
container. Enough to tell two identically titled tasks from different
projects apart — not a dense Jira record.

Mobile stacks the same information rather than dropping it: section
hierarchy, title, project identity, due state, completion, and details all
survive the narrow layout.

## Actions

From the row: complete, open details, pick a date, **Today / Tomorrow / Next
week**, assign to me / unassign, open the project. Keyboard:

```
j / k   move            Enter  details      c  complete
t       due today       m      due tomorrow w  due next week
a       assign to me    u      unassign     p  open the project
```

Date and owner changes go through `POST /tasks/{id}/plan`
(`planTask`). That endpoint is deliberately *the same semantics as triage* —
the same assignee validation, the same `If-Match` optimistic concurrency,
the same activity events, the same `lockTaskRow` serialization — rather than
a second, incompatible editing path. The one difference: it never stamps
`triagedAt`, because a row in My Work has already been organized. The task
detail drawer gained an owner picker that calls the same endpoint, so the
two surfaces cannot disagree about what assigning means.

## Empty states

"No tasks match the view" is the one answer this page may never give. The
three empty conditions mean different things:

* **Nothing assigned yet** → capture a task, or browse projects.
* **Everything finished** → a positive state, not an error.
* **Work exists but none is yours** → explains that My Work lists only what
  is assigned to you, and points at Projects and the Inbox. A guest is not
  offered actions their role cannot take.

`emptyStateFor()` picks between them from the counts the API returns
alongside the rows (`meta.counts`).

## Performance

Rows are cursor-paginated in execution order (earliest due first, undated
last), so the first page is always the most urgent work. Grouping happens
over everything loaded so far — never per page — and a section past
`VIRTUALIZE_THRESHOLD` rows switches to windowed rendering
(`docs/performance-budgets.md`).

Windowing costs something, and the cost is stated rather than hidden: rows
outside the rendered window are not in the DOM, so a screen reader cannot
reach them by browse-mode exploration or Tab. What is guaranteed is the
keyboard path — `j`/`k` move the cursor, the window follows it, the cursor's
row is kept mounted even when the window has scrolled past it, and real DOM
focus lands on that row (roving tabindex), so assistive technology announces
it the ordinary way. Reaching every row by free browse alone would need a
paginated non-windowed mode or a virtualizer with a full ARIA grid navigation
model; that is follow-up work, not something this page currently claims.
