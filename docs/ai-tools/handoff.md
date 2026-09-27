# AI Workbench handoffs

Part of [#678](https://github.com/AliSafari-IT/asafarim-platform/issues/678). How a reviewed result moves
from a public tool into Testora, TasksAI, or TimelineAI.

## Decision: file handoff, no server-side token (MVP)

A server-held, single-use handoff token would need a store shared by Web and the three
destinations (each with its own database), encryption at rest, expiry sweeps, and a
cross-app redirect protocol. That's disproportionate for the MVP, so we ship the issue's
documented safe fallback, with the same guarantees where they matter:

1. **The visitor chooses exactly what moves.** "Continue in <app>" builds the file from the
   current selection (selected scenarios, selected tasks and the links between them,
   accepted events) in the browser.
2. **Nothing travels in a URL.** The link to the destination is a fixed path
   (`<app>/import/workbench`) with no content, id, or query derived from the result. The
   result is only in the file the visitor chooses to upload.
3. **Web stores nothing.** No handoff record, no token, no copy of the result on the server.
4. **Sign-in happens in the destination, only if needed.** Anonymous Web sessions can't
   create or edit anything in another app; every import endpoint requires a signed-in user
   (and, in Testora, an admin to confirm).
5. **The destination validates twice.** Once with the shared contract
   (`@asafarim/tool-handoff`), once with its own schema, then again on confirm (the
   preview is never trusted).
6. **Preview shows exactly what will be created; cancel writes nothing.**
7. **Import is idempotent** per handoff id and audited without copying content into audit
   fields.

A token handoff can replace the file later without changing the payload contracts.

## Contract (`packages/tool-handoff`)

```jsonc
{
  "handoffVersion": "asafarim-handoff/1",
  "handoffId": "<random UUID, minted in the browser>",
  "createdAt": "…", "expiresAt": "… (+7 days)",
  "source": { "app": "web", "tool": "<slug>", "toolVersion": "1.0.0", "schemaVersion": "<tool schema>" },
  "destination": "testora" | "tasksai" | "timelineai",
  "payloadVersion": "testora-scenarios/1" | "tasksai-tasks/1" | "timelineai-events/1",
  "payload": { … }
}
```

| Destination | Payload | What it creates |
| --- | --- | --- |
| Testora | `testora-scenarios/1`: title, summary, scenarios (ref, title, category, priority, basis, preconditions, steps, expected, evidence quotes or assumption), open questions | One requirement, suite, and fixture, plus one **pending** scaffolded case per scenario. Pending cases run and fail as stubs until automated, so nothing claims a test passed. |
| TasksAI | `tasksai-tasks/1`: title, objective, tasks (ref, title, description, provenance, evidence, rationale, effort estimate, `waitsFor` refs), risks, questions | One import job (dry run, then apply) in a chosen project. Tasks carry **no assignee and no due date**; provenance, evidence, effort, and dependencies are written into each description. |
| TimelineAI | `timelineai-events/1`: TimelineAI's own `events_extraction` payload from `@asafarim/timeline-contract`, plus title and summary | One private timeline. Exact-day dates set `startAt`; every date keeps its precision (`temporalPrecision`); citations and the uncited-inference flag stay in each description. |

The validator rejects unknown versions, dangling or self `waitsFor` refs, duplicate refs,
`assignee`/`owner`/`dueDate`/`deadline` fields, scenarios without evidence or assumption,
events without a citation or inference flag, citation URLs, and files over 512 KB. Bump the
envelope or payload version on any breaking change; destinations reject what they don't
know with a recovery message.

## States and recovery

| State | What the user sees | Recovery |
| --- | --- | --- |
| Not signed in | Destination sends them to Hub, then back to its import page | Sign in |
| Not a handoff / damaged / edited | "Nothing was imported." + reason | Export again from the tool |
| Unsupported version | Made by a newer or older tool version | Export again from the tool |
| Wrong destination | Names the app the file was made for | Import it there |
| Expired (> 7 days) | Files work for 7 days | Run the tool again and export |
| Already imported | Links to what the first import created; nothing new | — |
| Not allowed (Testora member) | Preview works; confirm needs an admin | Ask an admin |
| Destination unavailable | "Couldn't be reached; nothing was imported" | Try again later; the file stays valid until it expires |
| Wrong user | Not applicable: the file isn't a credential. A second user importing the same file creates their own copy in their own account (TimelineAI) or finds the workspace's existing import (TasksAI, Testora) | — |

## Idempotency and audit

| App | Idempotency key | Audit record |
| --- | --- | --- |
| TimelineAI | (user, handoffId) via the platform `AuditLog` (`action: workbench_import`) | `AuditLog`: actor, timeline id, handoff id and versions, source tool and version, event count, outcome. No event text. Written in the same transaction as the timeline. |
| TasksAI | (workspace, handoffId) via `ImportJob.mapping.handoffId` | `ImportJob`: actor (membership), state (outcome), handoff id and versions, source tool; activity events per created task. No task text in the audit fields. |
| Testora | Deterministic ids from the handoff id (`fr-wb-<key>`, …); a lost insert race reports "already imported" | Requirement metadata: importer, time, handoff id and versions, source tool, scenario count. |

## Threats covered

| Threat | Mitigation | Evidence |
| --- | --- | --- |
| Content leakage via URL, referrer, history, logs, analytics | No content in any URL; the import link is a fixed path; files are read in the browser and posted as JSON bodies; audit fields hold ids and counts | `handoff.test.tsx` (link has no query), destination tests (audit has no text) |
| Replay | Idempotent per handoff id; a 7-day expiry limits old files | destination tests |
| Anonymous mutation | Import pages and endpoints require a session; Testora confirm requires admin (proxy and route) | destination route code, Testora access-policy test |
| CSRF | JSON-only endpoints with same-origin checks (TimelineAI, Testora) or JSON-only plus SameSite=Lax session cookies (TasksAI) | `workbench-import.test.ts` (TimelineAI CSRF guard) |
| Open redirect | Sign-in callbacks are fixed paths built server-side | page code |
| Account switching | Nothing is bound to the Web session; the import runs as whoever is signed in to the destination at confirm time | — |
| Tampered file | Re-validated with the shared contract and the destination's own schema on preview and again on confirm; Testora scaffolds keep all text in comments or an escaped string literal | package and destination tests |

## Manual end-to-end check

Until the launch E2E suite (#684) runs the destinations, check each path by hand:

1. On `/tools/<slug>`, run the example, keep some items, and choose **Download for <app>**.
2. Choose **Open <app> import** while signed out, and confirm you land on Hub sign-in and
   come back to the import page.
3. Upload the file: the preview lists exactly the selected items. Choose **Cancel** and
   confirm nothing was created.
4. Upload again and confirm: the records appear. Upload the same file again: "already
   imported", with a link to the same records.
5. Edit the file (for example, add `"assignee": "x"` to a task) and upload: refused, and
   nothing is created.
