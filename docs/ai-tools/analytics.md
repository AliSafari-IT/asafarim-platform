# AI Workbench measurement

Part of [#682](https://github.com/AliSafari-IT/asafarim-platform/issues/682). What we measure, how, and which
decisions it informs, without sending tool content or personal data anywhere.

## Rules

- **One door.** Web code sends events only through `apps/web/lib/tools/analytics.ts`
  (`trackToolEvent`). Destination apps use `trackHandoffCompleted` from
  `@asafarim/tool-handoff`. A test fails if anything else in Web mentions Umami (the
  layout only loads the script).
- **Closed properties.** Every event has a fixed set of low-cardinality properties.
  A runtime sanitizer drops any other key and any value outside its allowlist, so input,
  output, excerpts, prompts, emails, IPs, handoff ids, and provider errors can't be sent,
  even by mistake. Tests pass all of these in and check nothing comes out.
- **No session replay, no profiling.** Umami is cookie-less; events carry no user id.
- **Automated browsers are skipped** (`navigator.webdriver`): E2E runs and most bots never
  send events. Umami also filters known bots server-side. Maintainers exclude their own
  browsers with `localStorage.setItem("umami.disabled", "1")`.

## Event dictionary: `ai-tools-events/1`

Every event carries `tool` (catalogue slug) and `tool_version` (semver). Owner: the
platform maintainer. Retention: Umami's (aggregated; no raw content ever exists to
retain). Bump the version on any change to names or properties and note it here.

| Event | Trigger | Extra properties | Decision it informs |
| --- | --- | --- | --- |
| `ai_tool_view` | Tool page mounted (once) | `lifecycle` | Reach per tool; denominator for activation. |
| `ai_tool_example_loaded` | "Load the … example" clicked | — | Whether visitors try before pasting. |
| `ai_tool_run_started` | Run clicked with valid input | `input`: `example` \| `own` | Activation: first run, own text vs example. |
| `ai_tool_run_succeeded` | Run returned a full result | `mode`: `fixture` \| `live` | Useful-result rate; keep fixture and live apart. |
| `ai_tool_run_degraded` | Run returned a partial result | `mode` | Quality: how often server checks remove items. |
| `ai_tool_run_failed` | Run ended without a result | `category`: `invalid` \| `rate_limited` \| `quota` \| `unavailable` \| `paused` \| `failed` | Friction vs limits vs outages. |
| `ai_tool_result_edited` | First edit of each kind per result | `action`: `edit` \| `remove` \| `reorder` \| `select` \| `dependency` \| `status` \| `conflict` \| `undo` | Whether people review rather than accept blindly. |
| `ai_tool_exported` | Markdown or JSON downloaded | `format`: `markdown` \| `json` | Useful-action rate. |
| `ai_tool_handoff_started` | "Download for <app>" clicked | `destination`: `testora` \| `tasksai` \| `timelineai` | Intent to continue in a full app. |
| `ai_tool_handoff_completed` | Import confirmed and records created (TimelineAI, Testora) | `destination` | Handoff completion. TasksAI doesn't load analytics, so its completions are counted from import jobs instead (see below). |
| `ai_tool_case_study_opened` | "See how it was built" followed | — | Portfolio engagement. |
| `ai_tool_contact_opened` | "Discuss this kind of system" followed | — | Qualified conversion (a signal, not proof of hiring intent). |

## Funnels (per tool and version)

```
view → run_started → run_succeeded|run_degraded → result_edited → exported|handoff_started → case_study_opened → contact_opened
```

Always split by `mode`: a **fixture** success is a prepared example, not a result for the
visitor's text. Report fixture and live funnels separately and never add them together.

Derived measures:

- **Activation** = runs started ÷ views.
- **Useful-result rate** = (succeeded + degraded) ÷ runs started, by mode.
- **Useful-action rate** = (exported + handoff started) ÷ (succeeded + degraded).
- **Failure mix** = `run_failed` by category.
- **Handoff completion** = completed ÷ started, by destination (TasksAI from its import jobs).
- **Qualified conversion** = contact opened ÷ views.

## Operational usage and cost (server-side, no joins to analytics)

Live-run volume and spend come from the cost ledger, never from analytics, and are never
joined to analytics records:

```sql
-- Live runs and estimated spend per tool, outcome, and day (platform DB).
SELECT operation AS tool, outcome, date_trunc('day', "occurredAt") AS day,
       count(*) AS runs, sum("estimatedCostMicros") / 1e6 AS usd
FROM "WebToolCostEvent"
WHERE fixture = false
GROUP BY 1, 2, 3 ORDER BY 3 DESC, 1, 2;
```

**Cost per successful run** = spend on `succeeded` + `degraded` + `failed` attempts ÷
(succeeded + degraded) live runs, from the same query. TasksAI handoff completions:
`import_job` rows with `mapping->>'sourceTool'` set and `state = 'completed'`.

## Baseline and launch annotations

Before a tool moves to beta:

1. Search Console (`asafarim.com`): export 28 days of non-brand queries (exclude
   "asafarim"), impressions, and clicks for the whole site and `/tools/*`, and save them
   with the date.
2. Umami: note 28-day visits for `/`, `/tools`, and the Showcase domain.
3. At launch, add an annotation (Search Console and the review sheet) with the date, the
   tool, and its lifecycle change.

## 30/60/90-day review template

Copy for each tool at 30, 60, and 90 days after it goes beta:

| Measure | Fixture | Live | Target / note |
| --- | --- | --- | --- |
| Views | | | |
| Activation (runs ÷ views) | | | |
| Useful-result rate | | | Live: ≥ 80% |
| Degraded share of results | | | Rising = quality regression; run the eval |
| Failure mix (top category) | | | |
| Useful-action rate (export + handoff ÷ results) | | | ≥ 30% |
| Handoff completion (by destination) | — | | |
| Cost per successful live run | — | | Within the tool's cost ceiling |
| Organic discovery (Search Console clicks to the page) | | | vs baseline |
| Qualified conversion (contact ÷ views) | | | Signal, not proof |
| Decision | | | Keep / improve / pause / retire |

## Adding a fourth tool

Don't decide from page views. Build another tool only when, for at least two of the three
MVP tools over 60 days of beta:

- live useful-action rate is at or above 30%,
- the degraded share is stable or falling, and the eval gate stays green,
- cost per successful live run stays within its ceiling, and
- there's organic discovery beyond the baseline, or handoffs complete in the full apps.

Otherwise, improve the existing tools first.
