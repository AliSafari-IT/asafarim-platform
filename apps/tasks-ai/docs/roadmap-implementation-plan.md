# TasksAI technical delivery map

This public map explains how the implemented system is organized for
contributors. It excludes confidential roadmap dates, customer validation,
commercial launch gates, and pricing decisions.

## Delivery conventions

Every change must keep lint, type checking, unit tests, relevant integration
tests, and migration checks green. Database changes are additive where
possible. User-facing launch claims must follow observable shipped behavior.

## Technical workstreams

1. **Foundation:** isolated database, health checks, CI, deployable web and
   worker images, and authenticated app registration.
2. **Work graph:** tenant-scoped workspaces, projects, tasks, statuses,
   dependencies, memberships, authorization, and versioned API resources.
3. **Task experience:** capture, list, board, calendar, filters, bulk actions,
   keyboard behavior, and accessible interaction.
4. **Collaboration:** comments, activity, notifications, realtime updates, and
   attachment controls.
5. **Search and portability:** inbox capture, search, import, export, and data
   portability.
6. **AI boundary:** provider abstraction, deterministic fixtures, evaluations,
   budgets, kill switch, citations, proposal diffs, and incident handling.
7. **Copilot and intelligence:** intent-to-plan proposals, explainable focus,
   risk, and workload summaries that never apply silently.
8. **Automations and integrations:** rules engine, scoped API tokens, webhooks,
   and connector boundaries.
9. **Planning and analytics:** goals, cycles, time, and portfolio views.
10. **Quality and operations:** PWA, accessibility, localization, performance,
    security, privacy, administration, observability, backup, and recovery.

## Normative documents

The ADRs define architecture decisions. Feature documents under `docs/`
define current behavior. `security-privacy.md`, `ai-boundary.md`,
`ai-incident-playbook.md`, `performance-budgets.md`, and `deploy-plan.md`
define operational constraints contributors must preserve.
