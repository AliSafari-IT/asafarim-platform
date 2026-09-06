# TasksAI — Design-partner beta plan (M13)

**Terms version:** `beta-terms@2026-09` · **Cohorts:** concierge, self-serve

## Enrolment & consent (enforced in code)

- Owner enrols the workspace: `POST /workspaces/{slug}/beta/enroll`
  `{ cohort, teamType, segment }`.
- Each member records consent to the current terms version:
  `POST /workspaces/{slug}/beta/consent`. `BetaConsent` is unique per
  `(workspace, member, termsVersion)`.
- `requireBetaConsent(ctx)` gates beta-only surfaces — an enrolled member
  who has not consented gets `403 { reason: "beta consent required" }`
  (integration-tested). A terms bump forces re-consent.

## Cohort

- **Concierge** (5–10 teams): fortnightly calls, observed onboarding,
  hands-on setup. `teamType` ∈ agency / consultancy / product;
  `segment` free-text for later slicing.
- **Self-serve**: enrolled, consented, instrumented, lighter touch.

## Instrumentation — `GET /workspaces/{slug}/beta/metrics`

Aggregates the KPI-dictionary numbers already instrumented across M03–M08:

| KPI | Source |
|---|---|
| Active members | `Membership` (not archived) |
| Weekly successful team | ≥3 active members **and** ≥10 completions in 7 days |
| Tasks created / completed / completion ratio | `Task` timestamps |
| Overdue open | `Task` due < now, not completed |
| Invitation acceptance | `invite.sent` vs `membership.added` activity, 30 d |
| AI acceptance rate / edit distance / trust | `copilotMetrics` (M07) |
| AI cost (month) | `usageSummary` (M06) |
| Feedback backlog / overdue | `FeedbackItem` |

Segment by `BetaEnrollment.teamType` in analysis; the endpoint is per
workspace.

## Feedback triage — `FeedbackItem`

Every item: **source** (in_app / interview / email / support / observed),
**severity**, **owner**, and a **response-SLA deadline** derived from
severity at creation (`lib/beta/sla.ts`):

| severity | respond within |
|---|---|
| blocker | 4 h |
| major | 48 h |
| minor | 7 d |
| idea | 30 d |

`PATCH /feedback/{id}` (admin+) moves state (triage → accepted →
in_progress → resolved / wont_do), assigns an owner, and records
`linkedChange` (`prompt:extract_plan@2`, `rule:signals@1`, `pr:#221`, …).
Changing severity recomputes `respondBy` from `createdAt`; resolving stamps
`respondedAt`. `slaSummary()` rolls items into a compliance rate over
closed items.

## Research artifacts (kept in `docs/research/`)

Observed-onboarding notes, workflow interviews, churn/loss reviews,
willingness-to-pay tests — from the M00 interview plan, now run against real
usage.

## Decision

`POST /workspaces/{slug}/beta/decision { decision }` records
`continue | narrow | remediate | stop` on the enrollment with a timestamp
and an audit event. The workspace-level decisions roll up into
`docs/beta-decision-report.md`.

## Showcase

The Showcase entry moves `planned → beta` with this milestone. It moves to
`live` only after the M14 launch scorecard passes.
