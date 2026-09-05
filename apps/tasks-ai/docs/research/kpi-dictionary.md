# TasksAI — KPI Dictionary (M00)

**Status:** Approved at M00 sign-off · **Date:** 2026-09-06 · **Owner:** Ali Safari / ASafarIM

Each KPI has: definition, unit, source event(s) (see [event-taxonomy.md](event-taxonomy.md)), grain, and owner. These are the only metrics the product commits to instrument; anything else is exploratory. Thresholds marked *(M13)* are set before the design-partner beta, not now.

## Activation & time-to-value

| KPI | Definition | Unit | Source events | Grain | Owner |
|---|---|---|---|---|---|
| Time to first project | Signup → first `project.created` in the workspace | minutes | `workspace.created`, `project.created` | workspace | Product |
| Time to first task | Signup → first `task.created` | minutes | `workspace.created`, `task.created` | workspace | Product |
| Time to first value (TTFV) | Signup → first workspace-day with ≥1 `task.created` **and** ≥1 `task.completed` **and** ≥2 active members | hours | `task.created`, `task.completed`, `member.active` | workspace | Product |
| Activation rate | % of new workspaces reaching TTFV within 7 days | % | as above | cohort | Product |

## Engagement & workflow value

| KPI | Definition | Unit | Source events | Grain | Owner |
|---|---|---|---|---|---|
| Weekly successful teams | Workspaces with ≥3 active members and ≥10 `task.completed` in a rolling 7-day window | count | `member.active`, `task.completed` | workspace/week | Product |
| Task completion rate | `task.completed` ÷ `task.created` over period (cohorted by create week) | ratio | `task.created`, `task.completed` | workspace | Product |
| Overdue spillover | Tasks whose `dueDate` passed while `status != done`, as % of tasks with due dates | % | `task.due_passed`, `task.completed` | workspace | Product |
| Cross-view usage | Distinct saved-view types opened per active member per week | count | `view.opened` | member/week | Product |
| p95 CRUD latency | 95th percentile server time for task create/update/delete | ms | `api.request` (route-tagged) | route/day | Eng |

## Collaboration

| KPI | Definition | Unit | Source events | Grain | Owner |
|---|---|---|---|---|---|
| Invitation acceptance | `invite.accepted` ÷ `invite.sent` within 14 days | ratio | `invite.sent`, `invite.accepted` | workspace | Product |
| Collaboration depth | % of tasks with ≥1 comment or ≥2 distinct actors in activity | % | `comment.created`, `activity.actor_seen` | workspace | Product |

## AI (from M06)

| KPI | Definition | Unit | Source events | Grain | Owner |
|---|---|---|---|---|---|
| Proposal acceptance rate | `proposal.applied` ÷ `proposal.generated` | ratio | `proposal.generated`, `proposal.applied`, `proposal.rejected` | workspace | AI |
| Edit distance | Normalized diff between generated Proposal and applied Proposal (0 = applied as-is) | 0–1 | `proposal.applied` (payload) | proposal | AI |
| Hallucination rate | % of applied proposed facts later corrected or with broken/absent citation, sampled | % | `proposal.fact_corrected`, offline eval | sample | AI |
| Time saved (self-report) | User estimate at apply time, plus modeled estimate | minutes | `proposal.applied` (survey) | proposal | AI |
| AI cost per active workspace | Provider spend ÷ workspaces with ≥1 proposal that week | € | usage ledger | workspace/week | AI |
| Trust rating | Periodic 1–5 in-product prompt: "I trust TasksAI's suggestions" | 1–5 | `survey.trust` | member | AI |

## Reliability & economics

| KPI | Definition | Unit | Source events | Grain | Owner |
|---|---|---|---|---|---|
| Core availability | 1 − (error-minutes ÷ total minutes) for `/api/v1` core routes | % | synthetic + `api.request` | service/month | Eng |
| Worker lag | Age of oldest `pending` `OutboxEvent` | seconds | outbox poll metric | service | Eng |
| Support load | Support conversations ÷ weekly active workspaces | ratio | support system | week | Ops |
| Gross margin (from M14) | (Revenue − provider/infra COGS) ÷ Revenue | % | billing + usage ledger | month | Finance |

## Anti-metrics (explicitly not tracked)

Individual productivity scores, keystroke/mouse activity, "focus time" surveillance, emotion/sentiment of individuals, any per-employee ranking. Prohibited by [charter.md](../charter.md) §5 and [compliance/decisions.md](../compliance/decisions.md).
