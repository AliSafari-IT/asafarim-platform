# TasksAI — Event Taxonomy (M00)

**Status:** Approved at M00 sign-off · **Date:** 2026-09-06 · **Owner:** Ali Safari / ASafarIM

Canonical event names and payload shapes. Feeds `ActivityEvent`, `AuditEvent`, and `OutboxEvent` ([ADR-0005](../adr/0005-event-outbox-strategy.md)) and the KPI dictionary. Implemented as typed constants + Zod schemas in `lib/events/*` starting M02.

## Naming rules

- Format: `noun.verb_past` — lowercase, dot-separated, verb in past tense. e.g. `task.created`, `invite.accepted`.
- One event = one fact. No compound events.
- Every payload includes the **envelope** below; event-specific fields go under `data`.
- Payloads are versioned with `v` (integer, starts at 1). Additive fields do not bump `v`. Removing/retyping a field bumps `v`; consumers skip unknown higher `v`.

## Envelope (all events)

```jsonc
{
  "id": "evt_...",              // ULID
  "v": 1,
  "name": "task.created",
  "occurredAt": "2026-09-06T10:00:00Z",
  "workspaceId": "ws_...",       // null only for pre-workspace events (auth)
  "actor": { "type": "user|system|automation|ai", "id": "usr_...", "onBehalfOf": null },
  "target": { "type": "task", "id": "tsk_..." },
  "correlationId": "req_...",     // request or job id
  "data": { /* event-specific */ }
}
```

`actor.onBehalfOf` is set when `type = ai` or `automation` (e.g. `{ "promptVersion": "decompose@3", "model": "fixture" }`).

## Event catalog (initial)

### Identity / auth → `AuditEvent`
| Name | data | Notes |
|---|---|---|
| `auth.session_started` | `{ method }` | platform SSO round trip |
| `auth.session_revoked` | `{ reason }` | M12 |
| `member.role_changed` | `{ from, to, projectId? }` | audit + activity |
| `member.active` | `{}` | derived daily marker for KPIs (not stored as row; computed) |

### Workspace / membership
| Name | data |
|---|---|
| `workspace.created` | `{ name, plan }` |
| `workspace.archived` | `{}` |
| `invite.sent` | `{ email_hash, role, projectId? }` |
| `invite.accepted` | `{ inviteId }` |
| `invite.revoked` | `{ inviteId }` |
| `membership.added` | `{ userId, role }` |
| `membership.removed` | `{ userId }` |
| `ownership.transferred` | `{ from, to }` |

### Project / structure
| Name | data |
|---|---|
| `project.created` / `project.updated` / `project.archived` | `{ changed: [...] }` |
| `goal.created` / `goal.updated` | (M10) |
| `cycle.created` / `cycle.closed` | (M10) |
| `view.created` / `view.updated` / `view.opened` | `{ viewType }` |

### Task lifecycle
| Name | data |
|---|---|
| `task.created` | `{ projectId, parentId?, source: "manual|quick_capture|import|proposal" }` |
| `task.updated` | `{ changed: ["title"|"status"|"assignee"|"dueDate"|...] }` |
| `task.status_changed` | `{ from, to }` |
| `task.assigned` / `task.unassigned` | `{ userId }` |
| `task.completed` | `{}` |
| `task.reopened` | `{}` |
| `task.due_passed` | `{ dueDate }` — emitted by a scheduled worker sweep |
| `task.deleted` / `task.restored` | `{}` (soft) |
| `dependency.linked` / `dependency.unlinked` | `{ fromId, toId, kind: "blocks|relates|duplicates" }` |
| `task.bulk_updated` | `{ count, changed }` |

### Collaboration (M04)
| Name | data |
|---|---|
| `comment.created` / `comment.edited` / `comment.deleted` | `{ mentions: [...] }` |
| `reaction.added` / `reaction.removed` | `{ emoji }` |
| `attachment.added` / `attachment.removed` | `{ contentType, size }` |
| `watch.started` / `watch.stopped` | `{}` |
| `notification.enqueued` / `notification.delivered` / `notification.suppressed` | `{ channel, reason? }` → outbox |
| `activity.actor_seen` | derived, for collaboration-depth KPI |

### Search / capture / portability (M05)
| Name | data |
|---|---|
| `search.performed` | `{ scope, resultCount, latencyMs }` |
| `capture.received` | `{ source: "web|email", provenanceOk }` |
| `import.started` / `import.row_failed` / `import.completed` | `{ format, counts }` |
| `export.generated` | `{ format, entityCounts }` → audit |
| `workspace.deletion_requested` / `workspace.deleted` | `{}` → audit |

### AI (M06–M08)
| Name | data |
|---|---|
| `proposal.generated` | `{ kind, opCount, provider, promptVersion, cost, latencyMs }` |
| `proposal.previewed` | `{ proposalId }` |
| `proposal.applied` | `{ proposalId, acceptedOps, editedOps, editDistance, timeSavedEstimate }` → audit |
| `proposal.partially_applied` | `{ proposalId, appliedOps, skippedOps }` |
| `proposal.rejected` | `{ proposalId, reason? }` |
| `proposal.undone` | `{ proposalId }` → audit |
| `proposal.fact_corrected` | `{ proposalId, field }` |
| `ai.quota_exceeded` / `ai.kill_switch_toggled` | `{ scope }` → audit |
| `signal.shown` / `signal.overridden` / `signal.disabled` | `{ signalType, ruleVersion }` (M08) |
| `survey.trust` | `{ score }` |

### Automations / API (M09)
| Name | data |
|---|---|
| `rule.created` / `rule.activated` / `rule.paused` | `{ ruleId }` |
| `rule.run_started` / `rule.run_succeeded` / `rule.run_failed` | `{ ruleId, runId, error? }` |
| `apitoken.issued` / `apitoken.revoked` | `{ scopes }` → audit |
| `webhook.delivered` / `webhook.failed` | `{ endpointId, status }` |
| `integration.synced` | `{ provider, direction, counts }` |

### Platform
| Name | data |
|---|---|
| `api.request` | `{ route, method, status, latencyMs }` — metrics only, not stored as `ActivityEvent` |
| `outbox.dead_lettered` | `{ type, attempts }` → audit + alert |

## Retention (stub, finalized M12)

- `ActivityEvent`: workspace-configurable, default 24 months, then archive.
- `AuditEvent`: 24 months minimum, security events 7 years where legally required.
- `OutboxEvent`: 30 days after `done`, then purge; dead-letter kept 90 days.
