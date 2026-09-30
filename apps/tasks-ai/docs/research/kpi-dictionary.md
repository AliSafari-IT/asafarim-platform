# TasksAI telemetry dictionary

This public dictionary defines product and engineering metrics implemented by
the application. Customer-discovery thresholds and financial targets are not
part of this repository.

## Activation and workflow

| Metric | Definition | Unit | Source | Grain |
| --- | --- | --- | --- | --- |
| Time to first project | Signup to first `project.created` | minutes | event taxonomy | workspace |
| Time to first task | Signup to first `task.created` | minutes | event taxonomy | workspace |
| Time to first value | First workspace-day with a created task, completed task, and at least two active members | hours | task/member events | workspace |
| Task completion rate | `task.completed` divided by `task.created`, cohorted by creation week | ratio | task events | workspace |
| Overdue spillover | Overdue incomplete tasks as a share of tasks with due dates | percent | task events | workspace |
| p95 CRUD latency | 95th-percentile server time for task create/update/delete | milliseconds | route-tagged request metric | route/day |

## Collaboration and AI

| Metric | Definition | Unit | Source | Grain |
| --- | --- | --- | --- | --- |
| Invitation acceptance | Accepted invitations divided by invitations sent within 14 days | ratio | invitation events | workspace |
| Collaboration depth | Tasks with a comment or at least two actors | percent | comment/activity events | workspace |
| Proposal acceptance | Applied proposals divided by generated proposals | ratio | proposal events | workspace |
| Edit distance | Normalized difference between generated and applied proposal | 0–1 | proposal event | proposal |
| Hallucination rate | Sampled proposed facts later corrected or lacking a valid citation | percent | correction events and offline evaluation | sample |
| AI cost per active workspace | Provider spend divided by workspaces using proposals that week | currency | usage ledger | workspace/week |

## Reliability

| Metric | Definition | Unit | Source | Grain |
| --- | --- | --- | --- | --- |
| Core availability | One minus error-minutes divided by total minutes for core API routes | percent | synthetic and request metrics | service/month |
| Worker lag | Age of the oldest pending outbox event | seconds | outbox metric | service |
| Support load | Support conversations divided by weekly active workspaces | ratio | support system | week |

## Prohibited telemetry

Do not collect individual productivity scores, keystroke or mouse activity,
focus-time surveillance, emotion or sentiment analysis of individuals, or
per-employee rankings. See `../charter.md` and
`../compliance/decisions.md`.
